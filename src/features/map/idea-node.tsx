import { Handle, NodeResizer, NodeToolbar, Position, type Node, type NodeProps, type OnResizeEnd } from '@xyflow/react'
import { ArrowDown, ArrowUp, Bookmark, BringToFront, CornerDownRight, Ellipsis, Plus, SendToBack, Settings2, Trash2 } from 'lucide-react'
import { memo, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { restack, updateNode } from '@/db/actions'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { fieldValue, formatFieldValue, isEmptyValue } from '@/db/fields'
import { colorCss } from '@/db/palette'
import type { IdeaNode as IdeaNodeModel } from '@/db/types'
import { cn } from '@/lib/utils'
import { useMapActions } from './map-context'
import { markdownToHtml } from './markdown'
import { StatusDot } from './status'
import { IdeaTimelines } from './timeline'
import { nodeBoxClass, nodeBoxStyle, templateStyle } from './node-style'

export type IdeaFlowNode = Node<{ model: IdeaNodeModel }, 'idea'>

const LINK_HANDLES = [
  { position: Position.Right, id: 'right' },
  { position: Position.Bottom, id: 'bottom' },
  { position: Position.Left, id: 'left' },
]

function IdeaNodeView({ data, width = 220, height = 120, selected }: NodeProps<IdeaFlowNode>) {
  const { model } = data
  const { templates, openNode, openSettings, requestDelete, navigateUp, childMapSizes, menuNodeId, locked, closeMenu } = useMapActions()
  const template = templates.get(model.templateId)
  const style = templateStyle(template)
  const box = nodeBoxStyle(style)
  const childSize = model.childMapId ? (childMapSizes.get(model.childMapId) ?? 0) : 0
  const hasChildMap = childSize > 0
  // Must stay stable: React Flow rebuilds its drag handler when this changes, which drops an
  // ongoing touch gesture (resizing on mobile froze after the first move).
  const onResizeEnd: OnResizeEnd = useCallback(
    (_, { x, y, width, height }) => void updateNode(model.id, { x, y, width, height }),
    [model.id],
  )

  // The node is a miniature of the idea's page: same elements, same order (title, meta line,
  // timelines, text sections), trimmed to what fits.
  const { chips, sections } = useMemo(() => {
    const visible = (template?.fields ?? []).filter((f) => f.showOnNode !== false)
    const chips = visible
      .filter((f) => f.type === 'number')
      .flatMap((f) => {
        const text = formatFieldValue(f, fieldValue(model, f))
        return text ? [{ id: f.id, label: f.label, text }] : []
      })
    const rich = visible.filter((f) => f.type === 'richtext')
    const sections = rich.flatMap((f) => {
      const value = fieldValue(model, f)
      return isEmptyValue(value) ? [] : [{ id: f.id, label: rich.length > 1 ? f.label : undefined, html: markdownToHtml(String(value)) }]
    })
    return { chips, sections }
  }, [template, model])

  return (
    <div className="group relative" style={{ width, height }}>
      <NodeResizer
        isVisible={selected && !locked}
        minWidth={120}
        minHeight={60}
        color="var(--sketch-blue)"
        onResizeEnd={onResizeEnd}
      />
      {/* A card stacked behind hints that the node opens onto a deeper map. */}
      {hasChildMap && (
        <div
          className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-lg"
          style={{ border: box.border === 'none' ? undefined : box.border, background: box.background, boxShadow: 'var(--node-card-shadow)' }}
        />
      )}
      <div
        className={cn(
          'idea-box relative flex h-full flex-col gap-2 overflow-hidden rounded-lg px-4 pt-3 pb-3.5 shadow-sm transition-shadow',
          nodeBoxClass(style),
          selected && 'ring-2 ring-[var(--sketch-blue)] ring-offset-2 ring-offset-[var(--canvas)]',
        )}
        style={box}
      >
        {/* Kicker: the template, as a section name above a Medium headline. */}
        {template && (
          <div className="flex shrink-0 items-center gap-1.5 text-[10.5px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: colorCss(style.color) }} />
            <span className="truncate">{template.name}</span>
            {model.bookmarkedAt && <Bookmark className="ml-auto size-3.5 shrink-0 fill-current" aria-label="Favori" />}
          </div>
        )}
        <div className="line-clamp-3 shrink-0 text-[16px] leading-[1.2] font-bold tracking-[-0.015em] text-balance">
          {model.title || 'Sans titre'}
        </div>

        {/* Meta line, as under the page title: status, then number fields. */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <StatusDot status={model.status} withLabel />
          {chips.map((c) => (
            <span key={c.id} className="max-w-full truncate rounded-full bg-muted px-2 py-px">
              {c.label} : <span className="font-medium text-foreground">{c.text}</span>
            </span>
          ))}
        </div>

        <IdeaTimelines node={model} template={template} accent={colorCss(style.color)} onlyVisibleOnNode className="shrink-0" />

        {sections.length > 0 && (
          // Selected: the text scrolls with the wheel (nowheel keeps the canvas from zooming).
          // Otherwise a fade at the bottom hints that there is more to read.
          <div
            className={cn(
              'node-prose mt-0.5 min-h-0 flex-1',
              selected ? 'nowheel overflow-y-auto overscroll-contain' : 'node-prose-fade overflow-hidden',
            )}
          >
            {sections.map((s) => (
              <section key={s.id}>
                {s.label && <h4 className="node-field-label">{s.label}</h4>}
                <div dangerouslySetInnerHTML={{ __html: s.html }} />
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Depth navigation: up to the parent map, down into this idea's own map. */}
      <div className="nodrag nopan absolute top-0 left-full ml-1.5 flex flex-col overflow-hidden rounded-full border bg-background shadow-xs">
        <button
          type="button"
          disabled={!navigateUp}
          title={navigateUp ? 'Remonter à la carte parente' : 'Carte racine du projet'}
          aria-label="Remonter à la carte parente"
          className="flex size-6 items-center justify-center text-foreground hover:bg-accent disabled:text-muted-foreground/30 disabled:hover:bg-transparent"
          onClick={(e) => {
            e.stopPropagation()
            navigateUp?.()
          }}
        >
          <ArrowUp className="size-3.5" />
        </button>
        <button
          type="button"
          title={hasChildMap ? `Entrer dans l'idée (${childSize} idée${childSize > 1 ? 's' : ''})` : "Entrer dans l'idée (vide)"}
          aria-label="Entrer dans l'idée"
          className={cn(
            'flex size-6 items-center justify-center border-t hover:bg-accent',
            hasChildMap ? 'text-foreground' : 'text-muted-foreground/40 hover:text-foreground',
          )}
          onClick={(e) => {
            e.stopPropagation()
            openNode(model.id)
          }}
        >
          <ArrowDown className="size-3.5" />
        </button>
      </div>

      <NodeToolbar isVisible={menuNodeId === model.id} position={Position.Top} offset={10}>
        <div
          className="nodrag nopan nowheel flex items-center gap-0.5 rounded-full border bg-popover p-1 text-popover-foreground shadow-md"
          // Menu clicks must not reach the node (whose click handler reopens the menu).
          onClick={(e) => e.stopPropagation()}
        >
          {/* The main action, emphasised: go down into the idea's own map. */}
          <Button
            size="sm"
            className="h-8"
            onClick={() => {
              closeMenu()
              openNode(model.id)
            }}
          >
            <CornerDownRight /> Explorer l’idée
          </Button>
          {!locked && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => {
                  closeMenu()
                  openSettings(model.id)
                }}
              >
                <Settings2 /> Réglages
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-destructive hover:text-destructive"
                onClick={() => {
                  closeMenu()
                  requestDelete(model.id)
                }}
              >
                <Trash2 /> Supprimer
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
                      void restack(model.id, 'front')
                    }}
                  >
                    <BringToFront /> Premier plan
                    <DropdownMenuShortcut>Ctrl ⇧ ]</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      closeMenu()
                      void restack(model.id, 'back')
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

      {/* Link grips: drag one onto another idea to link them, or onto empty space to create a
          linked idea. None on top, where the click menu sits (edges float anyway). */}
      {LINK_HANDLES.map(({ position, id }) => (
        <Handle key={id} type="source" position={position} id={id} className="link-grip" title="Glisser pour relier">
          <Plus />
        </Handle>
      ))}
    </div>
  )
}

export const IdeaNodeComponent = memo(IdeaNodeView)
