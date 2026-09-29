import { AuthError, requireUser } from '../server/auth.js'
import { json } from '../server/http.js'
import { getSql } from '../server/neon.js'
import { ensureSchema, parseChanges, pullChanges, pushChanges } from '../server/store.js'

/**
 * Sync endpoint of the app.
 * - GET  /api/sync?since=<rev>  → { changes, cursor, more }
 * - POST /api/sync { changes }  → { rev }
 */

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
    const since = Number(new URL(request.url).searchParams.get('since') ?? 0)
    if (!Number.isFinite(since) || since < 0) return json({ error: 'since: invalid' }, 400)
    return json(await pullChanges(getSql(), userId, since))
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
