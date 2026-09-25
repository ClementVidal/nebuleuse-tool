import Dexie, { type Transaction } from 'dexie'
import { db } from './db'

/**
 * Undo / redo history, recorded at the data layer.
 *
 * Writes made inside `record()` run in one transaction; Dexie hooks capture the state of every
 * touched record before and after, so any action (cascades included) can be undone by restoring
 * the "before" snapshots and redone by restoring the "after" ones. Writes outside `record()`
 * (viewport, child map creation, undo/redo themselves) are not recorded.
 *
 * History is kept in memory, one stack per project.
 */

const TRACKED_TABLES = ['templates', 'maps', 'nodes', 'edges'] as const
type TrackedTable = (typeof TRACKED_TABLES)[number]

type Snapshot = Record<string, unknown> & { projectId?: string }

interface Change {
  table: TrackedTable
  key: string
  /** `undefined` when the record didn't exist before (creation). */
  before: Snapshot | undefined
  /** `undefined` when the record doesn't exist after (deletion). */
  after: Snapshot | undefined
}

interface Entry {
  changes: Map<string, Change>
  coalesceKey?: string
  at: number
}

interface ProjectHistory {
  undo: Entry[]
  redo: Entry[]
}

const COALESCE_WINDOW_MS = 1500
const MAX_ENTRIES = 200

const histories = new Map<string, ProjectHistory>()
/** Changes being collected, keyed by the recording transaction. */
const recording = new WeakMap<Transaction, Map<string, Change>>()

// ---------------------------------------------------------------- change capture

function recordingFor(tx: Transaction | undefined): Map<string, Change> | undefined {
  for (let t = tx; t; t = t.parent) {
    const changes = recording.get(t)
    if (changes) return changes
  }
  return undefined
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function capture(table: TrackedTable, key: string, before: Snapshot | undefined, after: Snapshot | undefined, tx: Transaction) {
  const changes = recordingFor(tx)
  if (!changes) return
  const id = `${table}:${key}`
  const existing = changes.get(id)
  // Keep the first "before" and the latest "after" when a record is touched several times.
  changes.set(id, { table, key, before: existing ? existing.before : before, after })
}

for (const name of TRACKED_TABLES) {
  const table = db.table(name)
  table.hook('creating', (key, obj, tx) => {
    capture(name, String(key), undefined, clone(obj), tx)
  })
  table.hook('updating', (mods, key, obj, tx) => {
    const after = clone(obj)
    for (const [keyPath, value] of Object.entries(mods)) {
      if (value === undefined) Dexie.delByKeyPath(after, keyPath)
      else Dexie.setByKeyPath(after, keyPath, clone(value))
    }
    capture(name, String(key), clone(obj), after, tx)
  })
  table.hook('deleting', (key, obj, tx) => {
    capture(name, String(key), clone(obj), undefined, tx)
  })
}

// ---------------------------------------------------------------- subscriptions (for React)

const listeners = new Set<() => void>()
let version = 0

function notify() {
  version++
  for (const listener of listeners) listener()
}

export function subscribeHistory(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function historyVersion() {
  return version
}

export function canUndo(projectId: string) {
  return (histories.get(projectId)?.undo.length ?? 0) > 0
}

export function canRedo(projectId: string) {
  return (histories.get(projectId)?.redo.length ?? 0) > 0
}

// ---------------------------------------------------------------- recording

function projectOf(changes: Map<string, Change>): string | undefined {
  for (const change of changes.values()) {
    const projectId = change.after?.projectId ?? change.before?.projectId
    if (projectId) return projectId
  }
  return undefined
}

function historyOf(projectId: string): ProjectHistory {
  let history = histories.get(projectId)
  if (!history) {
    history = { undo: [], redo: [] }
    histories.set(projectId, history)
  }
  return history
}

export interface RecordOptions {
  /**
   * Consecutive recordings with the same key, close in time, merge into one history entry
   * (e.g. typing in a title field).
   */
  coalesceKey?: string
}

/** Runs `fn` as one undoable step. Nested calls join the enclosing step. */
export async function record<T>(fn: () => Promise<T>, options: RecordOptions = {}): Promise<T> {
  if (recordingFor(Dexie.currentTransaction)) return fn()

  const changes = new Map<string, Change>()
  const result = await db.transaction('rw', [db.projects, db.templates, db.maps, db.nodes, db.edges], async (tx) => {
    recording.set(tx, changes)
    return fn()
  })
  if (changes.size === 0) return result

  const projectId = projectOf(changes)
  if (!projectId) return result
  const history = historyOf(projectId)
  const last = history.undo.at(-1)
  const now = Date.now()
  if (options.coalesceKey && last?.coalesceKey === options.coalesceKey && now - last.at < COALESCE_WINDOW_MS) {
    for (const [id, change] of changes) {
      const existing = last.changes.get(id)
      last.changes.set(id, existing ? { ...change, before: existing.before } : change)
    }
    last.at = now
  } else {
    history.undo.push({ changes, coalesceKey: options.coalesceKey, at: now })
    if (history.undo.length > MAX_ENTRIES) history.undo.shift()
  }
  history.redo = []
  notify()
  return result
}

/**
 * Updates recorded snapshots of a record for structural fields that aren't user edits
 * (e.g. a node's `childMapId`), so undo/redo never drop them.
 */
export function patchSnapshots(table: TrackedTable, key: string, patch: Snapshot) {
  for (const history of histories.values()) {
    for (const entry of [...history.undo, ...history.redo]) {
      const change = entry.changes.get(`${table}:${key}`)
      if (!change) continue
      if (change.before) Object.assign(change.before, patch)
      if (change.after) Object.assign(change.after, patch)
    }
  }
}

// ---------------------------------------------------------------- undo / redo

async function apply(entry: Entry, side: 'before' | 'after') {
  await db.transaction('rw', [db.templates, db.maps, db.nodes, db.edges], async () => {
    for (const change of entry.changes.values()) {
      const table = db.table(change.table)
      const value = change[side]
      if (value === undefined) await table.delete(change.key)
      else await table.put(clone(value))
    }
  })
}

export async function undo(projectId: string): Promise<boolean> {
  const history = histories.get(projectId)
  const entry = history?.undo.pop()
  if (!history || !entry) return false
  try {
    await apply(entry, 'before')
  } catch (error) {
    history.undo.push(entry)
    throw error
  }
  history.redo.push(entry)
  notify()
  return true
}

export async function redo(projectId: string): Promise<boolean> {
  const history = histories.get(projectId)
  const entry = history?.redo.pop()
  if (!history || !entry) return false
  try {
    await apply(entry, 'after')
  } catch (error) {
    history.redo.push(entry)
    throw error
  }
  history.undo.push(entry)
  notify()
  return true
}
