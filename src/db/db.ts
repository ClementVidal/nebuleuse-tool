import Dexie, { type EntityTable } from 'dexie'
import type { IdeaEdge, IdeaNode, NodeTemplate, Project, ReflexionMap } from './types'

/** A record changed locally and not yet sent to the server (see src/sync/engine.ts). */
export interface OutboxEntry {
  /** `${table}:${id}` */
  key: string
  table: string
  id: string
  /** Bumped on every change, so a push only clears the entries it actually sent. */
  seq: number
}

export interface SyncMeta {
  key: string
  value: unknown
}

export const db = new Dexie('nebuleuse') as Dexie & {
  projects: EntityTable<Project, 'id'>
  templates: EntityTable<NodeTemplate, 'id'>
  maps: EntityTable<ReflexionMap, 'id'>
  nodes: EntityTable<IdeaNode, 'id'>
  edges: EntityTable<IdeaEdge, 'id'>
  outbox: EntityTable<OutboxEntry, 'key'>
  syncMeta: EntityTable<SyncMeta, 'key'>
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
    .modify((template: { style?: Record<string, unknown> }) => {
      const style = template.style ?? {}
      if ('color' in style) return // already in the new format
      template.style = { color: style.stroke ?? 'ink', strokeWidth: style.strokeWidth ?? 'medium', dashed: false }
    })
  await tx
    .table('nodes')
    .toCollection()
    .modify((node: Record<string, unknown>) => {
      delete node.style
    })
})

// v3: templates get a shape (card / sticky). "Note" templates become post-its.
db.version(3).stores({}).upgrade(async (tx) => {
  await tx
    .table('templates')
    .toCollection()
    .modify((template: { name?: string; style?: Record<string, unknown> }) => {
      if (!template.style || 'shape' in template.style) return
      template.style.shape = template.name?.trim().toLowerCase() === 'note' ? 'sticky' : 'card'
    })
})

// v4: sync with the server — outbox of local changes, sync cursor.
db.version(4).stores({ outbox: 'key', syncMeta: 'key' })

// v5: aliases (a node standing for another one), found by the idea they point to.
db.version(5).stores({ nodes: 'id, projectId, mapId, templateId, aliasOf' })

// ---------------------------------------------------------------- connection status

/**
 * - opening: the database is being opened (and migrated if needed)
 * - blocked: a migration waits for other tabs of the app to release the database
 *   (on mobile, frozen background tabs never do until they are closed or reloaded)
 * - error: the database could not be opened
 */
export type DbStatus = { state: 'opening' | 'blocked' | 'ready' } | { state: 'error'; error: unknown }

let status: DbStatus = { state: 'opening' }
const statusListeners = new Set<() => void>()

function setStatus(next: DbStatus) {
  status = next
  for (const listener of statusListeners) listener()
}

export function getDbStatus() {
  return status
}

export function subscribeDbStatus(listener: () => void) {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

db.on('blocked', () => {
  if (status.state === 'opening') setStatus({ state: 'blocked' })
})

// Another tab opened a newer version of the app: step aside (reload onto the new code) instead of
// blocking its migration. Edits are saved as they're made, so nothing is lost.
db.on('versionchange', () => {
  db.close()
  location.reload()
  return false
})

db.open().then(
  () => setStatus({ state: 'ready' }),
  (error: unknown) => setStatus({ state: 'error', error }),
)
