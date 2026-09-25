import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnDelete,
  type Viewport,
} from '@xyflow/react'
import { Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { createEdge, createNode, deleteEdges, deleteNodes, saveViewport, setBookmarked, updateNodePositions } from '@/db/actions'
import { DEFAULT_NODE_SIZE } from '@/db/defaults'
import { colorCss, dimmedColorCss } from '@/db/palette'
import { record } from '@/db/history'
import { useChildMapSizes, useMapEdges, useMapNodes } from '@/db/hooks'
import type { IdeaNode, NodeTemplate, ReflexionMap } from '@/db/types'
import { EdgePanel } from './edge-panel'
import { center } from './geometry'
import { IdeaNodeComponent, type IdeaFlowNode } from './idea-node'
import { CanvasToolbar } from './canvas-toolbar'
import { setCanvasLocked, useCanvasLocked } from './lock-store'
import { onMapCommand } from './map-commands'
import { MapContext, type MapActions } from './map-context'
import { NodeEditorSheet } from './node-editor-sheet'
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

interface MapCanvasProps {
  map: ReflexionMap
  templates: NodeTemplate[]
  /** Template used for nodes created from the canvas. */
  activeTemplateId: string | undefined
  /** Node to select when the map opens (e.g. the node we just came back from). */
  focusNodeId: string | undefined
  onOpenNode: (nodeId: string) => void
  onNavigateUp: (() => void) | undefined
  onSelectTemplateIndex: (index: number) => void
  /**
   * Called once `focusNodeId` has been revealed, so the page can drop it from the URL:
   * going back to this map then restores the last view instead of re-centering.
   */
  onFocusConsumed: () => void
}

export function MapCanvas({
  map,
  templates,
  activeTemplateId,
  focusNodeId,
  onOpenNode,
  onNavigateUp,
  onSelectTemplateIndex,
  onFocusConsumed,
}: MapCanvasProps) {
  const rf = useReactFlow<IdeaFlowNode, LinkFlowEdge>()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const dbNodes = useMapNodes(map.id)
  const dbEdges = useMapEdges(map.id)
  const childMapSizes = useChildMapSizes(dbNodes)
  const locked = useCanvasLocked()
  const [nodes, setNodes] = useState<IdeaFlowNode[]>([])
  const [edges, setEdges] = useState<LinkFlowEdge[]>([])
  const [editingNodeId, setEditingNodeId] = useState<string>()
  /** Node whose click menu is open. */
  const [menuNodeId, setMenuNodeId] = useState<string>()
  /** Node to select once it shows up from the database (after creation / on open). */
  const pendingSelection = useRef<string | undefined>(focusNodeId)
  const lastPointerType = useRef<string>('mouse')
  const lastTap = useRef<{ time: number; x: number; y: number } | undefined>(undefined)

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
          selected: toSelect ? model.id === toSelect : (p?.selected ?? false),
        }
      })
    })
  }, [dbNodes])

  useEffect(() => {
    if (!dbEdges) return
    setEdges((prev) => {
      const prevById = new Map(prev.map((e) => [e.id, e]))
      return dbEdges.map((model): LinkFlowEdge => ({
        ...prevById.get(model.id),
        id: model.id,
        type: 'link',
        source: model.source,
        target: model.target,
        data: { model },
      }))
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

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source === connection.target) return
      void createEdge({ projectId: map.projectId, mapId: map.id, source: connection.source, target: connection.target })
    },
    [map.projectId, map.id],
  )

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
      setEditingNodeId(node.id)
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

  const viewportCenterScreen = useCallback(() => {
    const r = wrapperRef.current?.getBoundingClientRect()
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 }
  }, [])

  // Commands from the command palette.
  useEffect(
    () =>
      onMapCommand((command) => {
        if (command.type === 'navigate-up') onNavigateUp?.()
        if (command.type === 'create-node') {
          const c = viewportCenterScreen()
          addNodeAtScreen(c.x, c.y, command.templateId)
        }
      }),
    [onNavigateUp, viewportCenterScreen, addNodeAtScreen],
  )

  // --- Selection helpers
  const selectOnly = useCallback(
    (nodeId: string, { center: forceCenter = false }: { center?: boolean } = {}) => {
      setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === nodeId })))
      setEdges((es) => es.map((e) => (e.selected ? { ...e, selected: false } : e)))
      const node = rf.getInternalNode(nodeId)
      const wrapper = wrapperRef.current?.getBoundingClientRect()
      if (!node || !wrapper) return
      const rect = { ...node.internals.positionAbsolute, width: node.measured.width ?? 0, height: node.measured.height ?? 0 }
      const topLeft = rf.flowToScreenPosition(rect)
      const bottomRight = rf.flowToScreenPosition({ x: rect.x + rect.width, y: rect.y + rect.height })
      const visible = topLeft.x >= wrapper.left && topLeft.y >= wrapper.top && bottomRight.x <= wrapper.right && bottomRight.y <= wrapper.bottom
      if (forceCenter || !visible) {
        const c = center(rect)
        void rf.setCenter(c.x, c.y, { zoom: Math.max(rf.getZoom(), 0.8), duration: 350 })
      }
    },
    [rf],
  )

  // Select and reveal the focused node (from the URL) once React Flow has measured it.
  const focusDone = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!focusNodeId || focusDone.current === focusNodeId) return
    if (!rf.getInternalNode(focusNodeId)?.measured.width) return
    focusDone.current = focusNodeId
    selectOnly(focusNodeId, { center: true })
    onFocusConsumed()
  }, [focusNodeId, nodes, rf, selectOnly, onFocusConsumed])

  // Focus requests for a node of this map (bookmarks, search) when the URL doesn't change.
  useEffect(
    () =>
      onMapCommand((command) => {
        if (command.type === 'focus-node') selectOnly(command.nodeId, { center: true })
      }),
    [selectOnly],
  )

  /** Double-click / double-tap on a node: edit it when locked, enter its map when unlocked. */
  const activateNode = useCallback(
    (nodeId: string) => {
      setMenuNodeId(undefined)
      if (locked) setEditingNodeId(nodeId)
      else onOpenNode(nodeId)
    },
    [locked, onOpenNode],
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
      if (event.defaultPrevented || editingNodeId || isTypingTarget(event.target)) return
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
        if (target) selectOnly(target.id)
        return
      }
      if (mod || event.altKey) return

      switch (event.key) {
        case 'Enter':
          if (selected) {
            event.preventDefault()
            onOpenNode(selected.id)
          }
          break
        case 'Escape':
          if (menuNodeId) {
            event.preventDefault()
            setMenuNodeId(undefined)
          } else if (onNavigateUp) {
            event.preventDefault()
            onNavigateUp()
          }
          break
        case 'e':
        case 'F2':
          if (selected) {
            event.preventDefault()
            setEditingNodeId(selected.id)
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
            void setBookmarked(selected.id, !selected.data.model.bookmarkedAt)
          }
          break
        case 'n': {
          event.preventDefault()
          const c = viewportCenterScreen()
          addNodeAtScreen(c.x, c.y)
          break
        }
        case 'Tab':
          if (selected) {
            event.preventDefault()
            const rect = { x: selected.position.x, y: selected.position.y, width: selected.width ?? 0, height: selected.height ?? 0 }
            void addNode(placeBeside(rect, nodeRects(), DEFAULT_NODE_SIZE), selected.id)
          }
          break
        default:
          if (/^[1-9]$/.test(event.key)) {
            event.preventDefault()
            onSelectTemplateIndex(Number(event.key) - 1)
          }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [nodes, editingNodeId, rf, selectOnly, nodeRects, viewportCenterScreen, addNode, addNodeAtScreen, onOpenNode, onNavigateUp, onSelectTemplateIndex, locked, menuNodeId, focusNode])

  // --- Derived UI state
  const templatesById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates])
  const actions: MapActions = useMemo(
    () => ({
      templates: templatesById,
      openNode: onOpenNode,
      editNode: setEditingNodeId,
      navigateUp: onNavigateUp,
      childMapSizes: childMapSizes ?? new Map(),
      menuNodeId,
      locked,
      focusNode,
      closeMenu: () => setMenuNodeId(undefined),
    }),
    [templatesById, onOpenNode, onNavigateUp, childMapSizes, menuNodeId, locked, focusNode],
  )
  const selectedEdges = edges.filter((e) => e.selected)
  const selectedEdge = selectedEdges.length === 1 && !nodes.some((n) => n.selected) ? selectedEdges[0].data?.model : undefined
  const editingNode: IdeaNode | undefined = dbNodes?.find((n) => n.id === editingNodeId)

  if (!dbNodes || !dbEdges) return null

  return (
    <MapContext.Provider value={actions}>
      <div
        ref={wrapperRef}
        className="h-full w-full"
        onDoubleClick={(e) => {
          // Touch double-taps are handled in onPointerUp: mobile browsers don't reliably emit dblclick.
          if (lastPointerType.current === 'touch') return
          if ((e.target as HTMLElement).classList.contains('react-flow__pane')) addNodeAtScreen(e.clientX, e.clientY)
        }}
        onPointerDown={(e) => {
          lastPointerType.current = e.pointerType
        }}
        onPointerUp={(e) => {
          if (e.pointerType !== 'touch' || !(e.target as HTMLElement).classList.contains('react-flow__pane')) return
          const last = lastTap.current
          const now = e.timeStamp
          if (last && now - last.time < 350 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30) {
            lastTap.current = undefined
            addNodeAtScreen(e.clientX, e.clientY)
          } else {
            lastTap.current = { time: now, x: e.clientX, y: e.clientY }
          }
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
          onMoveEnd={onMoveEnd}
          onPaneClick={() => setMenuNodeId(undefined)}
          onNodeDragStart={() => setMenuNodeId(undefined)}
          onMoveStart={(event) => {
            // Close the menu when the user pans or zooms (not on programmatic moves).
            if (event) setMenuNodeId(undefined)
          }}
          onNodeDoubleClick={(_, node) => {
            if (lastPointerType.current !== 'touch') activateNode(node.id)
          }}
          onNodeClick={(event, node) => {
            // A plain click opens the node menu (focus / enter / edit).
            if (!event.shiftKey && !event.metaKey && !event.ctrlKey) setMenuNodeId(node.id)
            // Touch double-tap on a node (mobile browsers don't reliably emit dblclick).
            if (lastPointerType.current !== 'touch') return
            const last = lastNodeTap.current
            if (last?.id === node.id && event.timeStamp - last.time < 350) {
              lastNodeTap.current = undefined
              activateNode(node.id)
            } else {
              lastNodeTap.current = { id: node.id, time: event.timeStamp }
            }
          }}
          connectionMode={ConnectionMode.Loose}
          defaultViewport={map.viewport}
          fitView={!map.viewport}
          fitViewOptions={{ maxZoom: 1, padding: 0.3 }}
          zoomOnDoubleClick={false}
          disableKeyboardA11y
          deleteKeyCode={['Delete', 'Backspace']}
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
          {/* Touch screens have no N key: an explicit button to create an idea. */}
          <Panel position="bottom-right" className="!mb-8 md:hidden">
            <Button
              size="icon"
              className="size-12 rounded-full shadow-lg"
              aria-label="Nouvelle idée"
              onClick={() => {
                const c = viewportCenterScreen()
                addNodeAtScreen(c.x, c.y)
              }}
            >
              <Plus className="size-6" />
            </Button>
          </Panel>
          {selectedEdge && (
            <Panel position="top-right">
              <EdgePanel edge={selectedEdge} />
            </Panel>
          )}
          {dbNodes.length === 0 && (
            <Panel position="top-center" className="pointer-events-none mt-24 px-4 text-center text-muted-foreground">
              <span className="max-md:hidden">
                Double-clique ou appuie sur <kbd className="rounded border px-1.5 font-sans text-sm">N</kbd> pour créer une idée
              </span>
              <span className="md:hidden">Touche deux fois le fond ou le bouton + pour créer une idée</span>
            </Panel>
          )}
        </ReactFlow>
      </div>
      <NodeEditorSheet
        node={editingNode}
        templates={templates}
        onClose={() => setEditingNodeId(undefined)}
      />
    </MapContext.Provider>
  )
}
