import { EdgeLabelRenderer, useInternalNode, type Edge, type EdgeProps, type InternalNode } from '@xyflow/react'
import { memo, useMemo } from 'react'
import { DASH_ARRAYS, generator, RoughPaths, seedFrom, sketchOptions } from '@/components/sketch/rough'
import { colorCss, STROKE_WIDTHS } from '@/db/palette'
import type { IdeaEdge } from '@/db/types'
import { arrowheadWings, edgeGeometry, type Rect } from './geometry'

export type SketchFlowEdge = Edge<{ model: IdeaEdge }, 'sketch'>

function nodeRect(node: InternalNode): Rect {
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured.width ?? node.width ?? 0,
    height: node.measured.height ?? node.height ?? 0,
  }
}

function SketchEdgeView({ id, source, target, data, selected }: EdgeProps<SketchFlowEdge>) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const model = data?.model

  const geometry = useMemo(() => {
    if (!sourceNode || !targetNode || !model) return null
    return edgeGeometry(nodeRect(sourceNode), nodeRect(targetNode), model.path === 'curved')
  }, [sourceNode, targetNode, model])

  const drawables = useMemo(() => {
    if (!geometry || !model) return []
    const strokePx = STROKE_WIDTHS[model.strokeWidth].px
    const options = sketchOptions({
      seed: seedFrom(id),
      stroke: colorCss(model.color),
      strokeWidth: strokePx,
      strokeLineDash: DASH_ARRAYS[model.dash] ? [...DASH_ARRAYS[model.dash]!] : undefined,
    })
    const headOptions = { ...options, strokeLineDash: undefined }
    const headSize = 10 + strokePx * 2
    const shapes = [generator.path(geometry.path, options)]
    if (model.arrows === 'end' || model.arrows === 'both') {
      const [a, b] = arrowheadWings(geometry.end, geometry.endDir, headSize)
      shapes.push(generator.linearPath([[a.x, a.y], [geometry.end.x, geometry.end.y], [b.x, b.y]], headOptions))
    }
    if (model.arrows === 'start' || model.arrows === 'both') {
      const reversed = { x: -geometry.startDir.x, y: -geometry.startDir.y }
      const [a, b] = arrowheadWings(geometry.start, reversed, headSize)
      shapes.push(generator.linearPath([[a.x, a.y], [geometry.start.x, geometry.start.y], [b.x, b.y]], headOptions))
    }
    return shapes
  }, [geometry, model, id])

  if (!geometry || !model) return null

  return (
    <>
      {selected && (
        <path
          d={geometry.path}
          style={{ fill: 'none', stroke: 'var(--sketch-blue)', strokeOpacity: 0.25, strokeWidth: 10, strokeLinecap: 'round' }}
        />
      )}
      <RoughPaths drawables={drawables} />
      {/* Wide invisible path so thin edges stay easy to click. */}
      <path d={geometry.path} className="react-flow__edge-interaction" style={{ fill: 'none', stroke: 'transparent', strokeWidth: 20 }} />
      {model.label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute rounded bg-canvas px-1.5 font-sketch text-base"
            style={{
              transform: `translate(-50%, -50%) translate(${geometry.labelAt.x}px, ${geometry.labelAt.y}px)`,
              color: colorCss(model.color),
            }}
          >
            {model.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const SketchEdgeComponent = memo(SketchEdgeView)
