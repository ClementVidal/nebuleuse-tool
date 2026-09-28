import { Handle, NodeResizer, NodeToolbar, Position, type Node, type NodeProps } from '@xyflow/react'
import { ArrowDown, ArrowUp, Bookmark, CornerDownRight, Settings2, Trash2 } from 'lucide-react'
import { memo, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { updateNode } from '@/db/actions'
import type { IdeaNode as IdeaNodeModel } from '@/db/types'
import { cn } from '@/lib/utils'
import { useMapActions } from './map-context'
import { markdownToHtml } from './markdown'
import { nodeBoxClass, nodeBoxStyle, nodeTitleColor, templateStyle } from './node-style'

export type IdeaFlowNode = Node<{ model: IdeaNodeModel }, 'idea'>

/** A rich-text field rendered as HTML, or a short "label : value" line for dates and numbers. */
type NodeContent = { id: string; html: string } | { id: string; meta: string }

function IdeaNodeView({ data, width = 220, height = 120, selected }: NodeProps<IdeaFlowNode>) {
  const { model } = data
  const { templates, openNode, openSettings, requestDelete, navigateUp, childMapSizes, menuNodeId, locked, closeMenu } = useMapActions()
  const template = templates.get(model.templateId)
  const style = templateStyle(template)
  const box = nodeBoxStyle(style)
  const childSize = model.childMapId ? (childMapSizes.get(model.childMapId) ?? 0) : 0
  const hasChildMap = childSize > 0

  const content = useMemo(() => {
    if (!template) return []
    return template.fields.flatMap((field): NodeContent[] => {
      const value = model.values[field.id]
      if (value === null || value === undefined || value === '') return []
      if (field.type === 'richtext') return [{ id: field.id, html: markdownToHtml(String(value)) }]
      const text = field.type === 'date' ? new Date(String(value)).toLocaleDateString('fr-FR') : String(value)
      return [{ id: field.id, meta: `${field.label} : ${text}` }]
    })
  }, [template, model.values])

  return (
    <div className="group relative" style={{ width, height }}>
      <NodeResizer
        isVisible={selected && !locked}
        minWidth={120}
        minHeight={60}
        color="var(--sketch-blue)"
        onResizeEnd={(_, { x, y, width, height }) => void updateNode(model.id, { x, y, width, height })}
      />
      {/* A card stacked behind hints that the node opens onto a deeper map. */}
      {hasChildMap && (
        <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-lg" style={{ border: box.border, background: box.background }} />
      )}
      <div
        className={cn(
          'relative flex h-full flex-col gap-1.5 overflow-hidden rounded-lg px-3.5 py-3 shadow-sm transition-shadow',
          nodeBoxClass(style),
          selected && 'ring-2 ring-[var(--sketch-blue)] ring-offset-2 ring-offset-[var(--canvas)]',
        )}
        style={box}
      >
        <div className="flex shrink-0 items-start justify-between gap-2" style={{ color: nodeTitleColor(style) }}>
          <div className="line-clamp-3 text-[15px] font-semibold leading-snug">{model.title || 'Sans titre'}</div>
          {model.bookmarkedAt && <Bookmark className="mt-0.5 size-4 shrink-0 fill-current" aria-label="Favori" />}
        </div>
        {content.length > 0 && (
          // Selected: the text scrolls with the wheel (nowheel keeps the canvas from zooming).
          // Otherwise a fade at the bottom hints that there is more to read.
          <div
            className={cn(
              'node-prose min-h-0 flex-1',
              selected ? 'nowheel overflow-y-auto overscroll-contain' : 'overflow-hidden node-prose-fade',
            )}
          >
            {content.map((c) =>
              'html' in c ? (
                <div key={c.id} dangerouslySetInnerHTML={{ __html: c.html }} />
              ) : (
                <p key={c.id} className="text-[13px] opacity-75">
                  {c.meta}
                </p>
              ),
            )}
          </div>
        )}
        {template && <div className="mt-auto shrink-0 pt-1 text-[11px] uppercase tracking-wide opacity-50">{template.name}</div>}
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
            </>
          )}
        </div>
      </NodeToolbar>

      <Handle type="source" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Left} id="left" />
    </div>
  )
}

export const IdeaNodeComponent = memo(IdeaNodeView)
