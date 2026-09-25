import rough from 'roughjs'
import type { Drawable, Options } from 'roughjs/bin/core'

export const generator = rough.generator()

/** Stable numeric seed from an id, so a shape keeps the same "hand-drawn" jitter across renders. */
export function seedFrom(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return (Math.abs(hash) % 2 ** 31) + 1
}

export const DASH_ARRAYS = {
  solid: undefined,
  dashed: [8, 8],
  dotted: [1.5, 6],
} as const

export function sketchOptions(options: Options): Options {
  return { roughness: 1, bowing: 1, ...options }
}

/**
 * Renders rough.js drawables as SVG paths. Colors are applied through `style` so
 * CSS variables (theme-aware palette) work.
 */
export function RoughPaths({ drawables, className }: { drawables: Drawable[]; className?: string }) {
  return (
    <g className={className}>
      {drawables.flatMap((drawable, i) =>
        generator.toPaths(drawable).map((p, j) => (
          <path
            key={`${i}-${j}`}
            d={p.d}
            style={{
              stroke: p.stroke === 'none' ? 'none' : p.stroke,
              strokeWidth: p.strokeWidth,
              fill: p.fill && p.fill !== 'none' ? p.fill : 'none',
              strokeDasharray: drawable.options.strokeLineDash?.join(' '),
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            }}
          />
        )),
      )}
    </g>
  )
}
