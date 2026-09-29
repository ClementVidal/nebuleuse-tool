import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  getViewportForBounds,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnConnectEnd,
  type OnDelete,
  type Viewport,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { createAlias, createEdge, createMapRef, createNode, deleteEdges, deleteNodes, restack, saveViewport, setBookmarked, updateNodePositions } from '@/db/actions'
import { DEFAULT_NODE_SIZE, MAP_CARD_SIZE } from '@/db/defaults'
import { colorCss, dimmedColorCss } from '@/db/palette'
import { record } from '@/db/history'
import {
  type MapCardInfo,
  type TimelineEntry,
  useAliasTargets,
  useChildMapSizes,
  useLinkTemplateMap,
  useMapCardTargets,
  useMapEdges,
  useMapNodes,
  useReferenceableMaps,
  useReusableNodes,
  useTimelines,
} from '@/db/hooks'
import type { IdeaNode, NodeTemplate, ReflexionMap } from '@/db/types'
import { cn } from '@/lib/utils'
import { AddIdeaMenu } from './add-idea-menu'
import { EdgePanel } from './edge-panel'
import { center } from './geometry'
import { IdeaNodeComponent, type IdeaFlowNode } from './idea-node'
import { CanvasToolbar } from './canvas-toolbar'
import { setCanvasLocked, useCanvasLocked } from './lock-store'
import { onMapCommand } from './map-commands'
import { MapContext, type MapActions } from './map-context'
import { IdeaDocument, type DocumentMode } from './idea-document'
import { NodeSettingsSheet } from './node-settings-sheet'
import { templateStyle } from './node-style'
import { LinkEdgeComponent, type LinkFlowEdge } from './link-edge'
import { findNeighbor, placeBeside, type Direction } from './spatial-nav'

const nodeTypes = { idea: IdeaNodeComponent }
const edgeTypes = { link: LinkEdgeComponent }

const ARROW_KEYS: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

const EMPTY_TIMELINES = new Map<string, TimelineEntry[]>()
const EMPTY_TARGETS = new Map<string, IdeaNode>()
const EMPTY_CARDS = new Map<string, MapCardInfo>()

interface MapCanvasProps {
  map: ReflexionMap
  templates: NodeTemplate[]
  /** Template of the last idea created from the canvas (used by Tab, "linked idea"). */
  activeTemplateId: string | undefined
  /** Node to select when the map opens (e.g. the node we just came back from). */
  focusNodeId: string | undefined
  onOpenNode: (nodeId: string) => void
  /** Go to another map (a map card was opened). */
  onOpenMap: (mapId: string) => void
  onNavigateUp: (() => void) | undefined
  /** An idea was created with this template (remembered for Tab). */
  onTemplateUsed: (templateId: string) => void
  /**
   * Called once `focusNodeId` has been revealed, so the page can drop it from the URL:
   * going back to this map then restores the last view instead of re-centering.
   */
  onFocusConsumed: () => void
  /** Label of this map (owner idea title, or project name), shown in the reader. */
  mapLabel: string
}

export function MapCanvas({
  map,
  templates,
  activeTemplateId,
  focusNodeId,
  onOpenNode,
  onOpenMap,
  onNavigateUp,
  onTemplateUsed,
  onFocusConsumed,
  mapLabel,
}: MapCanvasProps) {
  const rf = useReactFlow<IdeaFlowNode, LinkFlowEdge>()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const dbNodes = useMapNodes(map.id)
  const dbEdges = useMapEdges(map.id)
  const aliasTargets = useAliasTargets(dbNodes)
  const reusable = useReusableNodes(map.projectId)
  const referenceableMaps = useReferenceableMaps(map.projectId)
  const mapCards = useMapCardTargets(dbNodes)
  const linkTemplates = useLinkTemplateMap(map.projectId)
  // Child map sizes of the ideas shown here, originals of aliases included (for the depth arrows).
  const shownIdeas = useMemo(() => [...(dbNodes ?? []), ...(aliasTargets?.values() ?? [])], [dbNodes, aliasTargets])
  const childMapSizes = useChildMapSizes(shownIdeas)
  const timelines = useTimelines(map.projectId)
  const locked = useCanvasLocked()
  const [nodes, setNodes] = useState<IdeaFlowNode[]>([])
  const [edges, setEdges] = useState<LinkFlowEdge[]>([])
  /** Idea open in the full-page reader / editor. */
  const [doc, setDoc] = useState<{ id: string; mode: DocumentMode }>()
  const [settingsNodeId, setSettingsNodeId] = useState<string>()
  const [deleteRequestId, setDeleteRequestId] = useState<string>()
  /** Add menu opened by a click on the empty canvas: where (inside the canvas) and at which flow point. */
  const [addMenu, setAddMenu] = useState<{ at: { x: number; y: number }; bounds: { width: number; height: number }; flow: { x: number; y: number } }>()
  /** Node whose click menu is open. */
  const [menuNodeId, setMenuNodeId] = useState<string>()
  /** Node to select once it shows up from the database (after creation / on open). */
  const pendingSelection = useRef<string | undefined>(focusNodeId)
  const lastPointerType = useRef<string>('mouse')
  /** Link to select once it shows up from the database (right after drawing it). */
  const pendingEdgeSelection = useRef<string | undefined>(undefined)
  /** Link just drawn: its label field gets the focus so it can be named right away. */
  const [freshEdgeId, setFreshEdgeId] = useState<string>()
  /** A link is being drawn (highlights drop targets, see .is-connecting in index.css). */
  const [connecting, setConnecting] = useState(false)

  // --- Database -> React Flow state. Previous node objects are spread first so React Flow's
  // own state (measured size, selection, drag/resize flags) survives: it doesn't re-measure
  // a node whose DOM size is unchanged, and edges need that measurement to render.
  useEffect(() => {
    if (!dbNodes) return
    const toSelect = dbNodes.some((n) => n.id === pendingSelection.current) ? pendingSelection.current : undefined
    if (toSelect) pendingSelection.current = undefined
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]))
      return dbNodes.map((model): IdeaFlowNode => {
        const p = prevById.get(model.id)
        const busy = p && (p.dragging || p.resizing)
        return {
          ...p,
          id: model.id,
          type: 'idea',
          data: { model },
          position: busy ? p.position : { x: model.x, y: model.y },
          width: busy ? p.width : model.width,
          height: busy ? p.height : model.height,
          zIndex: model.z ?? 0,
          selected: toSelect ? model.id === toSelect : (p?.selected ?? false),
        }
      })
    })
  }, [dbNodes])

  useEffect(() => {
    if (!dbEdges) return
    const toSelect = dbEdges.some((e) => e.id === pendingEdgeSelection.current) ? pendingEdgeSelection.current : undefined
    if (toSelect) pendingEdgeSelection.current = undefined
    setEdges((prev) => {
      const prevById = new Map(prev.map((e) => [e.id, e]))
      return dbEdges.map((model): LinkFlowEdge => {
        const p = prevById.get(model.id)
        return {
          ...p,
          id: model.id,
          type: 'link',
          source: model.source,
          target: model.target,
          data: { model },
          selected: toSelect ? model.id === toSelect : (p?.selected ?? false),
        }
      })
    })
  }, [dbEdges])

  // --- React Flow -> database
  const onNodesChange = useCallback((changes: NodeChange<IdeaFlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current))
  }, [])

  const onNodeDragStop = useCallback((_: unknown, __: IdeaFlowNode, dragged: IdeaFlowNode[]) => {
    void updateNodePositions(dragged.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y })))
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange<LinkFlowEdge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current))
  }, [])

  const onDelete: OnDelete<IdeaFlowNode, LinkFlowEdge> = useCallback(({ nodes: deletedNodes, edges: deletedEdges }) => {
    void record(async () => {
      if (deletedNodes.length) await deleteNodes(deletedNodes.map((n) => n.id))
      if (deletedEdges.length) await deleteEdges(deletedEdges.map((e) => e.id))
    })
  }, [])

  /** Select a single link (its style panel opens when the canvas is unlocked). */
  const selectEdge = useCallback(
    (edgeId: string) => {
      setMenuNodeId(undefined)
      setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)))
      // Not in React Flow yet (just created): selected when it arrives from the database.
      if (!rf.getEdge(edgeId)) pendingEdgeSelection.current = edgeId
      setEdges((es) => es.map((e) => ({ ...e, selected: e.id === edgeId })))
    },
    [rf],
  )

  const connect = useCallback(
    async (source: string, target: string) => {
      if (source === target) return
      const edge = await createEdge({ projectId: map.projectId, mapId: map.id, source, target })
      setFreshEdgeId(edge.id)
      selectEdge(edge.id)
    },
    [map.projectId, map.id, selectEdge],
  )

  const onConnect = useCallback((connection: Connection) => void connect(connection.source, connection.target), [connect])

  const onMoveEnd = useCallback((_: unknown, viewport: Viewport) => void saveViewport(map.id, viewport), [map.id])

  // --- Creation helpers
  const addNode = useCallback(
    async (position: { x: number; y: number }, linkFrom?: string, templateId = activeTemplateId) => {
      if (!templateId) return
      const node = await record(async () => {
        const created = await createNode({ projectId: map.projectId, mapId: map.id, templateId, ...position })
        if (linkFrom) await createEdge({ projectId: map.projectId, mapId: map.id, source: linkFrom, target: created.id })
        return created
      })
      pendingSelection.current = node.id
      setDoc({ id: node.id, mode: 'edit' })
    },
    [activeTemplateId, map.projectId, map.id],
  )

  const addNodeAtScreen = useCallback(
    (clientX: number, clientY: number, templateId?: string) => {
      const p = rf.screenToFlowPosition({ x: clientX, y: clientY })
      let x = p.x - DEFAULT_NODE_SIZE.width / 2
      let y = p.y - DEFAULT_NODE_SIZE.height / 2
      // Keep the new node fully inside the visible area (matters on small screens).
      const r = wrapperRef.current?.getBoundingClientRect()
      if (r) {
        const margin = 12
        const min = rf.screenToFlowPosition({ x: r.left + margin, y: r.top + margin })
        const max = rf.screenToFlowPosition({ x: r.right - margin, y: r.bottom - margin })
        x = Math.max(min.x, Math.min(x, max.x - DEFAULT_NODE_SIZE.width))
        y = Math.max(min.y, Math.min(y, max.y - DEFAULT_NODE_SIZE.height))
      }
      void addNode({ x, y }, undefined, templateId)
    },
    [rf, addNode],
  )

  /**
   * A link dropped elsewhere than on a grip: onto an idea links to it, onto empty space creates
   * a linked idea there (the editor opens).
   */
  const onConnectEnd: OnConnectEnd = useCallback(
    (event, state) => {
      setConnecting(false)
      if (state.isValid || !state.fromNode) return
      const point = 'changedTouches' in event ? event.changedTouches[0] : event
      if (!point) return
      const target = document.elementFromPoint(point.clientX, point.clientY)
      const targetId = target?.closest('.react-flow__node')?.getAttribute('data-id')
      if (targetId) void connect(state.fromNode.id, targetId)
      else if (target?.classList.contains('react-flow__pane')) {
        // New idea on the side the link was dragged to, its near edge at the drop point, and
        // never overlapping the source idea.
        const from = state.fromNode
        const src = { ...from.internals.positionAbsolute, width: from.measured.width ?? 0, height: from.measured.height ?? 0 }
        const c = center(src)
        const drop = rf.screenToFlowPosition({ x: point.clientX, y: point.clientY })
        const { width: w, height: h } = DEFAULT_NODE_SIZE
        const gap = 48
        const dx = (drop.x - c.x) / Math.max(1, src.width)
        const dy = (drop.y - c.y) / Math.max(1, src.height)
        const position =
          Math.abs(dx) > Math.abs(dy)
            ? dx > 0
              ? { x: Math.max(drop.x, src.x + src.width + gap), y: drop.y - h / 2 }
              : { x: Math.min(drop.x, src.x - gap) - w, y: drop.y - h / 2 }
            : dy > 0
              ? { x: drop.x - w / 2, y: Math.max(drop.y, src.y + src.height + gap) }
              : { x: drop.x - w / 2, y: Math.min(drop.y, src.y - gap) - h }
        void addNode(position, from.id)
      }
    },
    [connect, addNode, rf],
  )

  /** The idea whose content a node shows: itself, or the original of an alias. */
  const contentId = useCallback((nodeId: string) => dbNodes?.find((n) => n.id === nodeId)?.aliasOf ?? nodeId, [dbNodes])
  const contentOf = useCallback(
    (nodeId: string): IdeaNode | undefined => {
      const node = dbNodes?.find((n) => n.id === nodeId)
      return node?.aliasOf ? aliasTargets?.get(node.aliasOf) : node
    },
    [dbNodes, aliasTargets],
  )
  /** Title shown for a node: its own, its original's (alias) or its map's (map card). */
  const titleOf = useCallback(
    (nodeId: string) => {
      const node = dbNodes?.find((n) => n.id === nodeId)
      if (node?.mapRef) return mapCards?.get(node.mapRef)?.name
      return contentOf(nodeId)?.title
    },
    [dbNodes, mapCards, contentOf],
  )
  /** The map a map card stands for (undefined for an idea). */
  const mapRefOf = useCallback((nodeId: string) => dbNodes?.find((n) => n.id === nodeId)?.mapRef, [dbNodes])
  /** Enter a node: an idea's own map, or the map a card stands for. */
  const exploreNode = useCallback(
    (nodeId: string) => {
      const mapRef = mapRefOf(nodeId)
      if (mapRef) onOpenMap(mapRef)
      else onOpenNode(contentId(nodeId))
    },
    [onOpenNode, onOpenMap, contentId, mapRefOf],
  )

  const openAddMenu = useCallback(
    (clientX: number, clientY: number) => {
      const r = wrapperRef.current?.getBoundingClientRect()
      if (!r) return
      setMenuNodeId(undefined)
      setAddMenu({ at: { x: clientX - r.left, y: clientY - r.top }, bounds: { width: r.width, height: r.height }, flow: rf.screenToFlowPosition({ x: clientX, y: clientY }) })
    },
    [rf],
  )

  const createFromMenu = useCallback(
    (templateId: string) => {
      if (!addMenu) return
      setAddMenu(undefined)
      onTemplateUsed(templateId)
      void addNode({ x: addMenu.flow.x - DEFAULT_NODE_SIZE.width / 2, y: addMenu.flow.y - 40 }, undefined, templateId)
    },
    [addMenu, addNode, onTemplateUsed],
  )

  const aliasFromMenu = useCallback(
    async (targetId: string) => {
      if (!addMenu) return
      setAddMenu(undefined)
      const alias = await createAlias({ mapId: map.id, targetId, x: addMenu.flow.x - DEFAULT_NODE_SIZE.width / 2, y: addMenu.flow.y - 40 })
      if (alias) pendingSelection.current = alias.id
    },
    [addMenu, map.id],
  )

  const mapCardFromMenu = useCallback(
    async (targetMapId: string) => {
      if (!addMenu) return
      setAddMenu(undefined)
      const card = await createMapRef({
        mapId: map.id,
        targetMapId,
        x: addMenu.flow.x - MAP_CARD_SIZE.width / 2,
        y: addMenu.flow.y - 40,
      })
      if (card) pendingSelection.current = card.id
    },
    [addMenu, map.id],
  )

  const viewportCenterScreen = useCallback(() => {
    const r = wrapperRef.current?.getBoundingClientRect()
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 }
  }, [])

  // Commands from the command palette.
  useEffect(
    () =>
      onMapCommand((command) => {
        if (command.type === 'navigate-up') onNavigateUp?.()
        if (command.type === 'create-node' && !locked) {
          const c = viewportCenterScreen()
          addNodeAtScreen(c.x, c.y, command.templateId)
        }
      }),
    [onNavigateUp, viewportCenterScreen, addNodeAtScreen, locked],
  )

  // --- Selection helpers
  /**
   * Fits a node in the view, with a margin all around so the links leaving it stay visible, plus
   * room below for the click menu and on the right for the depth arrows. Zooms out as needed,
   * never zooms in past max(current zoom, 1). With `onlyIfNeeded` (keyboard navigation), the
   * view doesn't move when the node already fits.
   */
  const revealNode = useCallback(
    (nodeId: string, { onlyIfNeeded = false }: { onlyIfNeeded?: boolean } = {}) => {
      const node = rf.getInternalNode(nodeId)
      const wrapper = wrapperRef.current?.getBoundingClientRect()
      if (!node?.measured.width || !wrapper) return
      const rect = { ...node.internals.positionAbsolute, width: node.measured.width, height: node.measured.height ?? 0 }
      const mx = Math.min(96, wrapper.width * 0.12)
      const my = Math.min(96, wrapper.height * 0.1)
      // Room below for the click menu, on the right for the depth arrows.
      const area = { left: mx, top: my, right: wrapper.width - mx - 36, bottom: wrapper.height - my - 52 }
      const { x: vx, y: vy, zoom: current } = rf.getViewport()
      if (onlyIfNeeded) {
        const left = rect.x * current + vx
        const top = rect.y * current + vy
        const fits =
          left >= area.left && top >= area.top && left + rect.width * current <= area.right && top + rect.height * current <= area.bottom
        if (fits) return
      }
      const fitZoom = Math.min((area.right - area.left) / rect.width, (area.bottom - area.top) / rect.height)
      const zoom = Math.max(0.1, Math.min(fitZoom, Math.max(current, 1)))
      const c = center(rect)
      void rf.setViewport(
        { x: (area.left + area.right) / 2 - c.x * zoom, y: (area.top + area.bottom) / 2 - c.y * zoom, zoom },
        { duration: 350 },
      )
    },
    [rf],
  )

  const selectOnly = useCallback(
    (nodeId: string, options: { onlyIfNeeded?: boolean } = {}) => {
      setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === nodeId })))
      setEdges((es) => es.map((e) => (e.selected ? { ...e, selected: false } : e)))
      revealNode(nodeId, options)
    },
    [revealNode],
  )

  /**
   * Click on a link: go to the idea at its other end — the end that isn't selected, or else the
   * end farther from the click.
   */
  const followEdge = useCallback(
    (edgeId: string, clientPoint?: { x: number; y: number }) => {
      const edge = edges.find((e) => e.id === edgeId)
      if (!edge) return
      const selected = new Set(nodes.filter((n) => n.selected).map((n) => n.id))
      let to = edge.target
      if (selected.has(edge.target) && !selected.has(edge.source)) to = edge.source
      else if (!selected.has(edge.source) && clientPoint) {
        const p = rf.screenToFlowPosition(clientPoint)
        const dist = (id: string) => {
          const n = rf.getInternalNode(id)
          if (!n) return 0
          const c = center({ ...n.internals.positionAbsolute, width: n.measured.width ?? 0, height: n.measured.height ?? 0 })
          return Math.hypot(c.x - p.x, c.y - p.y)
        }
        to = dist(edge.source) > dist(edge.target) ? edge.source : edge.target
      }
      setMenuNodeId(undefined)
      selectOnly(to)
    },
    [edges, nodes, rf, selectOnly],
  )

  // Select and reveal the focused node (from the URL) once React Flow has measured it.
  const focusDone = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!focusNodeId || focusDone.current === focusNodeId) return
    if (!rf.getInternalNode(focusNodeId)?.measured.width) return
    focusDone.current = focusNodeId
    selectOnly(focusNodeId)
    onFocusConsumed()
  }, [focusNodeId, nodes, rf, selectOnly, onFocusConsumed])

  // When the map opens with none of its ideas in view (saved view from another screen size, or
  // panned far away), fit the view to its content so opening a map never shows an empty screen.
  const openCheckDone = useRef(false)
  useEffect(() => {
    if (openCheckDone.current || focusNodeId || !dbNodes) return
    if (dbNodes.length === 0) {
      openCheckDone.current = true
      return
    }
    const internals = dbNodes.map((n) => rf.getInternalNode(n.id))
    if (internals.some((n) => !n?.measured.width)) return // wait until every node is measured
    openCheckDone.current = true
    const wrapper = wrapperRef.current?.getBoundingClientRect()
    if (!wrapper) return
    const { x, y, zoom } = rf.getViewport()
    const inView = internals.some((n) => {
      const left = n!.internals.positionAbsolute.x * zoom + x
      const top = n!.internals.positionAbsolute.y * zoom + y
      return left < wrapper.width && left + n!.measured.width! * zoom > 0 && top < wrapper.height && top + n!.measured.height! * zoom > 0
    })
    if (!inView) {
      const bounds = rf.getNodesBounds(dbNodes.map((n) => n.id))
      void rf.setViewport(getViewportForBounds(bounds, wrapper.width, wrapper.height, 0.1, 1, 0.2))
    }
  }, [nodes, dbNodes, focusNodeId, rf])

  // Focus requests for a node of this map (bookmarks, search) when the URL doesn't change.
  useEffect(
    () =>
      onMapCommand((command) => {
        if (command.type === 'focus-node') selectOnly(command.nodeId)
      }),
    [selectOnly],
  )

  /** Double-click / double-tap on a node: the reader when locked, the editor when unlocked. */
  const openDocument = useCallback(
    (nodeId: string) => {
      setMenuNodeId(undefined)
      // A map card has no page: it opens its map.
      const mapRef = mapRefOf(nodeId)
      if (mapRef) onOpenMap(mapRef)
      else setDoc({ id: contentId(nodeId), mode: locked ? 'read' : 'edit' })
    },
    [locked, contentId, mapRefOf, onOpenMap],
  )

  const requestDelete = useCallback(
    (nodeId: string) => {
      const node = dbNodes?.find((n) => n.id === nodeId)
      const size = node?.childMapId ? (childMapSizes?.get(node.childMapId) ?? 0) : 0
      // Deleting an idea whose map has content deserves a confirmation; otherwise undo is enough.
      if (size > 0) setDeleteRequestId(nodeId)
      else void deleteNodes([nodeId])
    },
    [dbNodes, childMapSizes],
  )

  /** Select a node and animate the view onto it. */
  const focusNode = useCallback(
    (nodeId: string) => {
      setMenuNodeId(undefined)
      setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === nodeId })))
      setEdges((es) => es.map((e) => (e.selected ? { ...e, selected: false } : e)))
      const node = rf.getInternalNode(nodeId)
      if (!node) return
      const c = center({ ...node.internals.positionAbsolute, width: node.measured.width ?? 0, height: node.measured.height ?? 0 })
      // Zoom in to reading size if zoomed out, never zoom out.
      void rf.setCenter(c.x, c.y, { zoom: Math.max(rf.getZoom(), 1), duration: 400 })
    },
    [rf],
  )
  const lastNodeTap = useRef<{ id: string; time: number } | undefined>(undefined)

  const nodeRects = useCallback(
    () => nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, width: n.width ?? 0, height: n.height ?? 0 })),
    [nodes],
  )

  // --- Keyboard navigation
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || doc || settingsNodeId || isTypingTarget(event.target)) return
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return
      const selectedNodes = nodes.filter((n) => n.selected)
      const selected = selectedNodes.length === 1 ? selectedNodes[0] : undefined
      const mod = event.metaKey || event.ctrlKey

      const direction = ARROW_KEYS[event.key]
      if (direction && event.altKey && direction === 'up') {
        event.preventDefault()
        onNavigateUp?.()
        return
      }
      if (direction && !mod && !event.altKey) {
        event.preventDefault()
        const rects = nodeRects()
        const from = selected
          ? center({ x: selected.position.x, y: selected.position.y, width: selected.width ?? 0, height: selected.height ?? 0 })
          : rf.screenToFlowPosition(viewportCenterScreen())
        const candidates = selected ? rects.filter((r) => r.id !== selected.id) : rects
        const target = selected ? findNeighbor(from, candidates, direction) : findNeighbor(from, candidates, direction) ?? candidates[0]
        if (target) selectOnly(target.id, { onlyIfNeeded: true })
        return
      }
      // Stacking, as in Excalidraw: Ctrl+Shift+] to the front, Ctrl+Shift+[ to the back.
      if (mod && event.shiftKey && selected && !locked && (event.code === 'BracketRight' || event.code === 'BracketLeft')) {
        event.preventDefault()
        void restack(selected.id, event.code === 'BracketRight' ? 'front' : 'back')
        return
      }
      if (mod || event.altKey) return

      switch (event.key) {
        case 'Enter':
          if (selected) {
            event.preventDefault()
            exploreNode(selected.id)
          }
          break
        case 'Escape':
          if (menuNodeId || addMenu) {
            event.preventDefault()
            setMenuNodeId(undefined)
            setAddMenu(undefined)
          } else if (onNavigateUp) {
            event.preventDefault()
            onNavigateUp()
          }
          break
        case 'e':
        case 'F2':
        case ' ':
          if (selected) {
            event.preventDefault()
            openDocument(selected.id)
          }
          break
        case 'f':
          if (selected) {
            event.preventDefault()
            focusNode(selected.id)
          }
          break
        case 'l':
          event.preventDefault()
          setCanvasLocked(!locked)
          break
        case 'b':
          if (selected) {
            event.preventDefault()
            const content = contentOf(selected.id)
            if (content && !content.mapRef) void setBookmarked(content.id, !content.bookmarkedAt)
          }
          break
        case 'n': {
          if (locked) break
          event.preventDefault()
          const c = viewportCenterScreen()
          openAddMenu(c.x - 150, c.y - 120)
          break
        }
        case 'Tab':
          if (selected && !locked) {
            event.preventDefault()
            const rect = { x: selected.position.x, y: selected.position.y, width: selected.width ?? 0, height: selected.height ?? 0 }
            void addNode(placeBeside(rect, nodeRects(), DEFAULT_NODE_SIZE), selected.id)
          }
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [nodes, doc, settingsNodeId, rf, selectOnly, nodeRects, viewportCenterScreen, addNode, exploreNode, onNavigateUp, locked, menuNodeId, addMenu, focusNode, openDocument, contentOf, openAddMenu])

  // --- Derived UI state
  const templatesById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates])
  const actions: MapActions = useMemo(
    () => ({
      templates: templatesById,
      linkTemplates,
      mapCards: mapCards ?? EMPTY_CARDS,
      openMap: onOpenMap,
      timelines: timelines ?? EMPTY_TIMELINES,
      openNode: onOpenNode,
      openSettings: setSettingsNodeId,
      aliasTargets: aliasTargets ?? EMPTY_TARGETS,
      requestDelete,
      navigateUp: onNavigateUp,
      childMapSizes: childMapSizes ?? new Map(),
      menuNodeId,
      locked,
      closeMenu: () => setMenuNodeId(undefined),
      followEdge,
      editEdge: (edgeId: string) => (locked ? followEdge(edgeId) : selectEdge(edgeId)),
    }),
    [templatesById, linkTemplates, mapCards, onOpenMap, timelines, aliasTargets, onOpenNode, requestDelete, onNavigateUp, childMapSizes, menuNodeId, locked, followEdge, selectEdge],
  )
  const selectedEdges = edges.filter((e) => e.selected)
  const selectedEdge =
    !locked && selectedEdges.length === 1 && !nodes.some((n) => n.selected) ? selectedEdges[0].data?.model : undefined
  // The reader / editor and the settings show originals, which may live on another map (aliases).
  const docNode: IdeaNode | undefined = dbNodes?.find((n) => n.id === doc?.id) ?? (doc ? aliasTargets?.get(doc.id) : undefined)
  const settingsNode: IdeaNode | undefined =
    dbNodes?.find((n) => n.id === settingsNodeId) ?? (settingsNodeId ? aliasTargets?.get(settingsNodeId) : undefined)
  const deleteNode: IdeaNode | undefined = dbNodes?.find((n) => n.id === deleteRequestId)
  const sizeOf = (node: IdeaNode | undefined) => (node?.childMapId ? (childMapSizes?.get(node.childMapId) ?? 0) : 0)

  // Ignore a corrupt saved view (e.g. NaN) rather than rendering an unusable canvas.
  const savedViewport =
    map.viewport && [map.viewport.x, map.viewport.y, map.viewport.zoom].every(Number.isFinite) && map.viewport.zoom > 0
      ? map.viewport
      : undefined

  if (!dbNodes || !dbEdges) return null

  return (
    <MapContext.Provider value={actions}>
      <div
        ref={wrapperRef}
        className={cn('relative h-full w-full', connecting && 'is-connecting')}
        onPointerDown={(e) => {
          lastPointerType.current = e.pointerType
        }}
      >
        <ReactFlow<IdeaFlowNode, LinkFlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onEdgesChange={onEdgesChange}
          onDelete={onDelete}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onConnectStart={() => {
            setMenuNodeId(undefined)
            setConnecting(true)
          }}
          connectionRadius={36}
          connectionLineStyle={{ stroke: 'var(--sketch-blue)', strokeWidth: 2, strokeDasharray: '6 5' }}
          onEdgeClick={(event, edge) => followEdge(edge.id, { x: event.clientX, y: event.clientY })}
          onMoveEnd={onMoveEnd}
          onPaneClick={(event) => {
            // A click on the empty canvas closes what is open, or clears the selection; when there
            // is nothing to close, it opens the add menu (unlocked).
            const busy = menuNodeId || addMenu || nodes.some((n) => n.selected) || edges.some((e) => e.selected)
            setMenuNodeId(undefined)
            setAddMenu(undefined)
            if (!busy && !locked) openAddMenu(event.clientX, event.clientY)
          }}
          onNodeDragStart={() => setMenuNodeId(undefined)}
          onMoveStart={(event) => {
            // Close the menus when the user pans or zooms (not on programmatic moves).
            if (event) {
              setMenuNodeId(undefined)
              setAddMenu(undefined)
            }
          }}
          onNodeDoubleClick={(_, node) => {
            if (lastPointerType.current !== 'touch') openDocument(node.id)
          }}
          onNodeClick={(event, node) => {
            // Locked, a map card opens its map at once.
            if (locked && node.data.model.mapRef && !event.shiftKey) {
              onOpenMap(node.data.model.mapRef)
              return
            }
            // A plain click opens the node menu and brings the node into view.
            if (!event.shiftKey && !event.metaKey && !event.ctrlKey) {
              setMenuNodeId(node.id)
              revealNode(node.id)
            }
            // Touch double-tap on a node (mobile browsers don't reliably emit dblclick).
            if (lastPointerType.current !== 'touch') return
            const last = lastNodeTap.current
            if (last?.id === node.id && event.timeStamp - last.time < 350) {
              lastNodeTap.current = undefined
              openDocument(node.id)
            } else {
              lastNodeTap.current = { id: node.id, time: event.timeStamp }
            }
          }}
          connectionMode={ConnectionMode.Loose}
          defaultViewport={savedViewport}
          fitView={!savedViewport}
          fitViewOptions={{ maxZoom: 1, padding: 0.3 }}
          zoomOnDoubleClick={false}
          disableKeyboardA11y
          // Locked = read-only canvas: nothing can be moved, linked or deleted by accident.
          className={locked ? 'canvas-locked' : undefined}
          nodesDraggable={!locked}
          nodesConnectable={!locked}
          edgesReconnectable={false}
          deleteKeyCode={locked ? null : ['Delete', 'Backspace']}
          minZoom={0.1}
          maxZoom={4}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
          <Controls showInteractive={false} position="bottom-left" />
          <CanvasToolbar projectId={map.projectId} />
          <MiniMap<IdeaFlowNode>
            pannable
            zoomable
            position="bottom-right"
            className="max-md:!hidden"
            nodeColor={(n) => dimmedColorCss(templateStyle(templatesById.get(n.data.model.templateId)).color)}
            nodeStrokeColor={(n) => colorCss(templateStyle(templatesById.get(n.data.model.templateId)).color)}
          />
          {selectedEdge && (
            <Panel position="top-right">
              <EdgePanel
                edge={selectedEdge}
                sourceTitle={titleOf(selectedEdge.source)}
                targetTitle={titleOf(selectedEdge.target)}
                linkTemplates={linkTemplates}
                autoFocusLabel={selectedEdge.id === freshEdgeId}
              />
            </Panel>
          )}
          {dbNodes.length === 0 && (
            <Panel position="top-center" className="pointer-events-none mt-24 px-4 text-center text-muted-foreground">
              {locked ? (
                <span>Carte vide. Déverrouille le canvas (cadenas en bas à droite) pour ajouter des idées.</span>
              ) : (
                <>
                  <span className="max-md:hidden">
                    Clique sur le fond (ou appuie sur <kbd className="rounded border px-1.5 font-sans text-sm">N</kbd>) pour ajouter une idée
                  </span>
                  <span className="md:hidden">Touche le fond pour ajouter une idée</span>
                </>
              )}
            </Panel>
          )}
        </ReactFlow>
        {addMenu && !locked && (
          <AddIdeaMenu
            at={addMenu.at}
            bounds={addMenu.bounds}
            templates={templates}
            reusable={reusable ?? []}
            maps={(referenceableMaps ?? []).filter((m) => m.map.id !== map.id)}
            onCreate={createFromMenu}
            onAlias={(id) => void aliasFromMenu(id)}
            onMapCard={(id) => void mapCardFromMenu(id)}
            onClose={() => setAddMenu(undefined)}
          />
        )}
      </div>
      <IdeaDocument
        node={docNode}
        mode={doc?.mode ?? 'read'}
        template={docNode && templatesById.get(docNode.templateId)}
        location={mapLabel}
        onClose={() => setDoc(undefined)}
      />
      <NodeSettingsSheet node={settingsNode} templates={templates} onClose={() => setSettingsNodeId(undefined)} />
      <AlertDialog open={deleteNode !== undefined} onOpenChange={(open) => !open && setDeleteRequestId(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {deleteNode?.title || 'Sans titre'} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Sa carte contient {sizeOf(deleteNode)} idée{sizeOf(deleteNode) > 1 ? 's' : ''}, qui seront supprimées aussi. Tu
              pourras annuler avec Ctrl+Z.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleteNode && void deleteNodes([deleteNode.id])}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MapContext.Provider>
  )
}
