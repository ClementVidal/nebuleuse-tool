import { useLiveQuery } from 'dexie-react-hooks'
import { useSyncExternalStore } from 'react'
import { db } from './db'
import { canRedo, canUndo, historyVersion, subscribeHistory } from './history'
import type { IdeaNode, Project } from './types'

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
    return nodes.map((node) => {
      const owner = mapOwner.get(node.mapId)
      return { node, location: owner ? (titles.get(owner) ?? '…') : project.name }
    })
  }, [project, enabled])
}
