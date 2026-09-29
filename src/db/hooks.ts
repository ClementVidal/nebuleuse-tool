import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useSyncExternalStore } from 'react'
import { db } from './db'
import { canRedo, canUndo, historyVersion, subscribeHistory } from './history'
import { fieldValue, isDateRange, isTimelineField } from './fields'
import type { PaletteColor } from './palette'
import type { IdeaNode, LinkTemplate, Project, ReflexionMap } from './types'

export function useProjects() {
  return useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), [])
}

/** `undefined` while loading, `null` if the project doesn't exist. */
export function useProject(projectId: string) {
  return useLiveQuery(async () => (await db.projects.get(projectId)) ?? null, [projectId])
}

export function useTemplates(projectId: string) {
  return useLiveQuery(() => db.templates.where({ projectId }).sortBy('order'), [projectId])
}

export function useLinkTemplates(projectId: string) {
  return useLiveQuery(() => db.linkTemplates.where({ projectId }).sortBy('order'), [projectId])
}

/** Link templates of a project by id (empty while loading). */
export function useLinkTemplateMap(projectId: string): Map<string, LinkTemplate> {
  const templates = useLinkTemplates(projectId)
  return useMemo(() => new Map((templates ?? []).map((t) => [t.id, t])), [templates])
}

/** `undefined` while loading, `null` if the map doesn't exist. */
export function useMap(mapId: string) {
  return useLiveQuery(async () => (await db.maps.get(mapId)) ?? null, [mapId])
}

export function useMapNodes(mapId: string) {
  return useLiveQuery(() => db.nodes.where({ mapId }).toArray(), [mapId])
}

export function useMapEdges(mapId: string) {
  return useLiveQuery(() => db.edges.where({ mapId }).toArray(), [mapId])
}

export interface BreadcrumbItem {
  mapId: string
  label: string
  /** Node that owns the map (null for the root map). */
  node: IdeaNode | null
}

/** Chain of maps from the project root down to `mapId`. */
export function useBreadcrumb(project: Project | null | undefined, mapId: string) {
  return useLiveQuery(async () => {
    if (!project) return undefined
    const chain: BreadcrumbItem[] = []
    let current = await db.maps.get(mapId)
    while (current) {
      const owner = current.parentNodeId ? await db.nodes.get(current.parentNodeId) : undefined
      chain.unshift({ mapId: current.id, label: owner?.title ?? project.name, node: owner ?? null })
      current = owner ? await db.maps.get(owner.mapId) : undefined
    }
    return chain
  }, [project, mapId])
}

/** Undo / redo availability for a project, re-rendering when the history changes. */
export function useHistoryState(projectId: string | undefined) {
  useSyncExternalStore(subscribeHistory, historyVersion)
  return {
    canUndo: projectId ? canUndo(projectId) : false,
    canRedo: projectId ? canRedo(projectId) : false,
  }
}

export interface SearchableNode {
  node: IdeaNode
  /** Label of the map the node lives in (owner node title, or project name for the root map). */
  location: string
}

/** Every node of a project, with where it lives — for the command palette. */
export function useProjectNodes(project: Project | null | undefined, enabled: boolean) {
  return useLiveQuery(async (): Promise<SearchableNode[]> => {
    if (!project || !enabled) return []
    const [nodes, maps] = await Promise.all([
      db.nodes.where({ projectId: project.id }).toArray(),
      db.maps.where({ projectId: project.id }).toArray(),
    ])
    const titles = new Map(nodes.map((n) => [n.id, n.title]))
    const mapOwner = new Map(maps.map((m) => [m.id, m.parentNodeId]))
    // Aliases hold no content of their own: search finds their original.
    return nodes.filter((node) => !node.aliasOf && !node.mapRef).map((node) => {
      const owner = mapOwner.get(node.mapId)
      return { node, location: owner ? (titles.get(owner) ?? '…') : project.name }
    })
  }, [project, enabled])
}

export interface Bookmark {
  node: IdeaNode
  /** Label of the map the node lives in. */
  location: string
}

/** Bookmarked nodes of a project, most recent first. */
export function useBookmarks(project: Project | null | undefined) {
  return useLiveQuery(async (): Promise<Bookmark[]> => {
    if (!project) return []
    const nodes = (await db.nodes.where({ projectId: project.id }).toArray())
      .filter((n) => n.bookmarkedAt)
      .sort((a, b) => b.bookmarkedAt! - a.bookmarkedAt!)
    const maps = await db.maps.bulkGet([...new Set(nodes.map((n) => n.mapId))])
    const owners = await db.nodes.bulkGet(maps.map((m) => m?.parentNodeId ?? ''))
    const labelOf = new Map(maps.map((m, i) => [m?.id, owners[i]?.title ?? project.name]))
    return nodes.map((node) => ({ node, location: labelOf.get(node.mapId) ?? project.name }))
  }, [project])
}

/** For each node of a map that opens a child map, how many nodes that child map holds. */
export function useChildMapSizes(nodes: IdeaNode[] | undefined) {
  const childMapIds = (nodes ?? []).flatMap((n) => (n.childMapId ? [n.childMapId] : []))
  const key = childMapIds.join(',')
  return useLiveQuery(async () => {
    const sizes = new Map<string, number>()
    if (childMapIds.length === 0) return sizes
    const children = await db.nodes.where('mapId').anyOf(childMapIds).toArray()
    for (const child of children) sizes.set(child.mapId, (sizes.get(child.mapId) ?? 0) + 1)
    return sizes
  }, [key])
}

export interface TimelineEntry {
  nodeId: string
  fieldId: string
  title: string
  color: PaletteColor
  /** ISO dates; equal for a single date. */
  start: string
  end: string
  kind: 'date' | 'range'
}

/** Timeline key: names are matched ignoring case and surrounding spaces. */
export const timelineKey = (name: string | undefined) => (name ?? '').trim().toLowerCase()

/**
 * Every date / period of the project that belongs to a named timeline, grouped by timeline, so a
 * node can draw its own date in front of all the others of the same timeline.
 */
export function useTimelines(projectId: string) {
  return useLiveQuery(async () => {
    const [nodes, templates] = await Promise.all([db.nodes.where({ projectId }).toArray(), db.templates.where({ projectId }).toArray()])
    const templatesById = new Map(templates.map((t) => [t.id, t]))
    const timelines = new Map<string, TimelineEntry[]>()
    for (const node of nodes) {
      if (node.aliasOf) continue // an alias shows its original's dates, already counted
      const template = templatesById.get(node.templateId)
      if (!template) continue
      for (const field of template.fields) {
        const key = timelineKey(field.timelineName)
        if (!key || !isTimelineField(field)) continue
        const value = fieldValue(node, field)
        let start: string | undefined
        let end: string | undefined
        if (field.type === 'date' && typeof value === 'string' && value) start = end = value
        if (field.type === 'daterange' && isDateRange(value) && value.start && value.end) ({ start, end } = value)
        if (!start || !end) continue
        const entry: TimelineEntry = {
          nodeId: node.id,
          fieldId: field.id,
          title: node.title,
          color: template.style.color,
          start,
          end,
          kind: field.type === 'date' ? 'date' : 'range',
        }
        timelines.set(key, [...(timelines.get(key) ?? []), entry])
      }
    }
    return timelines
  }, [projectId])
}

/** The originals of the aliases among `nodes`, by id (they may live on other maps). */
export function useAliasTargets(nodes: IdeaNode[] | undefined) {
  const ids = [...new Set((nodes ?? []).flatMap((n) => (n.aliasOf ? [n.aliasOf] : [])))]
  const key = ids.join(',')
  return useLiveQuery(async () => {
    const targets = new Map<string, IdeaNode>()
    for (const node of await db.nodes.bulkGet(ids)) if (node) targets.set(node.id, node)
    return targets
  }, [key])
}

export interface ReusableNode {
  node: IdeaNode
  /** Label of the map the idea lives in. */
  location: string
}

/** Ideas of a project that can be placed as aliases (the « Référençable » setting). */
export function useReusableNodes(projectId: string) {
  return useLiveQuery(async (): Promise<ReusableNode[]> => {
    const nodes = (await db.nodes.where({ projectId }).toArray()).filter((n) => n.reusable && !n.aliasOf)
    const maps = await db.maps.bulkGet([...new Set(nodes.map((n) => n.mapId))])
    const owners = new Map((await db.nodes.bulkGet(maps.flatMap((m) => (m?.parentNodeId ? [m.parentNodeId] : [])))).flatMap((n) => (n ? [[n.id, n.title]] : [])))
    const project = await db.projects.get(projectId)
    const ownerOf = new Map(maps.flatMap((m) => (m ? [[m.id, m.parentNodeId]] : [])))
    return nodes
      .map((node) => {
        const owner = ownerOf.get(node.mapId)
        return { node, location: owner ? (owners.get(owner) ?? '…') : (project?.name ?? '') }
      })
      .sort((a, b) => a.node.title.localeCompare(b.node.title, 'fr'))
  }, [projectId])
}

export interface MapCardInfo {
  map: ReflexionMap
  /** Owner idea title, or project name for the root map. */
  name: string
  /** Where the map lives: the label of the map holding its owner idea (empty for the root map). */
  location: string
  /** Number of ideas on the map. */
  size: number
  /** Titles of its first ideas, top to bottom. */
  titles: string[]
}

async function mapCardInfos(maps: ReflexionMap[]): Promise<MapCardInfo[]> {
  if (maps.length === 0) return []
  const project = await db.projects.get(maps[0].projectId)
  const owners = await db.nodes.bulkGet(maps.map((m) => m.parentNodeId ?? ''))
  const ownerMaps = await db.maps.bulkGet(owners.map((o) => o?.mapId ?? ''))
  const grandOwners = await db.nodes.bulkGet(ownerMaps.map((m) => m?.parentNodeId ?? ''))
  const content = await db.nodes.where('mapId').anyOf(maps.map((m) => m.id)).toArray()
  const aliasTitles = new Map(
    (await db.nodes.bulkGet(content.flatMap((n) => (n.aliasOf ? [n.aliasOf] : [])))).flatMap((n) => (n ? [[n.id, n.title]] : [])),
  )
  return maps.map((map, i) => {
    const ideas = content.filter((n) => n.mapId === map.id && !n.mapRef).sort((a, b) => a.y - b.y || a.x - b.x)
    return {
      map,
      name: map.parentNodeId ? (owners[i]?.title ?? '…') || 'Sans titre' : (project?.name ?? ''),
      location: map.parentNodeId ? (grandOwners[i]?.title ?? project?.name ?? '') : '',
      size: ideas.length,
      titles: ideas.slice(0, 4).map((n) => (n.aliasOf ? aliasTitles.get(n.aliasOf) : n.title) || 'Sans titre'),
    }
  })
}

/** Maps of a project that can be placed as cards (the « Référençable » map setting). */
export function useReferenceableMaps(projectId: string) {
  return useLiveQuery(async () => {
    const maps = (await db.maps.where({ projectId }).toArray()).filter((m) => m.reusable)
    return (await mapCardInfos(maps)).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [projectId])
}

/** The maps the cards among `nodes` stand for, by map id. */
export function useMapCardTargets(nodes: IdeaNode[] | undefined) {
  const ids = [...new Set((nodes ?? []).flatMap((n) => (n.mapRef ? [n.mapRef] : [])))]
  const key = ids.join(',')
  return useLiveQuery(async () => {
    const maps = (await db.maps.bulkGet(ids)).filter((m): m is ReflexionMap => !!m)
    return new Map((await mapCardInfos(maps)).map((info) => [info.map.id, info]))
  }, [key])
}

/** Number of cards standing for a map. */
export function useMapCardCount(mapId: string) {
  return useLiveQuery(() => db.nodes.where('mapRef').equals(mapId).count(), [mapId])
}

/** Number of aliases of an idea. */
export function useAliasCount(nodeId: string | undefined) {
  return useLiveQuery(async () => (nodeId ? db.nodes.where('aliasOf').equals(nodeId).count() : 0), [nodeId])
}
