import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
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
