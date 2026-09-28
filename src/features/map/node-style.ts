import { DEFAULT_NODE_STYLE } from '@/db/defaults'
import { colorCss, dimmedColorCss, STROKE_WIDTHS } from '@/db/palette'
import type { CSSProperties } from 'react'
import type { NodeStyle, NodeTemplate } from '@/db/types'

export function templateStyle(template: NodeTemplate | undefined): NodeStyle {
  return { ...DEFAULT_NODE_STYLE, ...template?.style }
}

/**
 * CSS for a node box. The template colour gives the border and a dimmed background; text uses
 * the same hue pulled towards the foreground so long reads keep a comfortable contrast.
 */
export function nodeBoxStyle(style: NodeStyle): CSSProperties {
  const color = colorCss(style.color)
  const text = `color-mix(in oklab, ${color} 30%, var(--foreground))`
  if (style.shape === 'sticky') {
    // Post-it: a stronger fill, no border (unless dashed), a paper-like shadow.
    return {
      color: text,
      background: `color-mix(in oklab, ${color} var(--tint-sticky), var(--canvas))`,
      border: style.dashed ? `${STROKE_WIDTHS[style.strokeWidth].px}px dashed ${color}` : 'none',
      borderRadius: 3,
      boxShadow: 'var(--node-shadow)',
    }
  }
  return {
    color: text,
    background: dimmedColorCss(style.color),
    border: `${STROKE_WIDTHS[style.strokeWidth].px}px ${style.dashed ? 'dashed' : 'solid'} ${color}`,
  }
}

/** Extra class for a node box (the post-it's folded corner, see `.node-sticky` in index.css). */
export function nodeBoxClass(style: NodeStyle): string | undefined {
  return style.shape === 'sticky' ? 'node-sticky' : undefined
}

/** Title colour: the template hue, darkened (or lightened in dark mode) enough to read well. */
export function nodeTitleColor(style: NodeStyle) {
  return `color-mix(in oklab, ${colorCss(style.color)} 55%, var(--foreground))`
}
