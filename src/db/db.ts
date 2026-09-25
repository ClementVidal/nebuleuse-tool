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

// v2: node style is a single colour per template (text, border, dimmed background) + dashed
// outline; per-node style overrides are gone.
db.version(2).stores({}).upgrade(async (tx) => {
  await tx
    .table('templates')
    .toCollection()
    .modify((template: { style: Record<string, unknown> }) => {
      const { stroke, strokeWidth } = template.style
      template.style = { color: stroke ?? 'ink', strokeWidth: strokeWidth ?? 'medium', dashed: false }
    })
  await tx
    .table('nodes')
    .toCollection()
    .modify((node: Record<string, unknown>) => {
      delete node.style
    })
})
