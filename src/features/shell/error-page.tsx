import type { ErrorComponentProps } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

/** Shown instead of a blank screen when a page crashes. */
export function ErrorPage({ error }: ErrorComponentProps) {
  return (
    <div className="mx-auto grid max-w-lg gap-4 px-4 py-16">
      <h1 className="text-xl font-semibold">Oups, quelque chose s’est mal passé.</h1>
      <p className="text-sm text-muted-foreground">Tes données sont intactes : elles sont stockées dans ce navigateur.</p>
      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
        {error instanceof Error ? `${error.name}: ${error.message}` : String(error)}
      </pre>
      <div className="flex gap-2">
        <Button onClick={() => location.reload()}>Recharger</Button>
        <Button variant="outline" onClick={() => location.assign('/')}>
          Retour aux projets
        </Button>
      </div>
    </div>
  )
}
