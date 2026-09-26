import { DEFAULT_NODE_STYLE } from '@/db/defaults'
import { colorCss, dimmedColorCss, STROKE_WIDTHS } from '@/db/palette'
import type { NodeStyle, NodeTemplate } from '@/db/types'

export function templateStyle(template: NodeTemplate | undefined): NodeStyle {
  return { ...DEFAULT_NODE_STYLE, ...template?.style }
}

/**
 * CSS for a node box. The template colour gives the border and a dimmed background; text uses
 * the same hue pulled towards the foreground so long reads keep a comfortable contrast.
 */
export function nodeBoxStyle(style: NodeStyle) {
  const color = colorCss(style.color)
  return {
    color: `color-mix(in srgb, ${color} 30%, var(--foreground))`,
    background: dimmedColorCss(style.color),
    border: `${STROKE_WIDTHS[style.strokeWidth].px}px ${style.dashed ? 'dashed' : 'solid'} ${color}`,
  }
}

/** Title colour: the template hue, darkened (or lightened in dark mode) enough to read well. */
export function nodeTitleColor(style: NodeStyle) {
  return `color-mix(in srgb, ${colorCss(style.color)} 55%, var(--foreground))`
}
