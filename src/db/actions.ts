import { nanoid } from 'nanoid'
import { defaultValues } from './fields'
import { db } from './db'
import { DEFAULT_EDGE, DEFAULT_NODE_SIZE, DEFAULT_NODE_STYLE, defaultLinkTemplates, defaultTemplates, MAP_CARD_SIZE } from './defaults'
import { patchSnapshots, record, type RecordOptions } from './history'
import type { FieldValue, IdeaEdge, IdeaNode, LinkStyle, LinkTemplate, NodeTemplate, Project, ReflexionMap } from './types'

const ALL_TABLES = [db.projects, db.templates, db.maps, db.nodes, db.edges, db.linkTemplates]

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
    await db.linkTemplates.bulkAdd(defaultLinkTemplates(projectId))
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
    await db.linkTemplates.where({ projectId }).delete()
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

// ---------------------------------------------------------------- link templates

export async function createLinkTemplate(projectId: string, name: string): Promise<LinkTemplate> {
  const last = await db.linkTemplates.where({ projectId }).sortBy('order')
  const template: LinkTemplate = {
    id: nanoid(),
    projectId,
    name,
    order: (last.at(-1)?.order ?? -1) + 1,
    label: name.toLowerCase(),
    style: { arrows: DEFAULT_EDGE.arrows, color: DEFAULT_EDGE.color, strokeWidth: DEFAULT_EDGE.strokeWidth, path: DEFAULT_EDGE.path, dash: DEFAULT_EDGE.dash },
  }
  await record(() => db.linkTemplates.add(template))
  return template
}

/** For projects created before link templates existed. */
export async function addDefaultLinkTemplates(projectId: string) {
  await record(() => db.linkTemplates.bulkAdd(defaultLinkTemplates(projectId)))
}

export async function updateLinkTemplate(
  templateId: string,
  changes: Partial<Omit<LinkTemplate, 'id' | 'projectId'>>,
  options?: RecordOptions,
) {
  await record(() => db.linkTemplates.update(templateId, changes), options)
}

export function countLinkTemplateUsage(templateId: string) {
  return db.edges.filter((e) => e.templateId === templateId).count()
}

/** Deletes a link template; its links keep their look (the template's style is copied onto them). */
export async function deleteLinkTemplate(templateId: string) {
  await record(async () => {
    const template = await db.linkTemplates.get(templateId)
    if (!template) return
    await db.edges
      .where({ projectId: template.projectId })
      .filter((e) => e.templateId === templateId)
      .modify((edge: IdeaEdge) => {
        Object.assign(edge, template.style)
        delete edge.templateId
      })
    await db.linkTemplates.delete(templateId)
  })
}

// ---------------------------------------------------------------- maps

export async function setMapReusable(mapId: string, reusable: boolean) {
  await record(() => db.maps.update(mapId, { reusable: reusable || undefined }))
}

/** Places a card standing for another map of the project (a « référençable » one). */
export async function createMapRef(input: { mapId: string; targetMapId: string; x: number; y: number }): Promise<IdeaNode | undefined> {
  const target = await db.maps.get(input.targetMapId)
  if (!target) return undefined
  const card: IdeaNode = {
    id: nanoid(),
    projectId: target.projectId,
    mapId: input.mapId,
    templateId: '',
    title: '',
    values: {},
    x: input.x,
    y: input.y,
    ...MAP_CARD_SIZE,
    childMapId: null,
    mapRef: target.id,
  }
  await record(() => db.nodes.add(card))
  return card
}

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
  const template = await db.templates.get(input.templateId)
  const node: IdeaNode = {
    id: nanoid(),
    title: 'Nouvelle idée',
    values: template ? defaultValues(template.fields) : {},
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

/** Puts a node in front of (or behind) every other node of its map. */
export async function restack(nodeId: string, where: 'front' | 'back') {
  await record(async () => {
    const node = await db.nodes.get(nodeId)
    if (!node) return
    const zs = (await db.nodes.where({ mapId: node.mapId }).toArray()).filter((n) => n.id !== nodeId).map((n) => n.z ?? 0)
    if (zs.length === 0) return
    const z = where === 'front' ? Math.max(...zs) + 1 : Math.min(...zs) - 1
    await db.nodes.update(nodeId, { z })
  })
}

export async function setBookmarked(nodeId: string, bookmarked: boolean) {
  await updateNode(nodeId, { bookmarkedAt: bookmarked ? Date.now() : undefined })
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
/** Places an alias of an idea on a map (the original, if given an alias). */
export async function createAlias(input: { mapId: string; targetId: string; x: number; y: number }): Promise<IdeaNode | undefined> {
  let target = await db.nodes.get(input.targetId)
  if (target?.aliasOf) target = await db.nodes.get(target.aliasOf)
  if (!target) return undefined
  const alias: IdeaNode = {
    id: nanoid(),
    projectId: target.projectId,
    mapId: input.mapId,
    templateId: target.templateId,
    title: '',
    values: {},
    x: input.x,
    y: input.y,
    width: target.width,
    height: target.height,
    childMapId: null,
    aliasOf: target.id,
  }
  await record(() => db.nodes.add(alias))
  return alias
}

export async function deleteNodes(nodeIds: string[]) {
  await record(async () => {
    // Deleting an idea removes its aliases too (deleting an alias only removes the alias).
    let queue = [...nodeIds, ...(await db.nodes.where('aliasOf').anyOf(nodeIds).primaryKeys())]
    while (queue.length > 0) {
      const nodes = await db.nodes.bulkGet(queue)
      const childMapIds = nodes.flatMap((n) => (n?.childMapId ? [n.childMapId] : []))
      await db.edges.where('source').anyOf(queue).delete()
      await db.edges.where('target').anyOf(queue).delete()
      await db.nodes.bulkDelete(queue)
      await db.maps.bulkDelete(childMapIds)
      queue = childMapIds.length ? await db.nodes.where('mapId').anyOf(childMapIds).primaryKeys() : []
      // Cards standing for a deleted map go with it.
      if (childMapIds.length) queue.push(...(await db.nodes.where('mapRef').anyOf(childMapIds).primaryKeys()))
      if (queue.length) queue.push(...(await db.nodes.where('aliasOf').anyOf(queue).primaryKeys()))
      if (childMapIds.length) await db.edges.where('mapId').anyOf(childMapIds).delete()
    }
  })
}

// ---------------------------------------------------------------- edges

export async function createEdge(
  input: Pick<IdeaEdge, 'projectId' | 'mapId' | 'source' | 'target'>,
): Promise<IdeaEdge> {
  // New links get the project's first link template (its label and look), if any.
  const [template] = await db.linkTemplates.where({ projectId: input.projectId }).sortBy('order')
  const edge: IdeaEdge = { id: nanoid(), ...DEFAULT_EDGE, ...(template && { ...template.style, label: template.label, templateId: template.id }), ...input }
  await record(() => db.edges.add(edge))
  return edge
}

/** Gives a link a template (or none: it keeps the template's look as its own). */
export async function setEdgeTemplate(edge: IdeaEdge, template: LinkTemplate | undefined, previous: LinkTemplate | undefined) {
  // The label follows the template unless it was renamed by hand.
  const labelIsDefault = !edge.label || edge.label === (previous?.label ?? DEFAULT_EDGE.label)
  const changes: Partial<IdeaEdge> = template
    ? { ...template.style, templateId: template.id, ...(labelIsDefault && { label: template.label }) }
    : { ...(previous?.style ?? {}), templateId: undefined }
  await updateEdge(edge.id, changes)
}

/** The look of a link: its template's when it has one, else its own. */
export function linkStyleOf(edge: IdeaEdge, templates: Map<string, LinkTemplate>): LinkStyle {
  const template = edge.templateId ? templates.get(edge.templateId) : undefined
  return template?.style ?? { arrows: edge.arrows, color: edge.color, strokeWidth: edge.strokeWidth, path: edge.path, dash: edge.dash }
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
