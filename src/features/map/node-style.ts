import { DEFAULT_NODE_STYLE } from '@/db/defaults'
import { colorCss, dimmedColorCss, STROKE_WIDTHS } from '@/db/palette'
import type { NodeStyle, NodeTemplate } from '@/db/types'

export function templateStyle(template: NodeTemplate | undefined): NodeStyle {
  return { ...DEFAULT_NODE_STYLE, ...template?.style }
}

/** CSS for a node box: one colour for text and border, a dimmed tint of it as background. */
export function nodeBoxStyle(style: NodeStyle) {
  const color = colorCss(style.color)
  return {
    color,
    background: dimmedColorCss(style.color),
    border: `${STROKE_WIDTHS[style.strokeWidth].px}px ${style.dashed ? 'dashed' : 'solid'} ${color}`,
  }
}
