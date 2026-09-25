import { Handle, NodeResizer, Position, type Node, type NodeProps } from '@xyflow/react'
import { CornerDownRight } from 'lucide-react'
import { memo, useMemo } from 'react'
import { updateNode } from '@/db/actions'
import { colorCss, STROKE_WIDTHS } from '@/db/palette'
import type { IdeaNode as IdeaNodeModel } from '@/db/types'
import { cn } from '@/lib/utils'
import { useMapActions } from './map-context'
import { markdownExcerpt } from './markdown'
import { resolveNodeStyle } from './node-style'

export type IdeaFlowNode = Node<{ model: IdeaNodeModel }, 'idea'>

function IdeaNodeView({ data, width = 220, height = 120, selected }: NodeProps<IdeaFlowNode>) {
  const { model } = data
  const { templates, openNode } = useMapActions()
  const template = templates.get(model.templateId)
  const style = resolveNodeStyle(model, template)
  const stroke = colorCss(style.stroke)
  const borderWidth = STROKE_WIDTHS[style.strokeWidth].px
  const background = style.background === 'transparent' ? 'var(--canvas)' : colorCss(style.background)
  const hasChildMap = model.childMapId !== null

  const preview = useMemo(() => {
    if (!template) return []
    return template.fields.flatMap((field) => {
      const value = model.values[field.id]
      if (value === null || value === undefined || value === '') return []
      if (field.type === 'richtext') return [{ id: field.id, text: markdownExcerpt(String(value)) }]
      if (field.type === 'date') return [{ id: field.id, text: `${field.label} : ${new Date(String(value)).toLocaleDateString('fr-FR')}` }]
      return [{ id: field.id, text: `${field.label} : ${value}` }]
    })
  }, [template, model.values])

  return (
    <div className="group relative" style={{ width, height }}>
      <NodeResizer
        isVisible={selected}
        minWidth={120}
        minHeight={60}
        color="var(--sketch-blue)"
        onResizeEnd={(_, { x, y, width, height }) => void updateNode(model.id, { x, y, width, height })}
      />
      {/* A card stacked behind hints that the node opens onto a deeper map. */}
      {hasChildMap && (
        <div
          className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-lg"
          style={{ border: `${Math.max(1, borderWidth / 2)}px solid ${stroke}`, background }}
        />
      )}
      <div
        className={cn(
          'relative flex h-full flex-col gap-1 overflow-hidden rounded-lg px-3 py-2.5 shadow-sm transition-shadow',
          selected && 'ring-2 ring-[var(--sketch-blue)] ring-offset-2 ring-offset-[var(--canvas)]',
        )}
        style={{ border: `${borderWidth}px solid ${stroke}`, background, color: 'var(--sketch-ink)' }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="line-clamp-2 font-medium leading-snug" style={{ color: stroke }}>
            {model.title || 'Sans titre'}
          </div>
          <button
            type="button"
            title="Entrer dans cette idée (Entrée)"
            className="nodrag shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100"
            onClick={(e) => {
              e.stopPropagation()
              openNode(model.id)
            }}
          >
            <CornerDownRight className="size-4" />
          </button>
        </div>
        {preview.map((p) => (
          <div key={p.id} className="line-clamp-3 text-xs leading-snug opacity-80">
            {p.text}
          </div>
        ))}
        {template && <div className="mt-auto text-[11px] uppercase tracking-wide opacity-50">{template.name}</div>}
      </div>

      <Handle type="source" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Left} id="left" />
    </div>
  )
}

export const IdeaNodeComponent = memo(IdeaNodeView)
