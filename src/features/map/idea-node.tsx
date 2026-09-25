import { Handle, NodeResizer, Position, type Node, type NodeProps } from '@xyflow/react'
import { CornerDownRight } from 'lucide-react'
import { memo, useMemo } from 'react'
import { generator, RoughPaths, seedFrom, sketchOptions } from '@/components/sketch/rough'
import { updateNode } from '@/db/actions'
import { colorCss, STROKE_WIDTHS } from '@/db/palette'
import type { IdeaNode as IdeaNodeModel } from '@/db/types'
import { useMapActions } from './map-context'
import { markdownExcerpt } from './markdown'
import { resolveNodeStyle } from './node-style'

export type IdeaFlowNode = Node<{ model: IdeaNodeModel }, 'idea'>

const PAD = 6 // room around the rough outline so jitter isn't clipped

function IdeaNodeView({ data, width = 220, height = 120, selected }: NodeProps<IdeaFlowNode>) {
  const { model } = data
  const { templates, openNode } = useMapActions()
  const template = templates.get(model.templateId)
  const style = resolveNodeStyle(model, template)
  const strokePx = STROKE_WIDTHS[style.strokeWidth].px
  const hasChildMap = model.childMapId !== null

  const drawables = useMemo(() => {
    const seed = seedFrom(model.id)
    const fill = style.background === 'transparent' || style.fillStyle === 'none' ? undefined : colorCss(style.background)
    const outline = generator.rectangle(PAD, PAD, width - 2 * PAD, height - 2 * PAD, sketchOptions({
      seed,
      stroke: colorCss(style.stroke),
      strokeWidth: strokePx,
      fill,
      fillStyle: style.fillStyle === 'none' ? 'solid' : style.fillStyle,
      fillWeight: strokePx / 2,
      hachureGap: 8,
    }))
    // A second, offset outline hints that the node opens onto a deeper map.
    const depth = hasChildMap
      ? [generator.rectangle(PAD + 5, PAD + 5, width - 2 * PAD, height - 2 * PAD, sketchOptions({
          seed: seed + 1,
          stroke: colorCss(style.stroke),
          strokeWidth: Math.max(1, strokePx / 2),
        }))]
      : []
    return { outline: [outline], depth }
  }, [model.id, width, height, style.stroke, style.background, style.fillStyle, strokePx, hasChildMap])

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
    <div className="group relative font-sketch" style={{ width, height, color: 'var(--sketch-ink)' }}>
      <NodeResizer
        isVisible={selected}
        minWidth={120}
        minHeight={60}
        color="var(--sketch-blue)"
        onResizeEnd={(_, { x, y, width, height }) => void updateNode(model.id, { x, y, width, height })}
      />
      <svg className="pointer-events-none absolute inset-0 overflow-visible" width={width} height={height}>
        <RoughPaths drawables={drawables.depth} />
        <RoughPaths drawables={drawables.outline} />
        {selected && (
          <rect
            x={1}
            y={1}
            width={width - 2}
            height={height - 2}
            rx={4}
            style={{ fill: 'none', stroke: 'var(--sketch-blue)', strokeWidth: 1, strokeDasharray: '4 4' }}
          />
        )}
      </svg>

      <div className="relative flex h-full flex-col gap-1 overflow-hidden px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="line-clamp-2 text-lg leading-tight" style={{ color: colorCss(style.stroke) }}>
            {model.title || 'Sans titre'}
          </div>
          <button
            type="button"
            title="Entrer dans cette idée (Entrée)"
            className="nodrag shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-70 hover:!opacity-100"
            onClick={(e) => {
              e.stopPropagation()
              openNode(model.id)
            }}
          >
            <CornerDownRight className="size-4" />
          </button>
        </div>
        {preview.map((p) => (
          <div key={p.id} className="line-clamp-3 text-sm leading-snug opacity-80">
            {p.text}
          </div>
        ))}
        {template && (
          <div className="mt-auto text-xs opacity-50">{template.name}</div>
        )}
      </div>

      <Handle type="source" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Left} id="left" />
    </div>
  )
}

export const IdeaNodeComponent = memo(IdeaNodeView)
