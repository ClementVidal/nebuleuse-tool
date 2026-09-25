import { Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const SHORTCUTS: [string, string][] = [
  ['Ctrl+K', 'Palette : chercher une idée, une commande'],
  ['Ctrl+Z', 'Annuler'],
  ['Ctrl+Maj+Z · Ctrl+Y', 'Rétablir'],
  ['← ↑ → ↓', 'Sélectionner le nœud voisin'],
  ['Entrée', "Entrer dans l'idée sélectionnée"],
  ['Échap · Alt+↑', 'Remonter à la carte parente'],
  ['E · F2', 'Éditer le nœud sélectionné'],
  ['N', 'Nouvelle idée au centre'],
  ['Tab', 'Nouvelle idée reliée à la sélection'],
  ['1 … 9', 'Choisir le template de création'],
  ['Clic idée', 'Menu : focus · entrer · éditer'],
  ['F', 'Focus : centrer la vue sur la sélection'],
  ['B', 'Ajouter / retirer la sélection des favoris'],
  ['L', 'Verrouiller / déverrouiller'],
  ['Suppr', 'Supprimer la sélection'],
  ['Double-clic fond', 'Créer une idée'],
  ['Double-clic idée', 'Éditer (verrouillé) · entrer (déverrouillé)'],
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
