import Dexie, { type EntityTable } from 'dexie'
import type { IdeaEdge, IdeaNode, NodeTemplate, Project, ReflexionMap } from './types'

export const db = new Dexie('nebuleuse') as Dexie & {
  projects: EntityTable<Project, 'id'>
  templates: EntityTable<NodeTemplate, 'id'>
  maps: EntityTable<ReflexionMap, 'id'>
  nodes: EntityTable<IdeaNode, 'id'>
  edges: EntityTable<IdeaEdge, 'id'>
}

db.version(1).stores({
  projects: 'id, updatedAt',
  templates: 'id, projectId',
  maps: 'id, projectId, parentNodeId',
  nodes: 'id, projectId, mapId, templateId',
  edges: 'id, projectId, mapId, source, target',
})
