import { Loader2 } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { getDbStatus, subscribeDbStatus } from '@/db/db'

/** Renders the app only once the local database is open; explains why otherwise. */
export function DbGate({ children }: { children: ReactNode }) {
  const status = useSyncExternalStore(subscribeDbStatus, getDbStatus)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 800)
    return () => clearTimeout(timer)
  }, [])

  if (status.state === 'ready') return children

  if (status.state === 'blocked') {
    return (
      <Message title="Mise à jour des données en attente">
        <p>
          Une autre page Nébuleuse ouverte — souvent un ancien onglet en arrière-plan — empêche la mise à jour de tes
          données.
        </p>
        <p>Ferme les autres onglets Nébuleuse. L’app reprendra automatiquement ; sinon, recharge la page.</p>
      </Message>
    )
  }

  if (status.state === 'error') {
    const error = status.error
    return (
      <Message title="Impossible d’ouvrir tes données">
        <p>Les données sont stockées dans ce navigateur ; elles n’ont pas été effacées.</p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap text-foreground">
          {error instanceof Error ? `${error.name}: ${error.message}` : String(error)}
        </pre>
      </Message>
    )
  }

  if (!slow) return null
  return (
    <div className="flex min-h-dvh items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Chargement de tes données…
    </div>
  )
}

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-lg gap-4 px-4 py-16">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="grid gap-2 text-sm text-muted-foreground">{children}</div>
      <Button className="justify-self-start" onClick={() => location.reload()}>
        Recharger
      </Button>
    </div>
  )
}
