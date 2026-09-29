import { AuthError, requireUser } from '../server/auth.js'
import { json } from '../server/http.js'
import { getSql } from '../server/neon.js'
import { ensureSchema } from '../server/store.js'
import { createToken, revokeToken, tokenInfo } from '../server/tokens.js'

/**
 * The signed-in user's MCP key (for Claude).
 * - GET    → { token: { createdAt, lastUsedAt } | null }
 * - POST   → { key } (new key, replaces the previous one; shown once)
 * - DELETE → revokes it
 */
async function handle(request: Request, run: (userId: string) => Promise<Response>) {
  try {
    const userId = await requireUser(request)
    await ensureSchema(getSql())
    return await run(userId)
  } catch (error) {
    if (error instanceof AuthError) return json({ error: 'unauthorized' }, 401)
    console.error(error)
    return json({ error: 'server error' }, 500)
  }
}

export const GET = (request: Request) => handle(request, async (userId) => json({ token: await tokenInfo(getSql(), userId) }))
export const POST = (request: Request) => handle(request, async (userId) => json({ key: await createToken(getSql(), userId) }))
export const DELETE = (request: Request) =>
  handle(request, async (userId) => {
    await revokeToken(getSql(), userId)
    return json({ ok: true })
  })
