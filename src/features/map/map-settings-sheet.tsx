import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { setMapReusable } from '@/db/actions'
import { useMapCardCount } from '@/db/hooks'
import type { ReflexionMap } from '@/db/types'

interface MapSettingsSheetProps {
  map: ReflexionMap
  /** Owner idea title, or project name for the root map. */
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Settings of a map (header gear). */
export function MapSettingsSheet({ map, label, open, onOpenChange }: MapSettingsSheetProps) {
  const cards = useMapCardCount(map.id) ?? 0
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetHeader>
          <SheetTitle className="truncate pr-6">Réglages de la carte · {label || 'Sans titre'}</SheetTitle>
          <SheetDescription>Réglages de cette carte, pas de ses idées.</SheetDescription>
        </SheetHeader>
        <div className="grid content-start gap-6 overflow-y-auto px-4 pb-6">
          <div className="flex items-start gap-3">
            <Switch
              id="map-reusable"
              checked={!!map.reusable}
              onCheckedChange={(v) => void setMapReusable(map.id, v)}
              className="mt-0.5"
            />
            <label htmlFor="map-reusable" className="grid gap-0.5 text-sm">
              <span className="font-medium">Référençable</span>
              <span className="text-xs text-muted-foreground">
                Proposée dans le menu d’ajout des autres cartes du projet : elle s’y place comme une carte qui l’ouvre d’un clic.
              </span>
              {cards > 0 && (
                <span className="text-xs font-medium text-muted-foreground">
                  Référencée {cards} fois{!map.reusable && ' (les références existantes restent)'}
                </span>
              )}
            </label>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
