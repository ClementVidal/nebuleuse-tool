import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { colorCss, PALETTE, STROKE_WIDTHS, type PaletteColor, type StrokeWidth } from '@/db/palette'
import { cn } from '@/lib/utils'

export function ColorPicker({
  colors,
  value,
  onChange,
}: {
  colors: PaletteColor[]
  value: PaletteColor
  onChange: (color: PaletteColor) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          title={PALETTE[color].label}
          aria-label={PALETTE[color].label}
          aria-pressed={value === color}
          onClick={() => onChange(color)}
          className={cn(
            'size-7 rounded-md border border-border outline-offset-2 transition-shadow',
            value === color && 'outline-2 outline-ring',
          )}
          style={{ background: colorCss(color) }}
        />
      ))}
    </div>
  )
}

export function StrokeWidthPicker({ value, onChange }: { value: StrokeWidth; onChange: (width: StrokeWidth) => void }) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      onValueChange={(v) => v && onChange(v as StrokeWidth)}
    >
      {(Object.keys(STROKE_WIDTHS) as StrokeWidth[]).map((width) => (
        <ToggleGroupItem key={width} value={width} title={STROKE_WIDTHS[width].label} aria-label={STROKE_WIDTHS[width].label}>
          <span className="block w-5 rounded-full bg-foreground" style={{ height: STROKE_WIDTHS[width].px + 1 }} />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** Generic single-choice toggle group for small enums. */
export function EnumPicker<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; icon?: React.ReactNode }[]
}) {
  return (
    <ToggleGroup type="single" variant="outline" size="sm" value={value} onValueChange={(v) => v && onChange(v as T)}>
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} title={o.label} aria-label={o.label} className={o.icon ? undefined : 'px-2.5'}>
          {o.icon ?? o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
