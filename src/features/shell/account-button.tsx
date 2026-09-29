import { Cloud, CloudAlert, CloudCheck, CloudOff, Loader2, LogOut, RefreshCw } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { signInWithGoogle, signInWithPassword, signOut, useAccount } from '@/sync/auth'
import { syncNow, useSyncState, type SyncState } from '@/sync/engine'
import { cn } from '@/lib/utils'

function ago(ts: number | undefined, now: number) {
  if (!ts) return 'jamais'
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 5) return 'à l’instant'
  if (s < 60) return `il y a ${s} s`
  const m = Math.round(s / 60)
  return m < 60 ? `il y a ${m} min` : `il y a ${Math.round(m / 60)} h`
}

function statusIcon(sync: SyncState, signedIn: boolean) {
  if (!signedIn) return <Cloud className="opacity-50" />
  switch (sync.state) {
    case 'syncing':
      return <RefreshCw className="animate-spin" />
    case 'offline':
      return <CloudOff />
    case 'error':
      return <CloudAlert className="text-destructive" />
    default:
      return <CloudCheck />
  }
}

/** Header button: sync state at a glance; opens sign-in or account details. */
export function AccountButton() {
  const account = useAccount()
  const sync = useSyncState()
  if (account.state === 'unavailable') return null
  const signedIn = account.state === 'signed-in'
  const label = !signedIn
    ? 'Synchronisation : non connecté'
    : sync.state === 'syncing'
      ? 'Synchronisation…'
      : sync.state === 'offline'
        ? 'Hors ligne'
        : sync.state === 'error'
          ? 'Erreur de synchronisation'
          : 'Synchronisé'
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" title={label} aria-label={label}>
          {statusIcon(sync, signedIn)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        {account.state === 'signed-in' ? <AccountDetails email={account.email} sync={sync} /> : <SignIn loading={account.state === 'loading'} />}
      </PopoverContent>
    </Popover>
  )
}

function AccountDetails({ email, sync }: { email: string; sync: SyncState }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])
  const text =
    sync.state === 'syncing'
      ? 'Synchronisation en cours…'
      : sync.state === 'offline'
        ? `Hors ligne · dernière synchro ${ago(sync.lastSyncAt, now)}`
        : sync.state === 'error'
          ? `Erreur : ${sync.message}`
          : `À jour · ${ago(sync.lastSyncAt, now)}`
  return (
    <div className="grid gap-3">
      <div>
        <div className="text-sm font-semibold">Synchronisé</div>
        <div className="truncate text-sm text-muted-foreground">{email}</div>
      </div>
      <p className={cn('text-sm', sync.state === 'error' ? 'text-destructive' : 'text-muted-foreground')}>{text}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void syncNow()} disabled={sync.state === 'syncing'}>
          <RefreshCw /> Synchroniser
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void signOut()}>
          <LogOut /> Se déconnecter
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Tes cartes restent aussi sur cet appareil, utilisables hors ligne.</p>
    </div>
  )
}

function SignIn({ loading }: { loading: boolean }) {
  const [create, setCreate] = useState(false)
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  const run = async (action: () => Promise<void>) => {
    setPending(true)
    setError(undefined)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid gap-3">
      <div>
        <div className="text-sm font-semibold">{create ? 'Créer un compte' : 'Se connecter'}</div>
        <p className="text-sm text-muted-foreground">Retrouve tes cartes sur tous tes appareils, et laisse Claude les enrichir.</p>
      </div>

      <Button variant="outline" onClick={() => void run(signInWithGoogle)} disabled={pending || loading}>
        <GoogleIcon /> Continuer avec Google
      </Button>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
      </div>

      <form
        className="grid gap-2"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault()
          const password = String(new FormData(e.currentTarget).get('password'))
          void run(() => signInWithPassword(email.trim(), password, create))
        }}
      >
        <Label htmlFor="signin-email">E-mail</Label>
        <Input id="signin-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@exemple.fr" />
        <Label htmlFor="signin-password">Mot de passe</Label>
        <Input
          id="signin-password"
          name="password"
          type="password"
          autoComplete={create ? 'new-password' : 'current-password'}
          required
          minLength={8}
          placeholder={create ? '8 caractères minimum' : undefined}
        />
        <Button type="submit" disabled={pending || loading}>
          {pending && <Loader2 className="animate-spin" />} {create ? 'Créer le compte' : 'Se connecter'}
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button type="button" className="justify-self-center text-xs text-muted-foreground underline" onClick={() => setCreate(!create)}>
        {create ? 'J’ai déjà un compte' : 'Pas encore de compte ? En créer un'}
      </button>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  )
}
