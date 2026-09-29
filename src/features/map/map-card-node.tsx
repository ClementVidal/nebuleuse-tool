import { Handle, NodeResizer, NodeToolbar, Position, type NodeProps, type OnResizeEnd } from '@xyflow/react'
import { ArrowRight, BringToFront, Ellipsis, Map as MapIcon, Plus, SendToBack, Trash2 } from 'lucide-react'
import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { restack, updateNode } from '@/db/actions'
import { cn } from '@/lib/utils'
import type { IdeaFlowNode } from './idea-node'
import { useMapActions } from './map-context'

const LINK_HANDLES = [
  { position: Position.Top, id: 'top' },
  { position: Position.Right, id: 'right' },
  { position: Position.Left, id: 'left' },
]

/**
 * Map card: a node standing for another map of the project (a « référençable » one). It shows the
 * map's name, where it lives and its first ideas; clicking it opens the map.
 */
export function MapCardView({ data, width = 260, height = 132, selected }: NodeProps<IdeaFlowNode>) {
  const own = data.model
  const { mapCards, openMap, requestDelete, menuNodeId, locked, closeMenu } = useMapActions()
  const info = own.mapRef ? mapCards.get(own.mapRef) : undefined
  const onResizeEnd: OnResizeEnd = useCallback(
    (_, { x, y, width, height }) => void updateNode(own.id, { x, y, width, height }),
    [own.id],
  )
  const open = () => {
    closeMenu()
    if (info) openMap(info.map.id)
  }

  return (
    <div className="group relative cursor-pointer" style={{ width, height }}>
      <NodeResizer isVisible={selected && !locked} minWidth={160} minHeight={80} color="var(--sketch-blue)" onResizeEnd={onResizeEnd} />
      {/* Two sheets stacked behind: a map is a whole set of ideas. */}
      <div className="map-card-sheet absolute inset-0 translate-x-2 translate-y-2 rounded-xl" />
      <div className="map-card-sheet absolute inset-0 translate-x-1 translate-y-1 rounded-xl" />
      <div
        className={cn(
          'idea-box map-card relative flex h-full flex-col gap-1.5 overflow-hidden rounded-xl px-4 pt-3 pb-3 transition-shadow',
          selected && 'ring-2 ring-[var(--sketch-blue)] ring-offset-2 ring-offset-[var(--canvas)]',
        )}
      >
        <div className="flex shrink-0 items-center gap-1.5 text-[10.5px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          <MapIcon className="size-3.5 shrink-0" />
          <span className="truncate">Carte{info?.location ? ` · ${info.location}` : ''}</span>
        </div>
        <div className="line-clamp-2 shrink-0 text-[16px] leading-[1.2] font-bold tracking-[-0.015em] text-balance">
          {info ? info.name || 'Sans titre' : 'Carte introuvable'}
        </div>
        {info && info.titles.length > 0 && (
          <ul className="grid min-h-0 flex-1 content-start gap-0.5 overflow-hidden text-[12px] text-muted-foreground">
            {info.titles.map((title, i) => (
              <li key={i} className="flex min-w-0 items-center gap-1.5">
                <span className="size-1 shrink-0 rounded-full bg-current opacity-60" />
                <span className="truncate">{title}</span>
              </li>
            ))}
          </ul>
        )}
        {info && (
          <div className="mt-auto flex shrink-0 items-center gap-1 pt-0.5 text-[11px] font-medium text-muted-foreground">
            {info.size === 0 ? 'Carte vide' : `${info.size} idée${info.size > 1 ? 's' : ''}`}
            <span className="ml-auto flex items-center gap-1 text-foreground opacity-0 transition-opacity group-hover:opacity-100">
              Ouvrir <ArrowRight className="size-3.5" />
            </span>
          </div>
        )}
      </div>

      <NodeToolbar isVisible={menuNodeId === own.id} position={Position.Bottom} offset={12}>
        <div
          className="nodrag nopan nowheel flex items-center gap-0.5 rounded-full border bg-popover p-1 text-popover-foreground shadow-md"
          onClick={(e) => e.stopPropagation()}
        >
          <Button size="sm" className="h-8" disabled={!info} onClick={open}>
            <MapIcon /> Ouvrir la carte
          </Button>
          {!locked && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-destructive hover:text-destructive"
                onClick={() => {
                  closeMenu()
                  requestDelete(own.id)
                }}
              >
                <Trash2 /> Retirer
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8" aria-label="Plus d’options" title="Plus d’options">
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="nodrag nopan w-56" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem
                    onSelect={() => {
                      closeMenu()
                      void restack(own.id, 'front')
                    }}
                  >
                    <BringToFront /> Premier plan
                    <DropdownMenuShortcut>Ctrl ⇧ ]</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      closeMenu()
                      void restack(own.id, 'back')
                    }}
                  >
                    <SendToBack /> Arrière-plan
                    <DropdownMenuShortcut>Ctrl ⇧ [</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </NodeToolbar>

      {LINK_HANDLES.map(({ position, id }) => (
        <Handle key={id} type="source" position={position} id={id} className="link-grip" title="Glisser pour relier">
          <Plus />
        </Handle>
      ))}
    </div>
  )
}
