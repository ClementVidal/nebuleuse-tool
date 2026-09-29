import dagre from '@dagrejs/dagre'
import { nanoid } from 'nanoid'
import { pushChanges, type RecordChange, type Sql, type SyncTable } from './store.js'

/**
 * Server-side model of Nébuleuse, over the synced `records` table: the same records the app
 * stores in IndexedDB (see src/db/types.ts), read and written for one user. Everything written
 * here reaches the app through the sync.
 */

// ---------------------------------------------------------------- record types (mirror src/db/types.ts)

export type FieldType = 'richtext' | 'number' | 'date' | 'daterange'
export interface DateRange {
  start: string
  end: string
}
export type FieldValue = string | number | DateRange | null
export interface TemplateField {
  id: string
  label: string
  type: FieldType
  description?: string
  showOnNode?: boolean
  defaultValue?: FieldValue
  readOnly?: boolean
  timelineName?: string
}
export interface Template {
  id: string
  projectId: string
  name: string
  order: number
  style: { color: string; strokeWidth: string; dashed: boolean; shape: string }
  fields: TemplateField[]
}
export interface Project {
  id: string
  name: string
  rootMapId: string
  createdAt: number
  updatedAt: number
}
export interface MapRecord {
  id: string
  projectId: string
  parentNodeId: string | null
  viewport?: { x: number; y: number; zoom: number }
}
export interface NodeRecord {
  id: string
  projectId: string
  mapId: string
  templateId: string
  title: string
  values: Record<string, FieldValue>
  x: number
  y: number
  width: number
  height: number
  childMapId: string | null
  bookmarkedAt?: number
  status?: 'draft' | 'ready'
  z?: number
  /** Who wrote the idea: absent = the user, 'claude' = through the MCP server. */
  author?: 'claude'
  /** Id of the MCP call that created or last changed the idea (to review or undo a batch). */
  batchId?: string
}
export interface EdgeRecord {
  id: string
  projectId: string
  mapId: string
  source: string
  target: string
  label: string
  arrows: 'none' | 'start' | 'end' | 'both'
  color: string
  strokeWidth: string
  path: 'straight' | 'curved'
  dash: 'solid' | 'dashed' | 'dotted'
}

/** Mirrors DEFAULT_NODE_SIZE / DEFAULT_EDGE / defaultTemplates in src/db/defaults.ts. */
const NODE_WIDTH = 300
const DEFAULT_EDGE = { label: 'lié à', arrows: 'end', color: 'ink', strokeWidth: 'medium', path: 'curved', dash: 'solid' } as const

export function defaultTemplates(projectId: string): Template[] {
  return [
    {
      id: nanoid(),
      projectId,
      name: 'Note',
      order: 0,
      style: { color: 'orange', strokeWidth: 'thin', dashed: false, shape: 'sticky' },
      fields: [{ id: nanoid(), label: 'Contenu', type: 'richtext' }],
    },
    {
      id: nanoid(),
      projectId,
      name: 'Réflexion',
      order: 1,
      style: { color: 'blue', strokeWidth: 'medium', dashed: false, shape: 'card' },
      fields: [
        { id: nanoid(), label: 'Contenu', type: 'richtext' },
        { id: nanoid(), label: 'Maturité (1-5)', type: 'number' },
      ],
    },
    {
      id: nanoid(),
      projectId,
      name: 'Research',
      order: 2,
      style: { color: 'green', strokeWidth: 'medium', dashed: true, shape: 'card' },
      fields: [
        { id: nanoid(), label: 'Question', type: 'richtext' },
        { id: nanoid(), label: 'Sources', type: 'richtext' },
        { id: nanoid(), label: 'Date', type: 'date' },
      ],
    },
  ]
}

export class DomainError extends Error {}

// ---------------------------------------------------------------- reading

type Tables = { projects: Project; templates: Template; maps: MapRecord; nodes: NodeRecord; edges: EdgeRecord }

/** A user's view of the store, with the writes of one operation buffered then pushed at once. */
export class Store {
  private changes = new Map<string, RecordChange>()
  private cache = new Map<string, unknown>()
  readonly sql: Sql
  readonly userId: string

  constructor(sql: Sql, userId: string) {
    this.sql = sql
    this.userId = userId
  }

  private async rows<T>(table: SyncTable, where = '', params: unknown[] = []): Promise<T[]> {
    const rows = await this.sql.query<{ data: T | string }>(
      `select data from records where user_id = $1 and tbl = $2 and not deleted ${where}`,
      [this.userId, table, ...params],
    )
    const fromDb = rows.map((r) => (typeof r.data === 'string' ? (JSON.parse(r.data) as T) : r.data))
    // Overlay the writes buffered in this operation.
    const byId = new Map(fromDb.map((r) => [(r as { id: string }).id, r]))
    for (const c of this.changes.values()) {
      if (c.table !== table) continue
      if (c.deleted) byId.delete(c.id)
      else if (byId.has(c.id) || !where) byId.set(c.id, c.data as T)
    }
    return [...byId.values()]
  }

  async get<K extends keyof Tables>(table: K, id: string): Promise<Tables[K] | undefined> {
    const pending = this.changes.get(`${table}:${id}`)
    if (pending) return pending.deleted ? undefined : (pending.data as unknown as Tables[K])
    const [row] = await this.rows<Tables[K]>(table, `and id = $3`, [id])
    return row
  }

  /** Records of a table whose `data.<field>` equals `value`, including this operation's writes. */
  async where<K extends keyof Tables>(table: K, field: string, value: string): Promise<Tables[K][]> {
    const key = `${table}:${field}:${value}`
    let rows = this.cache.get(key) as Tables[K][] | undefined
    if (!rows) {
      rows = await this.rows<Tables[K]>(table, `and data->>'${field}' = $3`, [value])
      this.cache.set(key, rows)
    }
    const byId = new Map(rows.map((r) => [(r as { id: string }).id, r]))
    for (const c of this.changes.values()) {
      if (c.table !== table) continue
      if (c.deleted) byId.delete(c.id)
      else if ((c.data as Record<string, unknown>)[field] === value) byId.set(c.id, c.data as unknown as Tables[K])
      else byId.delete(c.id)
    }
    return [...byId.values()]
  }

  async all<K extends keyof Tables>(table: K): Promise<Tables[K][]> {
    return this.rows<Tables[K]>(table)
  }

  put<K extends keyof Tables>(table: K, record: Tables[K]) {
    const id = (record as { id: string }).id
    this.changes.set(`${table}:${id}`, { table, id, data: record as unknown as Record<string, unknown>, deleted: false })
  }

  remove(table: SyncTable, id: string) {
    this.changes.set(`${table}:${id}`, { table, id, data: null, deleted: true })
  }

  /** Writes everything buffered, atomically. */
  async commit() {
    const changes = [...this.changes.values()]
    for (let i = 0; i < changes.length; i += 500) await pushChanges(this.sql, this.userId, changes.slice(i, i + 500))
    this.changes.clear()
    this.cache.clear()
  }

  // -------------------------------------------------------------- helpers

  async project(projectId: string): Promise<Project> {
    const p = await this.get('projects', projectId)
    if (!p) throw new DomainError(`Projet introuvable : ${projectId}`)
    return p
  }

  async map(mapId: string): Promise<MapRecord> {
    const m = await this.get('maps', mapId)
    if (!m) throw new DomainError(`Carte introuvable : ${mapId}`)
    return m
  }

  async node(nodeId: string): Promise<NodeRecord> {
    const n = await this.get('nodes', nodeId)
    if (!n) throw new DomainError(`Idée introuvable : ${nodeId}`)
    return n
  }

  async templates(projectId: string): Promise<Template[]> {
    return (await this.where('templates', 'projectId', projectId)).sort((a, b) => a.order - b.order)
  }

  async touchProject(projectId: string) {
    const p = await this.get('projects', projectId)
    if (p) this.put('projects', { ...p, updatedAt: Date.now() })
  }
}

// ---------------------------------------------------------------- values

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Converts a value given by Claude to the stored form of a field, or throws a readable error. */
export function toFieldValue(field: TemplateField, value: unknown): FieldValue {
  if (value === null || value === undefined || value === '') return null
  switch (field.type) {
    case 'richtext':
      return String(value)
    case 'number': {
      const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
      if (!Number.isFinite(n)) throw new DomainError(`« ${field.label} » attend un nombre`)
      return n
    }
    case 'date': {
      const s = String(value).slice(0, 10)
      if (!ISO_DATE.test(s)) throw new DomainError(`« ${field.label} » attend une date AAAA-MM-JJ`)
      return s
    }
    case 'daterange': {
      let start: string | undefined
      let end: string | undefined
      if (typeof value === 'object' && value) ({ start, end } = value as { start?: string; end?: string })
      else [start, end] = String(value).split(/\s*(?:\/|→|\.\.)\s*/)
      if (!start || !end || !ISO_DATE.test(start.slice(0, 10)) || !ISO_DATE.test(end.slice(0, 10)))
        throw new DomainError(`« ${field.label} » attend une période { start: AAAA-MM-JJ, end: AAAA-MM-JJ }`)
      ;[start, end] = [start.slice(0, 10), end.slice(0, 10)]
      return start <= end ? { start, end } : { start: end, end: start }
    }
  }
}

function findTemplate(templates: Template[], name: string | undefined): Template {
  if (templates.length === 0) throw new DomainError('Ce projet n’a aucun template')
  if (!name) return templates.find((t) => t.name.toLowerCase() === 'réflexion') ?? templates[0]
  const t = templates.find((x) => x.name.toLowerCase() === name.trim().toLowerCase())
  if (!t) throw new DomainError(`Template inconnu : « ${name} ». Templates du projet : ${templates.map((x) => x.name).join(', ')}`)
  return t
}

function findField(template: Template, label: string): TemplateField {
  const f = template.fields.find((x) => x.label.toLowerCase() === label.trim().toLowerCase())
  if (!f) throw new DomainError(`Champ inconnu dans « ${template.name} » : « ${label} ». Champs : ${template.fields.map((x) => x.label).join(', ')}`)
  return f
}

/** Values of a new or updated idea from Claude's `text` and `fields`. */
function applyValues(template: Template, values: Record<string, FieldValue>, text: string | undefined, fields: Record<string, unknown> | undefined) {
  const out = { ...values }
  if (text !== undefined) {
    const rich = template.fields.find((f) => f.type === 'richtext')
    if (!rich) throw new DomainError(`Le template « ${template.name} » n’a pas de champ texte`)
    out[rich.id] = text
  }
  for (const [label, value] of Object.entries(fields ?? {})) {
    const f = findField(template, label)
    if (f.readOnly) throw new DomainError(`« ${f.label} » est en lecture seule`)
    out[f.id] = toFieldValue(f, value)
  }
  return out
}

/** A readable view of an idea for Claude: fields by name. */
export function describeNode(node: NodeRecord, template: Template | undefined) {
  const fields: Record<string, unknown> = {}
  for (const f of template?.fields ?? []) {
    const v = f.readOnly ? (f.defaultValue ?? null) : (node.values[f.id] ?? null)
    if (v !== null && v !== undefined && v !== '') fields[f.label] = v
  }
  return {
    id: node.id,
    title: node.title,
    template: template?.name ?? null,
    status: node.status ?? 'draft',
    fields,
    ...(node.childMapId ? { childMapId: node.childMapId } : {}),
    ...(node.author ? { author: node.author } : {}),
  }
}

// ---------------------------------------------------------------- queries

export async function listProjects(store: Store) {
  const projects = (await store.all('projects')).sort((a, b) => b.updatedAt - a.updatedAt)
  return projects.map((p) => ({ id: p.id, name: p.name, rootMapId: p.rootMapId, updatedAt: new Date(p.updatedAt).toISOString() }))
}

interface OutlineIdea {
  id: string
  title: string
  template: string | null
  status: string
  childMap?: { mapId: string; ideas: OutlineIdea[] }
}

/** The tree of a project's maps: each idea with, when it has one, the ideas of its own map. */
export async function getOutline(store: Store, projectId: string, maxDepth = 6) {
  const project = await store.project(projectId)
  const [nodes, templates] = await Promise.all([store.where('nodes', 'projectId', projectId), store.templates(projectId)])
  const tpl = new Map(templates.map((t) => [t.id, t.name]))
  const byMap = new Map<string, NodeRecord[]>()
  for (const n of nodes) byMap.set(n.mapId, [...(byMap.get(n.mapId) ?? []), n])
  const build = (mapId: string, depth: number): OutlineIdea[] =>
    (byMap.get(mapId) ?? [])
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((n) => ({
        id: n.id,
        title: n.title,
        template: tpl.get(n.templateId) ?? null,
        status: n.status ?? 'draft',
        ...(n.childMapId && (byMap.get(n.childMapId)?.length ?? 0) > 0
          ? { childMap: { mapId: n.childMapId, ideas: depth < maxDepth ? build(n.childMapId, depth + 1) : [] } }
          : {}),
      }))
  return { project: { id: project.id, name: project.name }, rootMapId: project.rootMapId, ideas: build(project.rootMapId, 1), totalIdeas: nodes.length }
}

export async function getMap(store: Store, mapId: string) {
  const map = await store.map(mapId)
  const [nodes, edges, templates] = await Promise.all([store.where('nodes', 'mapId', mapId), store.where('edges', 'mapId', mapId), store.templates(map.projectId)])
  const tpl = new Map(templates.map((t) => [t.id, t]))
  const parent = map.parentNodeId ? await store.get('nodes', map.parentNodeId) : undefined
  return {
    mapId: map.id,
    projectId: map.projectId,
    parentIdea: parent ? { id: parent.id, title: parent.title, mapId: parent.mapId } : null,
    ideas: nodes.sort((a, b) => a.y - b.y || a.x - b.x).map((n) => describeNode(n, tpl.get(n.templateId))),
    links: edges.map((e) => ({ id: e.id, from: e.source, to: e.target, label: e.label })),
  }
}

export async function listTemplates(store: Store, projectId: string) {
  await store.project(projectId)
  return (await store.templates(projectId)).map((t) => ({
    name: t.name,
    shape: t.style.shape,
    color: t.style.color,
    fields: t.fields.map((f) => ({
      name: f.label,
      type: f.type,
      ...(f.description ? { description: f.description } : {}),
      ...(f.readOnly ? { readOnly: true } : {}),
      ...(f.timelineName ? { timeline: f.timelineName } : {}),
    })),
  }))
}

export async function search(store: Store, projectId: string, query: string, limit = 30) {
  await store.project(projectId)
  const q = query.trim().toLowerCase()
  if (!q) return []
  const [nodes, templates] = await Promise.all([store.where('nodes', 'projectId', projectId), store.templates(projectId)])
  const tpl = new Map(templates.map((t) => [t.id, t]))
  const hits: { id: string; title: string; mapId: string; excerpt: string }[] = []
  for (const n of nodes) {
    const texts = [n.title, ...Object.values(n.values).map((v) => (typeof v === 'string' ? v : ''))]
    const hit = texts.find((t) => t.toLowerCase().includes(q))
    if (!hit) continue
    const i = hit.toLowerCase().indexOf(q)
    hits.push({ id: n.id, title: n.title, mapId: n.mapId, excerpt: hit.slice(Math.max(0, i - 80), i + q.length + 80) })
    if (hits.length >= limit) break
  }
  void tpl
  return hits
}

// ---------------------------------------------------------------- writing

export async function createProject(store: Store, name: string) {
  const id = nanoid()
  const rootMap: MapRecord = { id: nanoid(), projectId: id, parentNodeId: null }
  const now = Date.now()
  store.put('projects', { id, name: name.trim() || 'Sans titre', rootMapId: rootMap.id, createdAt: now, updatedAt: now })
  store.put('maps', rootMap)
  for (const t of defaultTemplates(id)) store.put('templates', t)
  return { projectId: id, rootMapId: rootMap.id }
}

export interface IdeaInput {
  key?: string
  title: string
  template?: string
  text?: string
  fields?: Record<string, unknown>
  status?: 'draft' | 'ready'
  /** The idea's own map (a sub-map), built in the same call. */
  children?: MapInput
}
export interface LinkInput {
  from: string
  to: string
  label?: string
  arrows?: EdgeRecord['arrows']
}
export interface MapInput {
  ideas: IdeaInput[]
  links?: LinkInput[]
}

/** Height of a node for its content (the app shows text with a fade when it doesn't fit). */
function estimateHeight(title: string, text: string | undefined, template: Template, values: Record<string, FieldValue>) {
  const filled = template.fields.filter((f) => values[f.id] !== undefined && values[f.id] !== null && f.showOnNode !== false)
  const lines = Math.ceil(title.length / 28) + (text ? Math.ceil(text.length / 42) + (text.match(/\n/g)?.length ?? 0) : 0)
  const timeline = filled.some((f) => f.type === 'date' || f.type === 'daterange') ? 78 : 0
  const labels = filled.filter((f) => f.type === 'richtext').length > 1 ? 18 * filled.filter((f) => f.type === 'richtext').length : 0
  return Math.round(Math.min(480, Math.max(170, 120 + lines * 20 + timeline + labels)))
}

/**
 * Lays out new nodes of a map: a layered graph (dagre) following their links, placed to the
 * right of the nodes already there.
 */
function layout(newNodes: NodeRecord[], edges: { source: string; target: string }[], existing: NodeRecord[]) {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 110, marginx: 0, marginy: 0 })
  g.setDefaultEdgeLabel(() => ({}))
  const ids = new Set(newNodes.map((n) => n.id))
  for (const n of newNodes) g.setNode(n.id, { width: n.width, height: n.height })
  for (const e of edges) if (ids.has(e.source) && ids.has(e.target)) g.setEdge(e.source, e.target)
  dagre.layout(g)
  // Unlinked ideas all land in the first column: wrap them into a grid instead.
  const linked = new Set(edges.flatMap((e) => (ids.has(e.source) && ids.has(e.target) ? [e.source, e.target] : [])))
  const loose = newNodes.filter((n) => !linked.has(n.id))
  const originX = existing.length ? Math.max(...existing.map((n) => n.x + n.width)) + 160 : 0
  const originY = existing.length ? Math.min(...existing.map((n) => n.y)) : 0
  let maxX = originX
  for (const n of newNodes) {
    if (!linked.has(n.id)) continue
    const p = g.node(n.id)
    n.x = Math.round(originX + p.x - n.width / 2)
    n.y = Math.round(originY + p.y - n.height / 2)
    maxX = Math.max(maxX, n.x + n.width)
  }
  const linkedBottom = Math.max(originY, ...newNodes.filter((n) => linked.has(n.id)).map((n) => n.y + n.height))
  const columns = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(loose.length))))
  const top = linked.size ? linkedBottom + 100 : originY
  const rowHeights: number[] = []
  loose.forEach((n, i) => {
    const row = Math.floor(i / columns)
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, n.height)
  })
  loose.forEach((n, i) => {
    const row = Math.floor(i / columns)
    n.x = originX + (i % columns) * (NODE_WIDTH + 60)
    n.y = top + rowHeights.slice(0, row).reduce((a, h) => a + h + 60, 0)
  })
}

interface BuildContext {
  store: Store
  projectId: string
  templates: Template[]
  batchId: string
  created: { key: string | undefined; id: string; title: string; mapId: string }[]
  links: number
}

async function buildInto(ctx: BuildContext, mapId: string, input: MapInput) {
  const { store } = ctx
  const existing = await store.where('nodes', 'mapId', mapId)
  const keyToId = new Map<string, string>()
  const newNodes: NodeRecord[] = []
  const pendingChildren: [NodeRecord, MapInput][] = []
  for (const idea of input.ideas ?? []) {
    if (!idea.title?.trim()) throw new DomainError('Chaque idée doit avoir un titre')
    const template = findTemplate(ctx.templates, idea.template)
    const defaults: Record<string, FieldValue> = {}
    for (const f of template.fields) if (!f.readOnly && f.defaultValue !== undefined && f.defaultValue !== null) defaults[f.id] = f.defaultValue
    const values = applyValues(template, defaults, idea.text, idea.fields)
    const node: NodeRecord = {
      id: nanoid(),
      projectId: ctx.projectId,
      mapId,
      templateId: template.id,
      title: idea.title.trim(),
      values,
      x: 0,
      y: 0,
      width: NODE_WIDTH,
      height: estimateHeight(idea.title, idea.text, template, values),
      childMapId: null,
      status: idea.status ?? 'draft',
      author: 'claude',
      batchId: ctx.batchId,
    }
    if (idea.key) {
      if (keyToId.has(idea.key)) throw new DomainError(`Clé en double : ${idea.key}`)
      keyToId.set(idea.key, node.id)
    }
    newNodes.push(node)
    ctx.created.push({ key: idea.key, id: node.id, title: node.title, mapId })
    if (idea.children?.ideas?.length) pendingChildren.push([node, idea.children])
  }
  const existingIds = new Set(existing.map((n) => n.id))
  const resolve = (ref: string) => {
    const id = keyToId.get(ref) ?? (existingIds.has(ref) ? ref : undefined)
    if (!id) throw new DomainError(`Lien vers « ${ref} » : ni une clé de cet appel, ni une idée de cette carte`)
    return id
  }
  const edges: EdgeRecord[] = (input.links ?? []).map((l) => ({
    id: nanoid(),
    projectId: ctx.projectId,
    mapId,
    ...DEFAULT_EDGE,
    source: resolve(l.from),
    target: resolve(l.to),
    label: l.label ?? DEFAULT_EDGE.label,
    arrows: l.arrows ?? DEFAULT_EDGE.arrows,
  }))
  layout(newNodes, edges, existing)
  for (const n of newNodes) store.put('nodes', n)
  for (const e of edges) store.put('edges', e)
  ctx.links += edges.length
  for (const [node, children] of pendingChildren) {
    const childMap: MapRecord = { id: nanoid(), projectId: ctx.projectId, parentNodeId: node.id }
    store.put('maps', childMap)
    node.childMapId = childMap.id
    store.put('nodes', node)
    await buildInto(ctx, childMap.id, children)
  }
}

/** The map of an idea, created if it doesn't exist yet (as when entering it in the app). */
async function ensureChildMap(store: Store, nodeId: string): Promise<string> {
  const node = await store.node(nodeId)
  if (node.childMapId && (await store.get('maps', node.childMapId))) return node.childMapId
  const map: MapRecord = { id: nanoid(), projectId: node.projectId, parentNodeId: node.id }
  store.put('maps', map)
  store.put('nodes', { ...node, childMapId: map.id })
  return map.id
}

export type BuildTarget = { projectId: string } | { mapId: string } | { ideaId: string }

/** Adds ideas (and their sub-maps) and links to a map. */
export async function buildMap(store: Store, target: BuildTarget, input: MapInput) {
  let mapId: string
  if ('mapId' in target && target.mapId) mapId = (await store.map(target.mapId)).id
  else if ('ideaId' in target && target.ideaId) mapId = await ensureChildMap(store, target.ideaId)
  else if ('projectId' in target && target.projectId) mapId = (await store.project(target.projectId)).rootMapId
  else throw new DomainError('Cible attendue : projectId (carte racine), mapId, ou ideaId (carte de cette idée)')
  const map = await store.map(mapId)
  const ctx: BuildContext = {
    store,
    projectId: map.projectId,
    templates: await store.templates(map.projectId),
    batchId: nanoid(10),
    created: [],
    links: 0,
  }
  await buildInto(ctx, mapId, input)
  await store.touchProject(map.projectId)
  return { mapId, batchId: ctx.batchId, ideas: ctx.created, linksCreated: ctx.links }
}

export type Operation =
  | { op: 'update_idea'; id: string; title?: string; text?: string; fields?: Record<string, unknown>; status?: 'draft' | 'ready'; template?: string }
  | { op: 'delete_idea'; id: string }
  | { op: 'add_link'; from: string; to: string; label?: string; arrows?: EdgeRecord['arrows'] }
  | { op: 'update_link'; id: string; label?: string; arrows?: EdgeRecord['arrows'] }
  | { op: 'delete_link'; id: string }

/** Deletes ideas with everything under them (links, sub-maps, their ideas), as the app does. */
async function deleteIdeas(store: Store, ids: string[]) {
  let queue = [...ids]
  let count = 0
  while (queue.length) {
    const next: string[] = []
    for (const id of queue) {
      const node = await store.get('nodes', id)
      if (!node) continue
      count++
      for (const e of await store.where('edges', 'mapId', node.mapId)) if (e.source === id || e.target === id) store.remove('edges', e.id)
      store.remove('nodes', id)
      if (node.childMapId) {
        for (const e of await store.where('edges', 'mapId', node.childMapId)) store.remove('edges', e.id)
        next.push(...(await store.where('nodes', 'mapId', node.childMapId)).map((n) => n.id))
        store.remove('maps', node.childMapId)
      }
    }
    queue = next
  }
  return count
}

export async function updateMap(store: Store, mapId: string, operations: Operation[]) {
  const map = await store.map(mapId)
  const templates = await store.templates(map.projectId)
  const batchId = nanoid(10)
  const done: string[] = []
  for (const [i, op] of operations.entries()) {
    const where = `opération ${i + 1} (${op.op})`
    try {
      switch (op.op) {
        case 'update_idea': {
          const node = await store.node(op.id)
          if (node.mapId !== mapId) throw new DomainError('cette idée est sur une autre carte')
          const template = op.template ? findTemplate(templates, op.template) : templates.find((t) => t.id === node.templateId)
          if (!template) throw new DomainError('template de l’idée introuvable')
          store.put('nodes', {
            ...node,
            templateId: template.id,
            title: op.title?.trim() || node.title,
            values: applyValues(template, node.values, op.text, op.fields),
            status: op.status ?? node.status,
            batchId,
          })
          done.push(`idée modifiée : ${op.title ?? node.title}`)
          break
        }
        case 'delete_idea': {
          const node = await store.node(op.id)
          if (node.mapId !== mapId) throw new DomainError('cette idée est sur une autre carte')
          const n = await deleteIdeas(store, [op.id])
          done.push(`idée supprimée : ${node.title}${n > 1 ? ` (+ ${n - 1} dans sa sous-carte)` : ''}`)
          break
        }
        case 'add_link': {
          const [a, b] = await Promise.all([store.node(op.from), store.node(op.to)])
          if (a.mapId !== mapId || b.mapId !== mapId) throw new DomainError('les deux idées doivent être sur cette carte')
          store.put('edges', {
            id: nanoid(),
            projectId: map.projectId,
            mapId,
            ...DEFAULT_EDGE,
            source: a.id,
            target: b.id,
            label: op.label ?? DEFAULT_EDGE.label,
            arrows: op.arrows ?? DEFAULT_EDGE.arrows,
          })
          done.push(`lien ajouté : ${a.title} → ${b.title}`)
          break
        }
        case 'update_link': {
          const edge = await store.get('edges', op.id)
          if (!edge || edge.mapId !== mapId) throw new DomainError(`lien introuvable sur cette carte : ${op.id}`)
          store.put('edges', { ...edge, label: op.label ?? edge.label, arrows: op.arrows ?? edge.arrows })
          done.push(`lien modifié : ${op.label ?? edge.label}`)
          break
        }
        case 'delete_link': {
          const edge = await store.get('edges', op.id)
          if (!edge || edge.mapId !== mapId) throw new DomainError(`lien introuvable sur cette carte : ${op.id}`)
          store.remove('edges', op.id)
          done.push('lien supprimé')
          break
        }
        default:
          throw new DomainError(`opération inconnue : ${(op as { op: string }).op}`)
      }
    } catch (error) {
      if (error instanceof DomainError) throw new DomainError(`${where} : ${error.message} (rien n’a été modifié)`)
      throw error
    }
  }
  await store.touchProject(map.projectId)
  return { mapId, batchId, done }
}
