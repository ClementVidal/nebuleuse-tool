import { createAuthClient } from '@neondatabase/auth'
import { useSyncExternalStore } from 'react'

/** Neon Auth (managed Better Auth). Absent when the app is built without an auth URL (local dev). */
const url = import.meta.env.VITE_NEON_AUTH_URL as string | undefined
export const auth = url ? createAuthClient(url) : undefined

export type Account = { state: 'unavailable' | 'loading' | 'signed-out' } | { state: 'signed-in'; userId: string; email: string }

let account: Account = auth ? { state: 'loading' } : { state: 'unavailable' }
const listeners = new Set<() => void>()

function setAccount(next: Account) {
  account = next
  for (const l of listeners) l()
}

export const getAccount = () => account
export function subscribeAccount(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const useAccount = () => useSyncExternalStore(subscribeAccount, getAccount)

/** Reads the current session from the auth server. */
export async function refreshAccount() {
  if (!auth) return
  try {
    const { data } = await auth.getSession()
    setAccount(data?.user ? { state: 'signed-in', userId: data.user.id, email: data.user.email } : { state: 'signed-out' })
  } catch {
    // Offline: keep what we knew; unknown at startup means signed out until we can check.
    if (account.state === 'loading') setAccount({ state: 'signed-out' })
  }
}

/** Throws with a readable message when the auth server refuses the request. */
function unwrap<T>(result: { data: T; error: null } | { data: null; error: { message?: string; status?: number } }): T {
  if (result.error) throw new Error(result.error.message || `Erreur ${result.error.status ?? ''}`.trim())
  return result.data
}

export async function sendEmailCode(email: string) {
  unwrap(await auth!.emailOtp.sendVerificationOtp({ email, type: 'sign-in' }))
}

export async function signInWithCode(email: string, otp: string) {
  unwrap(await auth!.signIn.emailOtp({ email, otp }))
  await refreshAccount()
}

export async function signInWithPassword(email: string, password: string, create: boolean) {
  if (create) unwrap(await auth!.signUp.email({ email, password, name: email.split('@')[0] }))
  else unwrap(await auth!.signIn.email({ email, password }))
  await refreshAccount()
}

export async function signInWithGoogle() {
  unwrap(await auth!.signIn.social({ provider: 'google', callbackURL: location.href }))
}

export async function signOut() {
  await auth!.signOut()
  setAccount({ state: 'signed-out' })
}

/** JWT for the app's API (`Authorization: Bearer`): the Neon Auth client puts it on the session. */
export async function getToken(): Promise<string | null> {
  if (!auth) return null
  const { data } = await auth.getSession()
  return data?.session?.token ?? null
}
