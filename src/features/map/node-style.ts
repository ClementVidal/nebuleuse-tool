import { DEFAULT_NODE_STYLE } from '@/db/defaults'
import { colorCss } from '@/db/palette'
import type { CSSProperties } from 'react'
import type { NodeStyle, NodeTemplate } from '@/db/types'

export function templateStyle(template: NodeTemplate | undefined): NodeStyle {
  return { ...DEFAULT_NODE_STYLE, ...template?.style }
}

const ACCENT_WIDTHS = { thin: 2, medium: 3, thick: 5 } as const

/**
 * CSS for a node box — an editorial "paper" card: neutral surface, fine grey border, soft shadow,
 * dark text. The template colour is only an accent: a rule along the left edge (its thickness is
 * the template's border width) and the dot of the kicker (see idea-node).
 * - dashed: the border is dashed (still neutral);
 * - post-it: a faint warm tint of the colour, no border, a lifted shadow and a folded corner.
 */
export function nodeBoxStyle(style: NodeStyle): CSSProperties {
  const color = colorCss(style.color)
  const accent = `inset ${ACCENT_WIDTHS[style.strokeWidth]}px 0 0 ${color}`
  if (style.shape === 'sticky') {
    return {
      color: 'var(--foreground)',
      background: `color-mix(in oklab, ${color} var(--tint-sticky), var(--card))`,
      border: style.dashed ? `1px dashed color-mix(in oklab, ${color} 45%, var(--border))` : 'none',
      borderRadius: 4,
      boxShadow: 'var(--node-shadow)',
    }
  }
  return {
    color: 'var(--foreground)',
    background: 'var(--card)',
    border: `1px ${style.dashed ? 'dashed' : 'solid'} var(--node-border)`,
    boxShadow: `${accent}, var(--node-card-shadow)`,
  }
}

/** Extra class for a node box (the post-it's folded corner, see `.node-sticky` in index.css). */
export function nodeBoxClass(style: NodeStyle): string | undefined {
  return style.shape === 'sticky' ? 'node-sticky' : undefined
}
