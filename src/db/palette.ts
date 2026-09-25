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
  transparent: { label: 'Aucune', css: 'transparent' },
  'red-soft': { label: 'Rouge pâle', css: 'var(--sketch-red-soft)' },
  'green-soft': { label: 'Vert pâle', css: 'var(--sketch-green-soft)' },
  'blue-soft': { label: 'Bleu pâle', css: 'var(--sketch-blue-soft)' },
  'yellow-soft': { label: 'Jaune pâle', css: 'var(--sketch-yellow-soft)' },
  'violet-soft': { label: 'Violet pâle', css: 'var(--sketch-violet-soft)' },
} as const

export type PaletteColor = keyof typeof PALETTE

export const STROKE_COLORS: PaletteColor[] = ['ink', 'red', 'green', 'blue', 'orange', 'violet']
export const BACKGROUND_COLORS: PaletteColor[] = [
  'transparent',
  'red-soft',
  'green-soft',
  'blue-soft',
  'yellow-soft',
  'violet-soft',
]

export const STROKE_WIDTHS = {
  thin: { label: 'Fine', px: 1 },
  medium: { label: 'Moyenne', px: 2 },
  thick: { label: 'Épaisse', px: 4 },
} as const

export type StrokeWidth = keyof typeof STROKE_WIDTHS

export function colorCss(color: PaletteColor): string {
  return PALETTE[color]?.css ?? PALETTE.ink.css
}
