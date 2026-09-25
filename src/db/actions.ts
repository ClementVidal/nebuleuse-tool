import { nanoid } from 'nanoid'
import { db } from './db'
import { DEFAULT_EDGE, DEFAULT_NODE_SIZE, DEFAULT_NODE_STYLE, defaultTemplates } from './defaults'
import { patchSnapshots, record, type RecordOptions } from './history'
import type { FieldValue, IdeaEdge, IdeaNode, NodeTemplate, Project, ReflexionMap } from './types'

const ALL_TABLES = [db.projects, db.templates, db.maps, db.nodes, db.edges]

// Actions that change a project's content go through `record()` so they can be undone.
// Project-level actions (create / rename / delete a project) and view state are not recorded.

function touchProject(projectId: string) {
  return db.projects.update(projectId, { updatedAt: Date.now() })
}

// ---------------------------------------------------------------- projects

export async function createProject(name: string): Promise<Project> {
  const projectId = nanoid()
  const rootMap: ReflexionMap = { id: nanoid(), projectId, parentNodeId: null }
  const now = Date.now()
  const project: Project = { id: projectId, name, rootMapId: rootMap.id, createdAt: now, updatedAt: now }
  await db.transaction('rw', ALL_TABLES, async () => {
    await db.projects.add(project)
    await db.maps.add(rootMap)
    await db.templates.bulkAdd(defaultTemplates(projectId))
  })
  return project
}

export async function renameProject(projectId: string, name: string) {
  await db.projects.update(projectId, { name, updatedAt: Date.now() })
}

export async function deleteProject(projectId: string) {
  await db.transaction('rw', ALL_TABLES, async () => {
    await db.edges.where({ projectId }).delete()
    await db.nodes.where({ projectId }).delete()
    await db.maps.where({ projectId }).delete()
    await db.templates.where({ projectId }).delete()
    await db.projects.delete(projectId)
  })
}

// ---------------------------------------------------------------- templates

export async function createTemplate(projectId: string, name: string): Promise<NodeTemplate> {
  const last = await db.templates.where({ projectId }).sortBy('order')
  const template: NodeTemplate = {
    id: nanoid(),
    projectId,
    name,
    order: (last.at(-1)?.order ?? -1) + 1,
    style: { ...DEFAULT_NODE_STYLE },
    fields: [],
  }
  await record(() => db.templates.add(template))
  return template
}

export async function updateTemplate(
  templateId: string,
  changes: Partial<Omit<NodeTemplate, 'id' | 'projectId'>>,
  options?: RecordOptions,
) {
  await record(() => db.templates.update(templateId, changes), options)
}

export function countTemplateUsage(templateId: string) {
  return db.nodes.where({ templateId }).count()
}

/** Refuses to delete a template still used by nodes. Returns false in that case. */
export async function deleteTemplate(templateId: string): Promise<boolean> {
  return record(async () => {
    if ((await countTemplateUsage(templateId)) > 0) return false
    await db.templates.delete(templateId)
    return true
  })
}

// ---------------------------------------------------------------- maps

export async function saveViewport(mapId: string, viewport: ReflexionMap['viewport']) {
  await db.maps.update(mapId, { viewport })
}

/**
 * Returns the map opened by a node, creating it on first access. Not an undoable step: the link
 * is patched into recorded snapshots so undo/redo of the node keep pointing at its map.
 */
export async function ensureChildMap(nodeId: string): Promise<string> {
  const { mapId, created } = await db.transaction('rw', [db.nodes, db.maps], async () => {
    const node = await db.nodes.get(nodeId)
    if (!node) throw new Error(`Node ${nodeId} not found`)
    if (node.childMapId) return { mapId: node.childMapId, created: false }
    const map: ReflexionMap = { id: nanoid(), projectId: node.projectId, parentNodeId: node.id }
    await db.maps.add(map)
    await db.nodes.update(node.id, { childMapId: map.id })
    return { mapId: map.id, created: true }
  })
  if (created) patchSnapshots('nodes', nodeId, { childMapId: mapId })
  return mapId
}

// ---------------------------------------------------------------- nodes

export async function createNode(
  input: Pick<IdeaNode, 'projectId' | 'mapId' | 'templateId' | 'x' | 'y'> & Partial<Pick<IdeaNode, 'title'>>,
): Promise<IdeaNode> {
  const node: IdeaNode = {
    id: nanoid(),
    title: 'Nouvelle idée',
    values: {},
    childMapId: null,
    ...DEFAULT_NODE_SIZE,
    ...input,
  }
  await record(async () => {
    await db.nodes.add(node)
    await touchProject(node.projectId)
  })
  return node
}

export async function updateNode(
  nodeId: string,
  changes: Partial<Omit<IdeaNode, 'id' | 'projectId' | 'mapId'>>,
  options?: RecordOptions,
) {
  await record(() => db.nodes.update(nodeId, changes), options)
}

/** Updates a single field value without clobbering concurrent edits of other fields. */
export async function updateNodeValue(nodeId: string, fieldId: string, value: FieldValue) {
  await record(() => db.nodes.update(nodeId, { [`values.${fieldId}`]: value }), { coalesceKey: `value:${nodeId}:${fieldId}` })
}

export async function updateNodePositions(positions: { id: string; x: number; y: number }[]) {
  await record(async () => {
    for (const { id, x, y } of positions) await db.nodes.update(id, { x, y })
  })
}

/** Deletes nodes, their edges and, recursively, the maps they open. */
export async function deleteNodes(nodeIds: string[]) {
  await record(async () => {
    let queue = [...nodeIds]
    while (queue.length > 0) {
      const nodes = await db.nodes.bulkGet(queue)
      const childMapIds = nodes.flatMap((n) => (n?.childMapId ? [n.childMapId] : []))
      await db.edges.where('source').anyOf(queue).delete()
      await db.edges.where('target').anyOf(queue).delete()
      await db.nodes.bulkDelete(queue)
      await db.maps.bulkDelete(childMapIds)
      queue = childMapIds.length ? await db.nodes.where('mapId').anyOf(childMapIds).primaryKeys() : []
      if (childMapIds.length) await db.edges.where('mapId').anyOf(childMapIds).delete()
    }
  })
}

// ---------------------------------------------------------------- edges

export async function createEdge(
  input: Pick<IdeaEdge, 'projectId' | 'mapId' | 'source' | 'target'>,
): Promise<IdeaEdge> {
  const edge: IdeaEdge = { id: nanoid(), ...DEFAULT_EDGE, ...input }
  await record(() => db.edges.add(edge))
  return edge
}

export async function updateEdge(
  edgeId: string,
  changes: Partial<Omit<IdeaEdge, 'id' | 'projectId' | 'mapId'>>,
  options?: RecordOptions,
) {
  await record(() => db.edges.update(edgeId, changes), options)
}

export async function deleteEdges(edgeIds: string[]) {
  await record(() => db.edges.bulkDelete(edgeIds))
}
