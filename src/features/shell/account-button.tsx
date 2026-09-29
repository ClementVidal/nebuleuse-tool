import { Cloud, CloudAlert, CloudCheck, CloudOff, Loader2, LogOut, RefreshCw } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { sendEmailCode, signInWithCode, signInWithGoogle, signInWithPassword, signOut, useAccount } from '@/sync/auth'
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

type Step = { kind: 'email' } | { kind: 'code'; email: string } | { kind: 'password'; create: boolean }

function SignIn({ loading }: { loading: boolean }) {
  const [step, setStep] = useState<Step>({ kind: 'email' })
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  const run = async (e: FormEvent, action: () => Promise<void>) => {
    e.preventDefault()
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
        <div className="text-sm font-semibold">Synchroniser tes cartes</div>
        <p className="text-sm text-muted-foreground">Retrouve-les sur tous tes appareils, et laisse Claude les enrichir.</p>
      </div>

      {step.kind === 'email' && (
        <form className="grid gap-2" onSubmit={(e) => run(e, async () => {
          await sendEmailCode(email.trim())
          setStep({ kind: 'code', email: email.trim() })
        })}>
          <Label htmlFor="signin-email">E-mail</Label>
          <Input id="signin-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@exemple.fr" />
          <Button type="submit" disabled={pending || loading}>
            {pending && <Loader2 className="animate-spin" />} Recevoir un code
          </Button>
        </form>
      )}

      {step.kind === 'code' && (
        <form className="grid gap-2" onSubmit={(e) => run(e, async () => {
          const code = new FormData(e.currentTarget as HTMLFormElement).get('code')
          await signInWithCode(step.email, String(code).trim())
        })}>
          <Label htmlFor="signin-code">Code reçu à {step.email}</Label>
          <Input id="signin-code" name="code" inputMode="numeric" autoComplete="one-time-code" required autoFocus placeholder="123456" />
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Se connecter
          </Button>
          <button type="button" className="justify-self-start text-xs text-muted-foreground underline" onClick={() => setStep({ kind: 'email' })}>
            Changer d’e-mail
          </button>
        </form>
      )}

      {step.kind === 'password' && (
        <form className="grid gap-2" onSubmit={(e) => run(e, async () => {
          const password = String(new FormData(e.currentTarget as HTMLFormElement).get('password'))
          await signInWithPassword(email.trim(), password, step.create)
        })}>
          <Label htmlFor="signin-email2">E-mail</Label>
          <Input id="signin-email2" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Label htmlFor="signin-password">Mot de passe</Label>
          <Input id="signin-password" name="password" type="password" autoComplete={step.create ? 'new-password' : 'current-password'} required minLength={8} />
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} {step.create ? 'Créer le compte' : 'Se connecter'}
          </Button>
          <button type="button" className="justify-self-start text-xs text-muted-foreground underline" onClick={() => setStep({ kind: 'password', create: !step.create })}>
            {step.create ? 'J’ai déjà un compte' : 'Créer un compte'}
          </button>
        </form>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid gap-2">
        <Button variant="outline" onClick={(e) => void run(e, signInWithGoogle)} disabled={pending}>
          Continuer avec Google
        </Button>
        {step.kind !== 'password' ? (
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setStep({ kind: 'password', create: false })}>
            Utiliser un mot de passe
          </button>
        ) : (
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setStep({ kind: 'email' })}>
            Recevoir un code par e-mail
          </button>
        )}
      </div>
    </div>
  )
}
