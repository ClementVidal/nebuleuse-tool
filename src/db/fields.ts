import type { DateRangeValue, FieldType, FieldValue, IdeaNode, IdeaStatus, TemplateField } from './types'

export const STATUS_LABELS: Record<IdeaStatus, string> = { draft: 'Brouillon', ready: 'Prêt' }

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'richtext', label: 'Texte riche' },
  { value: 'number', label: 'Nombre' },
  { value: 'date', label: 'Date' },
  { value: 'daterange', label: 'Période' },
]

export const isTimelineField = (field: TemplateField) => field.type === 'date' || field.type === 'daterange'

export function isDateRange(value: FieldValue | undefined): value is DateRangeValue {
  return typeof value === 'object' && value !== null && 'start' in value && 'end' in value
}

/** The value shown for a field: the template's default when read-only, else the idea's own value. */
export function fieldValue(node: Pick<IdeaNode, 'values'>, field: TemplateField): FieldValue {
  if (field.readOnly) return field.defaultValue ?? null
  return node.values[field.id] ?? null
}

export function isEmptyValue(value: FieldValue | undefined): boolean {
  return value === null || value === undefined || value === '' || (isDateRange(value) && !value.start && !value.end)
}

/** Values a new idea starts with: every (editable) field's default value. */
export function defaultValues(fields: TemplateField[]): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {}
  for (const f of fields) if (!f.readOnly && !isEmptyValue(f.defaultValue)) values[f.id] = f.defaultValue!
  return values
}

// ---------------------------------------------------------------- dates

/** `yyyy-mm-dd` → local Date (midnight), for date pickers. */
export function parseIsoDate(iso: string | undefined | null): Date | undefined {
  if (!iso) return undefined
  const [y, m, d] = iso.split('-').map(Number)
  if (!y) return undefined
  // setFullYear: `new Date(50, …)` would mean 1950 — historical dates need the real year.
  const date = new Date(2000, (m ?? 1) - 1, d ?? 1)
  date.setFullYear(y)
  return date
}

export function toIsoDate(date: Date): string {
  const p = (n: number, width = 2) => String(n).padStart(width, '0')
  return `${p(date.getFullYear(), 4)}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

/** Days since epoch, for positioning dates on a timeline. */
export function isoToDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(2000, (m ?? 1) - 1, d ?? 1))
  date.setUTCFullYear(y)
  return date.getTime() / 86_400_000
}

export function formatDate(iso: string | undefined | null, style: 'long' | 'medium' | 'short' = 'long'): string {
  const date = parseIsoDate(iso)
  if (!date) return ''
  if (style === 'short') return date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
  return date.toLocaleDateString('fr-FR', { dateStyle: style })
}

export function formatRange(range: DateRangeValue, style: 'long' | 'medium' = 'long'): string {
  if (!range.start || !range.end) return formatDate(range.start || range.end, style)
  if (range.start === range.end) return formatDate(range.start, style)
  const a = parseIsoDate(range.start)!
  const b = parseIsoDate(range.end)!
  // "3 → 12 mars 2024", "3 mars → 4 juin 2024", "3 mars 2023 → 4 juin 2024"
  if (a.getFullYear() === b.getFullYear()) {
    const endText = formatDate(range.end, style)
    const startText =
      a.getMonth() === b.getMonth()
        ? String(a.getDate())
        : a.toLocaleDateString('fr-FR', style === 'long' ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' })
    return `${startText} → ${endText}`
  }
  return `${formatDate(range.start, style)} → ${formatDate(range.end, style)}`
}

/** Text of any field value (for metadata lines and search). */
export function formatFieldValue(field: TemplateField, value: FieldValue): string {
  if (isEmptyValue(value)) return ''
  if (field.type === 'date') return formatDate(String(value))
  if (field.type === 'daterange') return isDateRange(value) ? formatRange(value) : ''
  return String(value)
}
