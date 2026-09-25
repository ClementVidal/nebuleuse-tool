/**
 * Limited palette shared by nodes and edges, modelled on Excalidraw's.
 * Values are CSS variables defined in `index.css` so they adapt to the theme.
 */
export const PALETTE = {
  ink: { label: 'Encre', css: 'var(--sketch-ink)' },
  red: { label: 'Rouge', css: 'var(--sketch-red)' },
  green: { label: 'Vert', css: 'var(--sketch-green)' },
  blue: { label: 'Bleu', css: 'var(--sketch-blue)' },
  orange: { label: 'Orange', css: 'var(--sketch-orange)' },
  violet: { label: 'Violet', css: 'var(--sketch-violet)' },
} as const

export type PaletteColor = keyof typeof PALETTE

export const COLORS: PaletteColor[] = ['ink', 'red', 'green', 'blue', 'orange', 'violet']

export const STROKE_WIDTHS = {
  thin: { label: 'Fine', px: 1 },
  medium: { label: 'Moyenne', px: 2 },
  thick: { label: 'Épaisse', px: 4 },
} as const

export type StrokeWidth = keyof typeof STROKE_WIDTHS

export function colorCss(color: PaletteColor): string {
  return PALETTE[color]?.css ?? PALETTE.ink.css
}

/** A faint tint of a palette colour over the canvas, for node backgrounds. */
export function dimmedColorCss(color: PaletteColor): string {
  return `color-mix(in srgb, ${colorCss(color)} 14%, var(--canvas))`
}
