import { EdgeLabelRenderer, useInternalNode, type Edge, type EdgeProps, type InternalNode } from '@xyflow/react'
import { memo, useMemo } from 'react'
import { colorCss, STROKE_WIDTHS } from '@/db/palette'
import type { EdgeDash, IdeaEdge } from '@/db/types'
import { arrowheadWings, edgeGeometry, insetPath, type Point, type Rect } from './geometry'

export type LinkFlowEdge = Edge<{ model: IdeaEdge }, 'link'>

const DASH_ARRAYS: Record<EdgeDash, (width: number) => string | undefined> = {
  solid: () => undefined,
  dashed: (w) => `${w * 4} ${w * 3}`,
  dotted: (w) => `0 ${w * 2.5}`,
}

function nodeRect(node: InternalNode): Rect {
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured.width ?? node.width ?? 0,
    height: node.measured.height ?? node.height ?? 0,
  }
}

function arrowhead(tip: Point, dir: Point, size: number): string {
  const [a, b] = arrowheadWings(tip, dir, size)
  return `M ${tip.x} ${tip.y} L ${a.x} ${a.y} L ${b.x} ${b.y} Z`
}

function LinkEdgeView({ source, target, data, selected }: EdgeProps<LinkFlowEdge>) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const model = data?.model

  const shape = useMemo(() => {
    if (!sourceNode || !targetNode || !model) return null
    const g = edgeGeometry(nodeRect(sourceNode), nodeRect(targetNode), model.path === 'curved')
    const width = STROKE_WIDTHS[model.strokeWidth].px
    // Arrowhead proportional to the stroke, like tldraw / FigJam.
    const headSize = 7 + width * 2.5
    const hasStart = model.arrows === 'start' || model.arrows === 'both'
    const hasEnd = model.arrows === 'end' || model.arrows === 'both'
    return {
      geometry: g,
      width,
      // The line stops at the arrowhead base so thick lines don't poke through the tip.
      line: insetPath(g, hasStart ? headSize * 0.7 : 0, hasEnd ? headSize * 0.7 : 0),
      heads: [
        ...(hasEnd ? [arrowhead(g.end, g.endDir, headSize)] : []),
        ...(hasStart ? [arrowhead(g.start, { x: -g.startDir.x, y: -g.startDir.y }, headSize)] : []),
      ],
    }
  }, [sourceNode, targetNode, model])

  if (!shape || !model) return null
  // Slightly softened towards the canvas: arrows support the ideas without competing with them.
  const color = `color-mix(in srgb, ${colorCss(model.color)} 78%, var(--canvas))`

  return (
    <>
      {/* Halo: shown on hover, stronger when selected (see .link-halo in index.css). */}
      <path
        d={shape.geometry.path}
        className={selected ? 'link-halo link-halo-selected' : 'link-halo'}
        style={{ fill: 'none', strokeWidth: shape.width + 10, strokeLinecap: 'round' }}
      />
      <path
        d={shape.line}
        style={{
          fill: 'none',
          stroke: color,
          strokeWidth: shape.width,
          strokeDasharray: DASH_ARRAYS[model.dash](shape.width),
          strokeLinecap: 'round',
        }}
      />
      {shape.heads.map((d, i) => (
        <path key={i} d={d} style={{ fill: color, stroke: color, strokeWidth: Math.max(1.5, shape.width * 0.75), strokeLinejoin: 'round' }} />
      ))}
      {/* Wide invisible path so thin edges stay easy to click. */}
      <path
        d={shape.geometry.path}
        className="react-flow__edge-interaction"
        style={{ fill: 'none', stroke: 'transparent', strokeWidth: 20 }}
      />
      {model.label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute max-w-48 truncate rounded-full border border-border/60 bg-canvas px-2.5 py-0.5 text-xs font-medium shadow-xs"
            style={{
              transform: `translate(-50%, -50%) translate(${shape.geometry.labelAt.x}px, ${shape.geometry.labelAt.y}px)`,
              color,
            }}
          >
            {model.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const LinkEdgeComponent = memo(LinkEdgeView)
