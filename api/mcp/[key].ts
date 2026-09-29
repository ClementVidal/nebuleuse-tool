import { json } from '../../server/http.js'
import { handleMessage } from '../../server/mcp.js'
import { getSql } from '../../server/neon.js'
import { ensureSchema } from '../../server/store.js'
import { userForToken } from '../../server/tokens.js'

/**
 * MCP endpoint for Claude: https://<app>/api/mcp/<personal key> (Streamable HTTP, stateless,
 * JSON responses). The key comes from "Connecter Claude" in the app.
 */

const key = (request: Request) => decodeURIComponent(new URL(request.url).pathname.split('/').pop() ?? '')

export async function POST(request: Request) {
  const sql = getSql()
  try {
    await ensureSchema(sql)
    const userId = await userForToken(sql, key(request))
    if (!userId) return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Clé Nébuleuse invalide ou révoquée' } }, 401)
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON invalide' } }, 400)
    }
    const messages = Array.isArray(body) ? body : [body]
    const responses = (await Promise.all(messages.map((m) => handleMessage(sql, userId, m)))).filter((r) => r !== undefined)
    if (responses.length === 0) return new Response(null, { status: 202 })
    return json(Array.isArray(body) ? responses : responses[0])
  } catch (error) {
    console.error(error)
    return json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Erreur interne' } }, 500)
  }
}

/** No server-initiated stream: this server only answers requests. */
export function GET() {
  return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } })
}

export function DELETE() {
  return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } })
}
