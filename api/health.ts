import { jwksUrl } from '../server/auth.js'
import { json } from '../server/http.js'
import { getSql } from '../server/neon.js'
import { ensureSchema } from '../server/store.js'

/** Deployment check: database reachable (schema ready) and auth public keys reachable. No secrets. */
export async function GET() {
  const report: Record<string, string> = {}
  try {
    await ensureSchema(getSql())
    const [row] = await getSql().query<{ n: string }>('select count(*) as n from records')
    report.database = `ok (${row.n} records)`
  } catch (error) {
    report.database = `error: ${error instanceof Error ? error.message : String(error)}`
  }
  try {
    const url = jwksUrl()
    const res = await fetch(url)
    const body = res.ok ? ((await res.json()) as { keys?: unknown[] }) : undefined
    report.auth = res.ok ? `ok (${body?.keys?.length ?? 0} keys at ${url.pathname})` : `error: HTTP ${res.status} at ${url.pathname}`
  } catch (error) {
    report.auth = `error: ${error instanceof Error ? error.message : String(error)}`
  }
  const ok = Object.values(report).every((v) => v.startsWith('ok'))
  return json({ ok, ...report }, ok ? 200 : 503)
}
