import { createRemoteJWKSet, jwtVerify } from 'jose'

/**
 * Requests are authenticated with the Neon Auth JWT of the signed-in user
 * (`Authorization: Bearer <jwt>`), verified against the auth server's public keys.
 */

export class AuthError extends Error {}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined

export function jwksUrl(): URL {
  if (process.env.NEON_AUTH_JWKS_URL) return new URL(process.env.NEON_AUTH_JWKS_URL)
  const base = process.env.NEON_AUTH_BASE_URL
  if (!base) throw new Error('NEON_AUTH_BASE_URL is not set')
  return new URL(`${base.replace(/\/$/, '')}/.well-known/jwks.json`)
}

/** Returns the user id (JWT subject) of the request, or throws AuthError. */
export async function requireUser(request: Request): Promise<string> {
  const header = request.headers.get('authorization') ?? ''
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) throw new AuthError('missing bearer token')
  jwks ??= createRemoteJWKSet(jwksUrl())
  try {
    const { payload } = await jwtVerify(token, jwks)
    if (!payload.sub) throw new AuthError('token without subject')
    return payload.sub
  } catch (error) {
    if (error instanceof AuthError) throw error
    throw new AuthError(error instanceof Error ? error.message : 'invalid token')
  }
}
