import { Check, Copy, Loader2, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getToken } from '@/sync/auth'

type Info = { createdAt: string; lastUsedAt: string | null } | null

async function call<T>(method: string): Promise<T> {
  const token = await getToken()
  const res = await fetch('/api/mcp-token', { method, headers: { authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Erreur ${res.status}`)
  return (await res.json()) as T
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'jamais'

/**
 * Gives Claude access to the account through the MCP server: a personal connector URL to paste in
 * claude.ai (Settings → Connectors). Shown once; can be regenerated or revoked.
 */
export function ClaudeConnect() {
  const [info, setInfo] = useState<Info | undefined>(undefined)
  const [url, setUrl] = useState<string>()
  const [copied, setCopied] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    call<{ token: Info }>('GET').then(
      (r) => setInfo(r.token),
      () => setInfo(null),
    )
  }, [])

  const run = async (action: () => Promise<void>) => {
    setPending(true)
    setError(undefined)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }
  const generate = () =>
    run(async () => {
      const { key } = await call<{ key: string }>('POST')
      setUrl(`${location.origin}/api/mcp/${key}`)
      setInfo({ createdAt: new Date().toISOString(), lastUsedAt: null })
    })
  const revoke = () =>
    run(async () => {
      await call('DELETE')
      setInfo(null)
      setUrl(undefined)
    })

  return (
    <div className="grid gap-2 border-t pt-3">
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles className="size-4" /> Claude
      </div>
      {url ? (
        <>
          <p className="text-xs text-muted-foreground">
            Adresse du connecteur — copie-la maintenant, elle ne sera plus affichée. Elle donne accès à tes cartes : garde-la privée.
          </p>
          <div className="flex gap-1.5">
            <Input readOnly value={url} className="h-8 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Adresse du connecteur" />
            <Button
              size="icon"
              variant="outline"
              className="size-8 shrink-0"
              aria-label="Copier"
              onClick={() => {
                void navigator.clipboard.writeText(url)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Dans claude.ai : Réglages → Connecteurs → Ajouter un connecteur personnalisé → nom « Nébuleuse », colle l’adresse.
          </p>
        </>
      ) : info === undefined ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : info ? (
        <>
          <p className="text-xs text-muted-foreground">
            Connecté depuis le {when(info.createdAt)} · dernière utilisation : {when(info.lastUsedAt)}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => void generate()} title="L’ancienne adresse cessera de fonctionner">
              Nouvelle adresse
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => void revoke()}>
              Déconnecter
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Laisse Claude créer et enrichir tes cartes depuis claude.ai : il écrit, tu lis.</p>
          <Button size="sm" disabled={pending} onClick={() => void generate()} className="justify-self-start">
            {pending && <Loader2 className="animate-spin" />} Connecter Claude
          </Button>
        </>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
