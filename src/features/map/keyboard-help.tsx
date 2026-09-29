import { Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const SHORTCUTS: [string, string][] = [
  ['Ctrl+K', 'Palette : chercher une idée, une commande'],
  ['Ctrl+Z', 'Annuler'],
  ['Ctrl+Maj+Z · Ctrl+Y', 'Rétablir'],
  ['L', 'Verrouiller (lecture) / déverrouiller (édition)'],
  ['← ↑ → ↓', 'Sélectionner le nœud voisin'],
  ['Espace · E', 'Lire (verrouillé) · éditer (déverrouillé)'],
  ['Entrée', "Explorer l'idée sélectionnée"],
  ['Échap · Alt+↑', 'Remonter à la carte parente'],
  ['F', 'Centrer la vue sur la sélection'],
  ['B', 'Ajouter / retirer la sélection des favoris'],
  ['Clic idée', 'Menu : explorer · réglages · supprimer'],
  ['Double-clic idée', 'Lire (verrouillé) · éditer (déverrouillé)'],
  ['Clic lien', "Aller à l'idée à l'autre bout"],
  ['Glisser un +', 'Relier à une idée, ou créer une idée reliée'],
  ['N · double-clic fond', 'Nouvelle idée (déverrouillé)'],
  ['Tab', 'Nouvelle idée reliée (déverrouillé)'],
  ['1 … 9', 'Choisir le template de création'],
  ['Suppr', 'Supprimer la sélection (déverrouillé)'],
  ['Ctrl ⇧ ] · Ctrl ⇧ [', 'Premier plan · arrière-plan (déverrouillé)'],
]

export function KeyboardHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" title="Raccourcis clavier" aria-label="Raccourcis clavier">
          <Keyboard />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="mb-2 text-sm font-medium">Raccourcis clavier</div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={keys} className="contents">
              <dt>
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{keys}</kbd>
              </dt>
              <dd className="text-muted-foreground">{label}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  )
}
