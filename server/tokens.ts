import { createHash, randomBytes } from 'node:crypto'
import type { Sql } from './store.js'

/** One personal MCP key per user: `nbl_` + 32 random bytes. Only its hash is stored. */

const hash = (token: string) => createHash('sha256').update(token).digest('hex')

export async function createToken(sql: Sql, userId: string): Promise<string> {
  const token = `nbl_${randomBytes(32).toString('base64url')}`
  await sql.query(
    `insert into mcp_tokens (token_hash, user_id) values ($1, $2)
     on conflict (user_id) do update set token_hash = excluded.token_hash, created_at = now(), last_used_at = null`,
    [hash(token), userId],
  )
  return token
}

export async function tokenInfo(sql: Sql, userId: string) {
  const [row] = await sql.query<{ created_at: string; last_used_at: string | null }>(
    `select created_at, last_used_at from mcp_tokens where user_id = $1`,
    [userId],
  )
  return row ? { createdAt: new Date(row.created_at).toISOString(), lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null } : null
}

export async function revokeToken(sql: Sql, userId: string) {
  await sql.query(`delete from mcp_tokens where user_id = $1`, [userId])
}

/** The user a key belongs to (and notes its use, at most every few minutes), or null. */
export async function userForToken(sql: Sql, token: string): Promise<string | null> {
  if (!/^nbl_[A-Za-z0-9_-]{20,}$/.test(token)) return null
  const [row] = await sql.query<{ user_id: string }>(
    `update mcp_tokens set last_used_at = case when last_used_at is null or last_used_at < now() - interval '5 minutes' then now() else last_used_at end
     where token_hash = $1 returning user_id`,
    [hash(token)],
  )
  return row?.user_id ?? null
}
