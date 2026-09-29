import { neon } from '@neondatabase/serverless'
import type { Sql } from './store.js'

let sql: Sql | undefined

/** The production database (Neon, over HTTP). */
export function getSql(): Sql {
  if (!sql) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    const client = neon(url)
    sql = { query: (text, params) => client.query(text, params) as never }
  }
  return sql
}
