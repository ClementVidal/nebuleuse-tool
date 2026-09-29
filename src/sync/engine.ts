import type { Transaction } from 'dexie'
import { useSyncExternalStore } from 'react'
import { db } from '@/db/db'
import { getAccount, getToken, refreshAccount, subscribeAccount } from './auth'

/**
 * Sync with the server (`/api/sync`), local-first:
 * - every local write to a synced table is noted in `outbox` (after its transaction commits);
 * - push sends the current state of those records (or a tombstone), then clears what it sent;
 * - pull fetches every change after our cursor; a record with a pending local change is skipped
 *   (the local version wins and will be pushed);
 * - runs a second after local changes, every 10 s while the app is visible, and when it comes back
 *   to the foreground or online.
 * The first sync of an account on a device uploads everything already stored locally.
 */

const SYNC_TABLES = ['projects', 'templates', 'maps', 'nodes', 'edges', 'linkTemplates'] as const
type SyncTable = (typeof SYNC_TABLES)[number]

const POLL_MS = 10_000
const PUSH_DELAY_MS = 1_000
const PUSH_BATCH = 200

export type SyncState = { state: 'off' | 'idle' | 'syncing' | 'offline'; lastSyncAt?: number } | { state: 'error'; message: string; lastSyncAt?: number }

let status: SyncState = { state: 'off' }
const listeners = new Set<() => void>()
function setStatus(next: SyncState) {
  status = next
  for (const l of listeners) l()
}
export const useSyncState = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => status,
  )

// ---------------------------------------------------------------- change capture

/** Transactions applying server changes: not to be sent back. */
const remoteTransactions = new WeakSet<Transaction>()
/** Keys touched per (root) transaction, written to the outbox once it commits. */
const touched = new WeakMap<Transaction, Map<string, { table: SyncTable; id: string }>>()
let seq = Date.now()

function root(tx: Transaction): Transaction {
  let t = tx
  while (t.parent) t = t.parent
  return t
}

function note(table: SyncTable, id: string, tx: Transaction) {
  const r = root(tx)
  if (remoteTransactions.has(r)) return
  let keys = touched.get(r)
  if (!keys) {
    const collected = new Map<string, { table: SyncTable; id: string }>()
    keys = collected
    touched.set(r, keys)
    r.on('complete', () => {
      const entries = [...collected.values()].map((k) => ({ key: `${k.table}:${k.id}`, ...k, seq: ++seq }))
      void db.outbox.bulkPut(entries).then(schedulePush)
    })
  }
  keys.set(`${table}:${id}`, { table, id })
}

for (const name of SYNC_TABLES) {
  const table = db.table(name)
  table.hook('creating', (key, obj, tx) => note(name, String(key ?? (obj as { id: string }).id), tx))
  table.hook('updating', (_mods, key, _obj, tx) => note(name, String(key), tx))
  table.hook('deleting', (key, _obj, tx) => note(name, String(key), tx))
}

// ---------------------------------------------------------------- server calls

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { ...init?.headers, authorization: `Bearer ${token}`, 'content-type': 'application/json' } })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new HttpError(res.status, body.error ?? `HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

interface Change {
  table: SyncTable
  id: string
  data: Record<string, unknown> | null
  deleted: boolean
}

async function push(token: string) {
  for (;;) {
    const entries = await db.outbox.limit(PUSH_BATCH).toArray()
    if (entries.length === 0) return
    const changes: Change[] = []
    for (const e of entries) {
      const record = await db.table(e.table).get(e.id)
      changes.push(
        record
          ? { table: e.table as SyncTable, id: e.id, data: record, deleted: false }
          : { table: e.table as SyncTable, id: e.id, data: null, deleted: true },
      )
    }
    await api(token, '/api/sync', { method: 'POST', body: JSON.stringify({ changes }) })
    // Clear only what was sent: an entry changed meanwhile has a newer seq and stays.
    await db.transaction('rw', db.outbox, async () => {
      for (const e of entries) {
        const current = await db.outbox.get(e.key)
        if (current?.seq === e.seq) await db.outbox.delete(e.key)
      }
    })
  }
}

async function pull(token: string, cursorKey: string) {
  let cursor = Number((await db.syncMeta.get(cursorKey))?.value ?? 0)
  for (;;) {
    const page = await api<{ changes: (Change & { rev: number })[]; cursor: number; more: boolean }>(token, `/api/sync?since=${cursor}`)
    if (page.changes.length) {
      await db.transaction('rw', [...SYNC_TABLES, 'outbox', 'syncMeta'], async (tx) => {
        remoteTransactions.add(root(tx))
        for (const c of page.changes) {
          if (!SYNC_TABLES.includes(c.table)) continue
          if (await db.outbox.get(`${c.table}:${c.id}`)) continue // local change pending: it wins
          if (c.deleted) await db.table(c.table).delete(c.id)
          else await db.table(c.table).put(c.data)
        }
        await db.syncMeta.put({ key: cursorKey, value: page.cursor })
      })
    }
    cursor = page.cursor
    if (!page.more) return
  }
}

/** First sync of this account on this device: queue every local record for upload. */
async function queueEverything() {
  for (const name of SYNC_TABLES) {
    const ids = (await db.table(name).toCollection().primaryKeys()) as string[]
    await db.outbox.bulkPut(ids.map((id) => ({ key: `${name}:${id}`, table: name, id, seq: ++seq })))
  }
}

// ---------------------------------------------------------------- scheduling

let running: Promise<void> | undefined
let again = false

/** Runs a sync now (or right after the one in progress). */
export function syncNow(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      do {
        again = false
        await syncOnce()
      } while (again)
    } finally {
      running = undefined
    }
  })()
  return running
}

async function syncOnce() {
  const account = getAccount()
  if (account.state !== 'signed-in') {
    setStatus({ state: 'off' })
    return
  }
  const lastSyncAt = status.lastSyncAt
  if (!navigator.onLine) {
    setStatus({ state: 'offline', lastSyncAt })
    return
  }
  setStatus({ state: 'syncing', lastSyncAt })
  try {
    const token = await getToken()
    if (!token) {
      await refreshAccount()
      setStatus({ state: 'off' })
      return
    }
    const cursorKey = `cursor:${account.userId}`
    if (!(await db.syncMeta.get(cursorKey))) await queueEverything()
    await push(token)
    await pull(token, cursorKey)
    setStatus({ state: 'idle', lastSyncAt: Date.now() })
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      await refreshAccount()
      setStatus({ state: getAccount().state === 'signed-in' ? 'error' : 'off', message: 'Session expirée', lastSyncAt } as SyncState)
    } else if (error instanceof HttpError) {
      setStatus({ state: 'error', message: error.message, lastSyncAt })
    } else {
      setStatus({ state: 'offline', lastSyncAt }) // network failure
    }
  }
}

let pushTimer: ReturnType<typeof setTimeout> | undefined
function schedulePush() {
  if (getAccount().state !== 'signed-in') return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => void syncNow(), PUSH_DELAY_MS)
}

let started = false
/** Starts background sync (once, at app start). */
export function startSync() {
  if (started) return
  started = true
  subscribeAccount(() => void syncNow())
  void refreshAccount()
  const visible = () => document.visibilityState === 'visible'
  setInterval(() => {
    if (visible()) void syncNow()
  }, POLL_MS)
  document.addEventListener('visibilitychange', () => {
    if (visible()) void syncNow()
  })
  window.addEventListener('online', () => void syncNow())
}
