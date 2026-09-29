/**
 * Server-side store: every record of the app (projects, maps, nodes, edges, templates) is one
 * row of `records`, scoped to its owner. Each write takes a new revision number from a global
 * sequence, so a client catches up with "everything after revision N" (tombstones included).
 */

/** Minimal SQL executor, implemented with the Neon driver in production and PGlite in tests. */
export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>
}

export const SYNC_TABLES = ['projects', 'templates', 'maps', 'nodes', 'edges'] as const
export type SyncTable = (typeof SYNC_TABLES)[number]

export interface RecordChange {
  table: SyncTable
  id: string
  /** The record itself; null when deleted. */
  data: Record<string, unknown> | null
  deleted: boolean
}

export interface PulledChange extends RecordChange {
  rev: number
}

const SCHEMA = [
  `create sequence if not exists records_rev`,
  `create table if not exists records (
    user_id text not null,
    tbl text not null,
    id text not null,
    data jsonb,
    deleted boolean not null default false,
    rev bigint not null,
    updated_at timestamptz not null default now(),
    primary key (user_id, tbl, id)
  )`,
  `create index if not exists records_user_rev on records (user_id, rev)`,
  // Personal key giving Claude (MCP) access to a user's records; only its SHA-256 is stored.
  `create table if not exists mcp_tokens (
    token_hash text primary key,
    user_id text not null unique,
    created_at timestamptz not null default now(),
    last_used_at timestamptz
  )`,
]

const ready = new WeakMap<Sql, Promise<void>>()

/** Creates the schema once per process (idempotent). */
export function ensureSchema(sql: Sql): Promise<void> {
  let promise = ready.get(sql)
  if (!promise) {
    promise = (async () => {
      for (const statement of SCHEMA) await sql.query(statement)
    })()
    promise.catch(() => ready.delete(sql))
    ready.set(sql, promise)
  }
  return promise
}

export const MAX_BATCH = 500
const MAX_RECORD_BYTES = 1_000_000

/** Validates a client batch; throws a message suitable for a 400 response. */
export function parseChanges(body: unknown): RecordChange[] {
  const changes = (body as { changes?: unknown })?.changes
  if (!Array.isArray(changes)) throw new Error('changes: array expected')
  if (changes.length > MAX_BATCH) throw new Error(`changes: at most ${MAX_BATCH} per request`)
  return changes.map((c, i) => {
    const { table, id, data, deleted } = (c ?? {}) as Record<string, unknown>
    if (!SYNC_TABLES.includes(table as SyncTable)) throw new Error(`changes[${i}].table: unknown table`)
    if (typeof id !== 'string' || !id || id.length > 100) throw new Error(`changes[${i}].id: invalid`)
    if (deleted === true) return { table: table as SyncTable, id, data: null, deleted: true }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error(`changes[${i}].data: object expected`)
    if ((data as { id?: unknown }).id !== id) throw new Error(`changes[${i}].data.id: must match id`)
    if (JSON.stringify(data).length > MAX_RECORD_BYTES) throw new Error(`changes[${i}].data: too large`)
    return { table: table as SyncTable, id, data: data as Record<string, unknown>, deleted: false }
  })
}

/** Writes a batch atomically (last write wins); returns the highest revision assigned. */
export async function pushChanges(sql: Sql, userId: string, changes: RecordChange[]): Promise<number | null> {
  if (changes.length === 0) return null
  const rows = changes.map((c) => ({ tbl: c.table, id: c.id, data: c.data, deleted: c.deleted }))
  const result = await sql.query<{ rev: string | number }>(
    `insert into records (user_id, tbl, id, data, deleted, rev, updated_at)
     select $1, t.tbl, t.id, t.data, t.deleted, nextval('records_rev'), now()
     from jsonb_to_recordset($2::jsonb) as t(tbl text, id text, data jsonb, deleted boolean)
     on conflict (user_id, tbl, id) do update
       set data = excluded.data, deleted = excluded.deleted, rev = excluded.rev, updated_at = excluded.updated_at
     returning rev`,
    [userId, JSON.stringify(rows)],
  )
  return Math.max(...result.map((r) => Number(r.rev)))
}

export const PULL_LIMIT = 1000

/** Changes after `since`, oldest first. `more` is true when the limit was reached. */
export async function pullChanges(sql: Sql, userId: string, since: number, limit = PULL_LIMIT) {
  const rows = await sql.query<{ tbl: SyncTable; id: string; data: Record<string, unknown> | null; deleted: boolean; rev: string | number }>(
    `select tbl, id, data, deleted, rev from records where user_id = $1 and rev > $2 order by rev limit $3`,
    [userId, since, limit],
  )
  const changes: PulledChange[] = rows.map((r) => ({
    table: r.tbl,
    id: r.id,
    data: r.deleted ? null : typeof r.data === 'string' ? JSON.parse(r.data) : r.data,
    deleted: r.deleted,
    rev: Number(r.rev),
  }))
  return { changes, cursor: changes.at(-1)?.rev ?? since, more: rows.length === limit }
}
