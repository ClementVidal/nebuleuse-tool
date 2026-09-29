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
  /** « Référençable »: can be placed as a card on the project's other maps. */
  reusable?: boolean
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
  /** Offered as an alias on the project's other maps. */
  reusable?: boolean
  /** An alias: its content is the one of this idea, only its place is its own. */
  aliasOf?: string
  /** Map card: stands for this map of the project (no content of its own). */
  mapRef?: string
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
  /** Link template: when it exists, its style replaces the link's own. */
  templateId?: string
}
export type LinkStyle = Pick<EdgeRecord, 'arrows' | 'color' | 'strokeWidth' | 'path' | 'dash'>
export interface LinkTemplate {
  id: string
  projectId: string
  name: string
  order: number
  label: string
  style: LinkStyle
}

/** Mirrors DEFAULT_NODE_SIZE / DEFAULT_EDGE / defaultTemplates in src/db/defaults.ts. */
const NODE_WIDTH = 300
const DEFAULT_EDGE = {
  label: 'lié à',
  arrows: 'end',
  color: 'ink',
  strokeWidth: 'medium',
  path: 'curved',
  dash: 'solid',
} as const

const linkStyle = (style: Partial<LinkStyle>): LinkStyle => ({
  arrows: DEFAULT_EDGE.arrows,
  color: DEFAULT_EDGE.color,
  strokeWidth: DEFAULT_EDGE.strokeWidth,
  path: DEFAULT_EDGE.path,
  dash: DEFAULT_EDGE.dash,
  ...style,
})

/** Mirrors defaultLinkTemplates in src/db/defaults.ts. */
export function defaultLinkTemplates(projectId: string): LinkTemplate[] {
  return [
    { id: nanoid(), projectId, order: 0, name: 'Lien', label: 'lié à', style: linkStyle({}) },
    { id: nanoid(), projectId, order: 1, name: 'Cause', label: 'cause', style: linkStyle({ color: 'red', strokeWidth: 'thick' }) },
    { id: nanoid(), projectId, order: 2, name: 'Opposition', label: 's’oppose à', style: linkStyle({ color: 'violet', dash: 'dashed', arrows: 'both' }) },
    { id: nanoid(), projectId, order: 3, name: 'Illustration', label: 'illustre', style: linkStyle({ color: 'green', dash: 'dotted' }) },
  ]
}

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

type Tables = { projects: Project; templates: Template; maps: MapRecord; nodes: NodeRecord; edges: EdgeRecord; linkTemplates: LinkTemplate }

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

  async linkTemplates(projectId: string): Promise<LinkTemplate[]> {
    return (await this.where('linkTemplates', 'projectId', projectId)).sort((a, b) => a.order - b.order)
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
  if (!t)
    throw new DomainError(`Template inconnu : « ${name} ». Templates du projet : ${templates.map((x) => x.name).join(', ')}`)
  return t
}

function findField(template: Template, label: string): TemplateField {
  const f = template.fields.find((x) => x.label.toLowerCase() === label.trim().toLowerCase())
  if (!f)
    throw new DomainError(
      `Champ inconnu dans « ${template.name} » : « ${label} ». Champs : ${template.fields.map((x) => x.label).join(', ')}`,
    )
  return f
}

/** Values of a new or updated idea from Claude's `text` and `fields`. */
function applyValues(
  template: Template,
  values: Record<string, FieldValue>,
  text: string | undefined,
  fields: Record<string, unknown> | undefined,
) {
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
export function describeNode(node: NodeRecord, template: Template | undefined, aliasId?: string) {
  const fields: Record<string, unknown> = {}
  for (const f of template?.fields ?? []) {
    const v = f.readOnly ? (f.defaultValue ?? null) : (node.values[f.id] ?? null)
    if (v !== null && v !== undefined && v !== '') fields[f.label] = v
  }
  return {
    ...(aliasId ? { id: aliasId, aliasOf: node.id } : { id: node.id }),
    title: node.title,
    template: template?.name ?? null,
    status: node.status ?? 'draft',
    fields,
    ...(node.childMapId ? { childMapId: node.childMapId } : {}),
    ...(node.author ? { author: node.author } : {}),
    ...(node.reusable ? { reusable: true } : {}),
  }
}

/** Originals of the aliases among these ideas, by id (a missing original is left out). */
async function aliasTargets(store: Store, nodes: NodeRecord[]) {
  const ids = [...new Set(nodes.flatMap((n) => (n.aliasOf ? [n.aliasOf] : [])))]
  const found = await Promise.all(ids.map((id) => store.get('nodes', id)))
  return new Map(found.flatMap((n) => (n ? [[n.id, n] as const] : [])))
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
  aliasOf?: string
  reusable?: boolean
  mapCard?: { mapId: string; name: string }
  childMap?: { mapId: string; ideas: OutlineIdea[] }
}

/** The tree of a project's maps: each idea with, when it has one, the ideas of its own map. */
export async function getOutline(store: Store, projectId: string, maxDepth = 6) {
  const project = await store.project(projectId)
  const [nodes, templates] = await Promise.all([store.where('nodes', 'projectId', projectId), store.templates(projectId)])
  const tpl = new Map(templates.map((t) => [t.id, t.name]))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const maps = new Map((await store.where('maps', 'projectId', projectId)).map((m) => [m.id, m]))
  const mapName = (mapId: string) => {
    const m = maps.get(mapId)
    return m?.parentNodeId ? (byId.get(m.parentNodeId)?.title ?? '(carte introuvable)') : m ? project.name : '(carte introuvable)'
  }
  const byMap = new Map<string, NodeRecord[]>()
  for (const n of nodes) byMap.set(n.mapId, [...(byMap.get(n.mapId) ?? []), n])
  const build = (mapId: string, depth: number): OutlineIdea[] =>
    (byMap.get(mapId) ?? [])
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((n): OutlineIdea => {
        if (n.mapRef) return { id: n.id, mapCard: { mapId: n.mapRef, name: mapName(n.mapRef) }, title: `Carte : ${mapName(n.mapRef)}`, template: null, status: 'ready' }
        // An alias: the original's title, its sub-map is listed under the original.
        const original = n.aliasOf ? byId.get(n.aliasOf) : undefined
        if (n.aliasOf)
          return {
            id: n.id,
            aliasOf: n.aliasOf,
            title: original?.title ?? '(idée introuvable)',
            template: original ? (tpl.get(original.templateId) ?? null) : null,
            status: original?.status ?? 'draft',
          }
        return {
          id: n.id,
          title: n.title,
          template: tpl.get(n.templateId) ?? null,
          status: n.status ?? 'draft',
          ...(n.reusable ? { reusable: true } : {}),
          ...(n.childMapId && (byMap.get(n.childMapId)?.length ?? 0) > 0
            ? { childMap: { mapId: n.childMapId, ideas: depth < maxDepth ? build(n.childMapId, depth + 1) : [] } }
            : {}),
        }
      })
  return {
    project: { id: project.id, name: project.name },
    rootMapId: project.rootMapId,
    ideas: build(project.rootMapId, 1),
    totalIdeas: nodes.filter((n) => !n.aliasOf && !n.mapRef).length,
    referenceableMaps: [...maps.values()].filter((m) => m.reusable).map((m) => ({ mapId: m.id, name: mapName(m.id) })),
  }
}

export async function getMap(store: Store, mapId: string) {
  const map = await store.map(mapId)
  const [nodes, edges, templates, linkTemplates] = await Promise.all([
    store.where('nodes', 'mapId', mapId),
    store.where('edges', 'mapId', mapId),
    store.templates(map.projectId),
    store.linkTemplates(map.projectId),
  ])
  const linkType = new Map(linkTemplates.map((t) => [t.id, t.name]))
  const cardMaps = new Map<string, string>()
  for (const id of new Set(nodes.flatMap((n) => (n.mapRef ? [n.mapRef] : [])))) cardMaps.set(id, await mapName(store, id))
  const tpl = new Map(templates.map((t) => [t.id, t]))
  const parent = map.parentNodeId ? await store.get('nodes', map.parentNodeId) : undefined
  const originals = await aliasTargets(store, nodes)
  const describe = (n: NodeRecord) => {
    if (n.mapRef) return { id: n.id, mapCard: { mapId: n.mapRef, name: cardMaps.get(n.mapRef) } }
    if (!n.aliasOf) return describeNode(n, tpl.get(n.templateId))
    const original = originals.get(n.aliasOf)
    return original
      ? describeNode(original, tpl.get(original.templateId), n.id)
      : { id: n.id, aliasOf: n.aliasOf, title: '(idée introuvable)' }
  }
  return {
    mapId: map.id,
    projectId: map.projectId,
    parentIdea: parent ? { id: parent.id, title: parent.title, mapId: parent.mapId } : null,
    ideas: nodes.sort((a, b) => a.y - b.y || a.x - b.x).map(describe),
    reusable: !!map.reusable,
    links: edges.map((e) => ({
      id: e.id,
      from: e.source,
      to: e.target,
      label: e.label,
      ...(e.templateId && linkType.has(e.templateId) ? { type: linkType.get(e.templateId) } : {}),
    })),
  }
}

/** Name of a map: its owner idea's title, or the project name for the root map. */
async function mapName(store: Store, mapId: string) {
  const map = await store.get('maps', mapId)
  if (!map) return '(carte introuvable)'
  if (!map.parentNodeId) return (await store.get('projects', map.projectId))?.name ?? ''
  return (await store.get('nodes', map.parentNodeId))?.title ?? '(carte introuvable)'
}

export async function listTemplates(store: Store, projectId: string) {
  await store.project(projectId)
  return {
    ideaTemplates: (await store.templates(projectId)).map((t) => ({
      name: t.name,
      shape: t.style.shape,
      color: t.style.color,
      strokeWidth: t.style.strokeWidth,
      dashed: t.style.dashed,
      fields: t.fields.map(describeField),
    })),
    linkTemplates: (await store.linkTemplates(projectId)).map(describeLinkTemplate),
  }
}

function describeLinkTemplate(t: LinkTemplate) {
  return { name: t.name, label: t.label, ...t.style }
}

function describeField(f: TemplateField) {
  return {
    name: f.label,
    type: f.type,
    ...(f.description ? { description: f.description } : {}),
    ...(f.showOnNode === false ? { visibleOnNode: false } : {}),
    ...(f.readOnly ? { readOnly: true } : {}),
    ...(f.defaultValue !== undefined && f.defaultValue !== null ? { default: f.defaultValue } : {}),
    ...(f.timelineName ? { timeline: f.timelineName } : {}),
  }
}

export async function search(store: Store, projectId: string, query: string, limit = 30) {
  await store.project(projectId)
  const q = query.trim().toLowerCase()
  if (!q) return []
  const [nodes, templates] = await Promise.all([store.where('nodes', 'projectId', projectId), store.templates(projectId)])
  const tpl = new Map(templates.map((t) => [t.id, t]))
  const hits: { id: string; title: string; mapId: string; excerpt: string }[] = []
  for (const n of nodes) {
    if (n.aliasOf || n.mapRef) continue
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
  for (const t of defaultLinkTemplates(id)) store.put('linkTemplates', t)
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
  /** Link template name. */
  type?: string
}

function findLinkTemplate(templates: LinkTemplate[], name: string): LinkTemplate {
  const t = templates.find((x) => x.name.toLowerCase() === name.trim().toLowerCase())
  if (!t)
    throw new DomainError(`Type de lien inconnu : « ${name} ». Types du projet : ${templates.map((x) => x.name).join(', ') || 'aucun'}`)
  return t
}

/**
 * A link's template, style and label from Claude's input: the named type, else the project's
 * first one (as in the app). Arrows other than the type's make an untyped link with the type's look.
 */
function linkFields(templates: LinkTemplate[], input: { label?: string; arrows?: EdgeRecord['arrows']; type?: string }) {
  const template = input.type ? findLinkTemplate(templates, input.type) : templates[0]
  const style = template?.style ?? linkStyle({})
  const arrows = input.arrows ?? style.arrows
  const typed = template && arrows === style.arrows
  return {
    ...style,
    arrows,
    label: input.label ?? template?.label ?? DEFAULT_EDGE.label,
    ...(typed ? { templateId: template.id } : {}),
  }
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
  const labels =
    filled.filter((f) => f.type === 'richtext').length > 1 ? 18 * filled.filter((f) => f.type === 'richtext').length : 0
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
  linkTemplates: LinkTemplate[]
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
    for (const f of template.fields)
      if (!f.readOnly && f.defaultValue !== undefined && f.defaultValue !== null) defaults[f.id] = f.defaultValue
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
    source: resolve(l.from),
    target: resolve(l.to),
    ...linkFields(ctx.linkTemplates, l),
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
    linkTemplates: await store.linkTemplates(map.projectId),
    batchId: nanoid(10),
    created: [],
    links: 0,
  }
  await buildInto(ctx, mapId, input)
  await store.touchProject(map.projectId)
  return { mapId, batchId: ctx.batchId, ideas: ctx.created, linksCreated: ctx.links }
}

export type Operation =
  | {
      op: 'update_idea'
      id: string
      title?: string
      text?: string
      fields?: Record<string, unknown>
      status?: 'draft' | 'ready'
      template?: string
      referenceable?: boolean
    }
  | { op: 'delete_idea'; id: string }
  | { op: 'set_referenceable'; value: boolean }
  | { op: 'add_map_card'; map: string }
  | { op: 'add_link'; from: string; to: string; label?: string; arrows?: EdgeRecord['arrows']; type?: string }
  | { op: 'update_link'; id: string; label?: string; arrows?: EdgeRecord['arrows']; type?: string }
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
      for (const e of await store.where('edges', 'mapId', node.mapId))
        if (e.source === id || e.target === id) store.remove('edges', e.id)
      store.remove('nodes', id)
      // Deleting an idea removes its aliases too.
      if (!node.aliasOf) next.push(...(await store.where('nodes', 'aliasOf', id)).map((n) => n.id))
      if (node.childMapId) {
        for (const e of await store.where('edges', 'mapId', node.childMapId)) store.remove('edges', e.id)
        next.push(...(await store.where('nodes', 'mapId', node.childMapId)).map((n) => n.id))
        // Cards standing for the deleted map go with it.
        next.push(...(await store.where('nodes', 'mapRef', node.childMapId)).map((n) => n.id))
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
  const linkTemplates = await store.linkTemplates(map.projectId)
  const batchId = nanoid(10)
  const done: string[] = []
  for (const [i, op] of operations.entries()) {
    const where = `opération ${i + 1} (${op.op})`
    try {
      switch (op.op) {
        case 'update_idea': {
          const placed = await store.node(op.id)
          if (placed.mapId !== mapId) throw new DomainError('cette idée est sur une autre carte')
          if (placed.mapRef) throw new DomainError('c’est une carte (un renvoi vers une autre carte), pas une idée : rien à modifier')
          // An alias: the change goes to the original, seen everywhere it's placed.
          const node = placed.aliasOf ? await store.node(placed.aliasOf) : placed
          const template = op.template ? findTemplate(templates, op.template) : templates.find((t) => t.id === node.templateId)
          if (!template) throw new DomainError('template de l’idée introuvable')
          store.put('nodes', {
            ...node,
            templateId: template.id,
            title: op.title?.trim() || node.title,
            values: applyValues(template, node.values, op.text, op.fields),
            status: op.status ?? node.status,
            ...(op.referenceable !== undefined ? { reusable: op.referenceable || undefined } : {}),
            batchId,
          })
          done.push(`idée modifiée : ${op.title ?? node.title}`)
          break
        }
        case 'delete_idea': {
          const node = await store.node(op.id)
          if (node.mapId !== mapId) throw new DomainError('cette idée est sur une autre carte')
          const n = await deleteIdeas(store, [op.id])
          if (node.mapRef) {
            done.push('renvoi vers une carte retiré (la carte reste)')
            break
          }
          if (node.aliasOf) {
            done.push('alias retiré (l’idée d’origine reste)')
            break
          }
          done.push(`idée supprimée : ${node.title}${n > 1 ? ` (+ ${n - 1} dans sa sous-carte)` : ''}`)
          break
        }
        case 'set_referenceable': {
          store.put('maps', { ...(await store.map(mapId)), reusable: op.value || undefined })
          done.push(op.value ? 'carte référençable' : 'carte non référençable')
          break
        }
        case 'add_map_card': {
          const target = await store.map(String(op.map))
          if (target.projectId !== map.projectId) throw new DomainError('cette carte est dans un autre projet')
          if (target.id === mapId) throw new DomainError('une carte ne peut pas se référencer elle-même')
          if (!target.reusable)
            throw new DomainError('cette carte n’est pas référençable : rends-la référençable (set_referenceable sur elle) d’abord')
          // Placed right of what's on the map.
          const onMap = await store.where('nodes', 'mapId', mapId)
          const right = onMap.reduce((m, n) => Math.max(m, n.x + n.width), 0)
          const top = onMap.reduce((m, n) => Math.min(m, n.y), onMap.length ? Infinity : 0)
          const card: NodeRecord = {
            id: nanoid(),
            projectId: map.projectId,
            mapId,
            templateId: '',
            title: '',
            values: {},
            x: onMap.length ? right + 80 : 0,
            y: top,
            width: 260,
            height: 132,
            childMapId: null,
            mapRef: target.id,
            batchId,
          }
          store.put('nodes', card)
          done.push(`carte ajoutée : ${await mapName(store, target.id)} (id ${card.id}, à relier avec add_link)`)
          break
        }
        case 'add_link': {
          const [a, b] = await Promise.all([store.node(op.from), store.node(op.to)])
          if (a.mapId !== mapId || b.mapId !== mapId) throw new DomainError('les deux idées doivent être sur cette carte')
          store.put('edges', {
            id: nanoid(),
            projectId: map.projectId,
            mapId,
            source: a.id,
            target: b.id,
            ...linkFields(linkTemplates, op),
          })
          done.push(`lien ajouté : ${a.title} → ${b.title}`)
          break
        }
        case 'update_link': {
          const edge = await store.get('edges', op.id)
          if (!edge || edge.mapId !== mapId) throw new DomainError(`lien introuvable sur cette carte : ${op.id}`)
          if (op.type !== undefined) {
            // New type: its look, and its label unless one is given.
            const { templateId: _, ...rest } = edge
            store.put('edges', { ...rest, ...linkFields(linkTemplates, { type: op.type, label: op.label, arrows: op.arrows }) })
          } else {
            const next = { ...edge, label: op.label ?? edge.label }
            // Other arrows than the type's: the link keeps the type's look as its own.
            const template = edge.templateId ? linkTemplates.find((t) => t.id === edge.templateId) : undefined
            if (op.arrows && template && op.arrows !== template.style.arrows) {
              Object.assign(next, template.style, { arrows: op.arrows })
              delete next.templateId
            } else if (op.arrows) next.arrows = op.arrows
            store.put('edges', next)
          }
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

// ---------------------------------------------------------------- templates

/** Mirror src/db/palette.ts and NodeShape. */
const COLORS = ['ink', 'red', 'green', 'blue', 'orange', 'violet']
const STROKE_WIDTHS = ['thin', 'medium', 'thick']
const SHAPES = ['card', 'sticky']
const FIELD_TYPES: FieldType[] = ['richtext', 'number', 'date', 'daterange']

export interface StyleInput {
  color?: string
  shape?: string
  strokeWidth?: string
  dashed?: boolean
}
export interface FieldInput {
  name?: string
  type?: string
  description?: string | null
  visibleOnNode?: boolean
  readOnly?: boolean
  default?: unknown
  timeline?: string | null
}
export type FieldOperation =
  | ({ op: 'add_field'; position?: number } & FieldInput)
  | ({ op: 'update_field'; field: string; rename?: string } & Omit<FieldInput, 'name'>)
  | { op: 'remove_field'; field: string }
  | { op: 'move_field'; field: string; position: number }

function pick<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  const v = String(value).trim().toLowerCase() as T
  if (!allowed.includes(v)) throw new DomainError(`${what} inconnu(e) : « ${String(value)} ». Valeurs possibles : ${allowed.join(', ')}`)
  return v
}

function applyStyle(style: Template['style'], input: StyleInput): Template['style'] {
  return {
    color: input.color !== undefined ? pick(input.color, COLORS, 'Couleur') : style.color,
    shape: input.shape !== undefined ? pick(input.shape, SHAPES, 'Forme') : style.shape,
    strokeWidth: input.strokeWidth !== undefined ? pick(input.strokeWidth, STROKE_WIDTHS, 'Épaisseur') : style.strokeWidth,
    dashed: input.dashed !== undefined ? !!input.dashed : style.dashed,
  }
}

/** Applies Claude's options to a field (a new one when `field` has no id yet). */
function applyField(field: TemplateField, input: Omit<FieldInput, 'name'>): TemplateField {
  const next: TemplateField = { ...field }
  if (input.type !== undefined) {
    const type = pick(input.type, FIELD_TYPES, 'Type de champ')
    // Another kind of value: the default no longer applies (as in the app).
    if (type !== next.type) delete next.defaultValue
    next.type = type
  }
  if (input.description !== undefined) {
    if (input.description) next.description = input.description
    else delete next.description
  }
  if (input.visibleOnNode !== undefined) {
    if (input.visibleOnNode) delete next.showOnNode
    else next.showOnNode = false
  }
  if (input.readOnly !== undefined) {
    if (input.readOnly) next.readOnly = true
    else delete next.readOnly
  }
  if (input.default !== undefined) {
    const value = toFieldValue(next, input.default)
    if (value === null) delete next.defaultValue
    else next.defaultValue = value
  }
  if (input.timeline !== undefined) {
    if (input.timeline?.trim()) next.timelineName = input.timeline.trim()
    else delete next.timelineName
  }
  if (next.timelineName && next.type !== 'date' && next.type !== 'daterange')
    throw new DomainError(`« ${next.label} » : seule une date ou une période peut être sur une frise`)
  return next
}

function newField(input: FieldInput, existing: TemplateField[]): TemplateField {
  const label = input.name?.trim()
  if (!label) throw new DomainError('Chaque champ doit avoir un nom')
  if (existing.some((f) => f.label.toLowerCase() === label.toLowerCase())) throw new DomainError(`Champ en double : « ${label} »`)
  return applyField({ id: nanoid(), label, type: pick(input.type ?? 'richtext', FIELD_TYPES, 'Type de champ') }, { ...input, type: undefined })
}

function checkTemplateName(templates: Template[], name: string | undefined, except?: string) {
  const n = name?.trim()
  if (!n) throw new DomainError('Le template doit avoir un nom')
  if (templates.some((t) => t.id !== except && t.name.toLowerCase() === n.toLowerCase()))
    throw new DomainError(`Un template « ${n} » existe déjà dans ce projet`)
  return n
}

export async function createTemplate(store: Store, projectId: string, input: { name: string; fields?: FieldInput[] } & StyleInput) {
  await store.project(projectId)
  const templates = await store.templates(projectId)
  const name = checkTemplateName(templates, input.name)
  const fields: TemplateField[] = []
  for (const [i, f] of (input.fields ?? []).entries()) {
    try {
      fields.push(newField(f, fields))
    } catch (error) {
      if (error instanceof DomainError) throw new DomainError(`champ ${i + 1} : ${error.message} (rien n’a été créé)`)
      throw error
    }
  }
  const template: Template = {
    id: nanoid(),
    projectId,
    name,
    order: (templates.at(-1)?.order ?? -1) + 1,
    style: applyStyle({ color: 'ink', strokeWidth: 'medium', dashed: false, shape: 'card' }, input),
    fields,
  }
  store.put('templates', template)
  await store.touchProject(projectId)
  return { name: template.name, ...template.style, fields: template.fields.map(describeField) }
}

export async function updateTemplate(
  store: Store,
  projectId: string,
  input: { template: string; rename?: string; fields?: FieldOperation[] } & StyleInput,
) {
  await store.project(projectId)
  const templates = await store.templates(projectId)
  if (!input.template?.trim()) throw new DomainError('Indique le template à modifier (son nom)')
  const template = findTemplate(templates, input.template)
  const done: string[] = []
  const name = input.rename !== undefined ? checkTemplateName(templates, input.rename, template.id) : template.name
  if (name !== template.name) done.push(`renommé : ${template.name} → ${name}`)
  const style = applyStyle(template.style, input)
  if (JSON.stringify(style) !== JSON.stringify(template.style)) done.push('apparence modifiée')
  let fields = [...template.fields]
  const usage = (await store.where('nodes', 'templateId', template.id)).filter((n) => !n.aliasOf)
  for (const [i, op] of (input.fields ?? []).entries()) {
    try {
      const index = 'field' in op ? fields.findIndex((f) => f.label.toLowerCase() === String(op.field).trim().toLowerCase()) : -1
      if ('field' in op && index < 0)
        throw new DomainError(`champ inconnu : « ${op.field} ». Champs : ${fields.map((f) => f.label).join(', ') || 'aucun'}`)
      const at = (position: number | undefined) =>
        position === undefined ? fields.length : Math.max(0, Math.min(fields.length, Math.round(position) - 1))
      switch (op.op) {
        case 'add_field': {
          const field = newField(op, fields)
          fields.splice(at(op.position), 0, field)
          done.push(`champ ajouté : ${field.label}`)
          break
        }
        case 'update_field': {
          let field = fields[index]
          if (op.rename !== undefined) {
            const label = op.rename.trim()
            if (!label) throw new DomainError('un champ doit avoir un nom')
            if (fields.some((f, j) => j !== index && f.label.toLowerCase() === label.toLowerCase())) throw new DomainError(`champ en double : « ${label} »`)
            field = { ...field, label }
          }
          fields[index] = applyField(field, op)
          done.push(`champ modifié : ${fields[index].label}`)
          break
        }
        case 'remove_field': {
          const [field] = fields.splice(index, 1)
          const filled = usage.filter((n) => n.values[field.id] !== undefined && n.values[field.id] !== null && n.values[field.id] !== '').length
          done.push(`champ supprimé : ${field.label}${filled ? ` (sa valeur est masquée dans ${filled} idée${filled > 1 ? 's' : ''})` : ''}`)
          break
        }
        case 'move_field': {
          const [field] = fields.splice(index, 1)
          fields.splice(Math.min(at(op.position), fields.length), 0, field)
          done.push(`champ déplacé : ${field.label} en position ${fields.indexOf(field) + 1}`)
          break
        }
        default:
          throw new DomainError(`opération inconnue : ${(op as { op: string }).op}`)
      }
    } catch (error) {
      if (error instanceof DomainError) throw new DomainError(`opération ${i + 1} (${op.op}) : ${error.message} (rien n’a été modifié)`)
      throw error
    }
  }
  store.put('templates', { ...template, name, style, fields })
  await store.touchProject(projectId)
  return { name, ...style, fields: fields.map(describeField), usedBy: usage.length, done }
}

// ---------------------------------------------------------------- link templates

const ARROWS = ['none', 'start', 'end', 'both'] as const
const PATHS = ['straight', 'curved'] as const
const DASHES = ['solid', 'dashed', 'dotted'] as const

export interface LinkStyleInput {
  label?: string
  arrows?: string
  color?: string
  strokeWidth?: string
  path?: string
  dash?: string
}

function applyLinkStyle(style: LinkStyle, input: LinkStyleInput): LinkStyle {
  return {
    arrows: input.arrows !== undefined ? pick(input.arrows, ARROWS, 'Flèches') : style.arrows,
    color: input.color !== undefined ? pick(input.color, COLORS, 'Couleur') : style.color,
    strokeWidth: input.strokeWidth !== undefined ? pick(input.strokeWidth, STROKE_WIDTHS, 'Épaisseur') : style.strokeWidth,
    path: input.path !== undefined ? pick(input.path, PATHS, 'Tracé') : style.path,
    dash: input.dash !== undefined ? pick(input.dash, DASHES, 'Trait') : style.dash,
  }
}

function checkLinkTemplateName(templates: LinkTemplate[], name: string | undefined, except?: string) {
  const n = name?.trim()
  if (!n) throw new DomainError('Le type de lien doit avoir un nom')
  if (templates.some((t) => t.id !== except && t.name.toLowerCase() === n.toLowerCase()))
    throw new DomainError(`Un type de lien « ${n} » existe déjà dans ce projet`)
  return n
}

export async function createLinkTemplate(store: Store, projectId: string, input: { name: string; first?: boolean } & LinkStyleInput) {
  await store.project(projectId)
  const templates = await store.linkTemplates(projectId)
  const name = checkLinkTemplateName(templates, input.name)
  const template: LinkTemplate = {
    id: nanoid(),
    projectId,
    name,
    // First: the type new links get.
    order: input.first ? (templates[0]?.order ?? 0) - 1 : (templates.at(-1)?.order ?? -1) + 1,
    label: input.label?.trim() ?? name.toLowerCase(),
    style: applyLinkStyle(linkStyle({}), input),
  }
  store.put('linkTemplates', template)
  await store.touchProject(projectId)
  return describeLinkTemplate(template)
}

export async function updateLinkTemplate(
  store: Store,
  projectId: string,
  input: { template: string; rename?: string; first?: boolean } & LinkStyleInput,
) {
  await store.project(projectId)
  if (!input.template?.trim()) throw new DomainError('Indique le type de lien à modifier (son nom)')
  const templates = await store.linkTemplates(projectId)
  const template = findLinkTemplate(templates, input.template)
  const next: LinkTemplate = {
    ...template,
    name: input.rename !== undefined ? checkLinkTemplateName(templates, input.rename, template.id) : template.name,
    label: input.label !== undefined ? input.label.trim() : template.label,
    style: applyLinkStyle(template.style, input),
    order: input.first ? (templates[0]?.order ?? 0) - (templates[0]?.id === template.id ? 0 : 1) : template.order,
  }
  store.put('linkTemplates', next)
  await store.touchProject(projectId)
  const usedBy = (await store.where('edges', 'projectId', projectId)).filter((e) => e.templateId === template.id).length
  return { ...describeLinkTemplate(next), usedBy }
}
