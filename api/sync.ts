import { AuthError, requireUser } from '../server/auth.js'
import { json } from '../server/http.js'
import { getSql } from '../server/neon.js'
import { ensureSchema, parseChanges, pullChanges, pushChanges } from '../server/store.js'

/**
 * Sync endpoint of the app.
 * - GET  /api/sync?since=<rev>  → { changes, cursor, more }
 *   With `&wait=<s>` (max 25), the request is held until a change after `since` exists, or the
 *   time is up (then `changes` is empty): the app's real-time mode, so writes made elsewhere
 *   (e.g. by Claude through the MCP server) show up within about a second.
 * - POST /api/sync { changes }  → { rev }
 */

const MAX_WAIT_S = 25
const CHECK_EVERY_MS = 1000

async function handle(request: Request, run: (userId: string) => Promise<Response>) {
  try {
    const userId = await requireUser(request)
    await ensureSchema(getSql())
    return await run(userId)
  } catch (error) {
    if (error instanceof AuthError) return json({ error: 'unauthorized', detail: error.message }, 401)
    console.error(error)
    return json({ error: 'server error' }, 500)
  }
}

export function GET(request: Request) {
  return handle(request, async (userId) => {
    const params = new URL(request.url).searchParams
    const since = Number(params.get('since') ?? 0)
    if (!Number.isFinite(since) || since < 0) return json({ error: 'since: invalid' }, 400)
    const wait = Math.min(MAX_WAIT_S, Math.max(0, Number(params.get('wait') ?? 0) || 0))
    const sql = getSql()
    const deadline = Date.now() + wait * 1000
    for (;;) {
      const page = await pullChanges(sql, userId, since)
      if (page.changes.length || Date.now() >= deadline || request.signal.aborted) return json(page)
      await new Promise((resolve) => setTimeout(resolve, CHECK_EVERY_MS))
    }
  })
}

export function POST(request: Request) {
  return handle(request, async (userId) => {
    let changes
    try {
      changes = parseChanges(await request.json())
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'invalid body' }, 400)
    }
    return json({ rev: await pushChanges(getSql(), userId, changes) })
  })
}
