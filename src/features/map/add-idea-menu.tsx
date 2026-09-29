import { CornerDownLeft, Link2, Map as MapIcon, Plus } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import type { MapCardInfo, ReusableNode } from '@/db/hooks'
import { colorCss } from '@/db/palette'
import type { NodeTemplate } from '@/db/types'
import { templateStyle } from './node-style'

interface AddIdeaMenuProps {
  /** Where the menu opens, in pixels inside the canvas. */
  at: { x: number; y: number }
  /** Size of the canvas, to keep the menu inside it. */
  bounds: { width: number; height: number }
  templates: NodeTemplate[]
  reusable: ReusableNode[]
  /** « Référençable » maps (not this one), placed as map cards. */
  maps: MapCardInfo[]
  onCreate: (templateId: string) => void
  onAlias: (nodeId: string) => void
  onMapCard: (mapId: string) => void
  onClose: () => void
}

const WIDTH = 300
const HEIGHT = 360

/**
 * Menu opened by a click on the empty canvas (unlocked): search, then create an idea from a
 * template, place an alias of a « référençable » idea, or a card standing for a « référençable » map.
 */
export function AddIdeaMenu({ at, bounds, templates, reusable, maps, onCreate, onAlias, onMapCard, onClose }: AddIdeaMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const left = Math.max(8, Math.min(at.x, bounds.width - WIDTH - 8))
  const top = Math.max(8, Math.min(at.y, bounds.height - HEIGHT - 8))
  // No keyboard popping up on phones: focus the search only with a mouse / trackpad.
  const autoFocus = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="nodrag nopan nowheel absolute z-20 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg"
      style={{ left, top, width: WIDTH }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <Command loop>
        <CommandInput placeholder="Ajouter une idée, un alias, une carte…" autoFocus={autoFocus} />
        <CommandList className="max-h-[300px]">
          <CommandEmpty>Aucun résultat.</CommandEmpty>
          <CommandGroup heading="Nouvelle idée">
            {templates.map((t) => (
              <CommandItem key={t.id} value={`template ${t.name}`} keywords={[t.name, 'nouvelle', 'idée']} onSelect={() => onCreate(t.id)}>
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorCss(templateStyle(t).color) }} />
                <span className="flex-1 truncate">{t.name}</span>
                <Plus className="opacity-40" />
              </CommandItem>
            ))}
          </CommandGroup>
          {reusable.length > 0 && (
            <CommandGroup heading="Alias d’une idée">
              {reusable.map(({ node, location }) => (
                <CommandItem
                  key={node.id}
                  value={`alias ${node.id} ${node.title}`}
                  keywords={[node.title, location, 'alias']}
                  onSelect={() => onAlias(node.id)}
                >
                  <Link2 className="opacity-60" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{node.title || 'Sans titre'}</span>
                    <span className="block truncate text-xs text-muted-foreground">{location}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {maps.length > 0 && (
            <CommandGroup heading="Carte">
              {maps.map(({ map, name, location, size }) => (
                <CommandItem key={map.id} value={`carte ${map.id} ${name}`} keywords={[name, location, 'carte']} onSelect={() => onMapCard(map.id)}>
                  <MapIcon className="opacity-60" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{name || 'Sans titre'}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[location, `${size} idée${size > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
        <div className="flex items-center gap-1.5 border-t px-3 py-2 text-[11px] text-muted-foreground">
          <CornerDownLeft className="size-3" /> ajouter · Échap fermer
        </div>
      </Command>
    </div>
  )
}
