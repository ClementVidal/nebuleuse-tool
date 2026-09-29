import { fieldValue, formatDate, formatRange, isDateRange, isoToDay, isTimelineField } from '@/db/fields'
import { timelineKey, type TimelineEntry } from '@/db/hooks'
import { colorCss } from '@/db/palette'
import type { IdeaNode, NodeTemplate, TemplateField } from '@/db/types'
import { cn } from '@/lib/utils'
import { useMapActions } from './map-context'

/** A date or period drawn in front: one of the idea's own fields. */
export interface FocusEntry {
  id: string
  label: string
  start: string
  end: string
  kind: 'date' | 'range'
}

interface TimelineProps {
  /** Timeline name (caption). */
  name: string
  /** The idea's own dates / periods, in front. */
  focus: FocusEntry[]
  /** Other ideas' dates / periods of the same timeline, behind. */
  others?: TimelineEntry[]
  /** CSS colour of the idea (its template's). */
  accent: string
  size?: 'sm' | 'lg'
  className?: string
}

const DAY_MS = 86_400_000
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

interface Tick {
  day: number
  label: string
}

/** Round, evenly spaced axis labels: years, months or days depending on the span. */
function axisTicks(lo: number, hi: number, target: number): Tick[] {
  const span = hi - lo
  const ticks: Tick[] = []
  const from = new Date(lo * DAY_MS)
  if (span > 730) {
    const years = span / 365.25
    const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find((s) => years / s <= target) ?? 1000
    for (let y = Math.ceil(from.getUTCFullYear() / step) * step; ; y += step) {
      const day = Date.UTC(y, 0, 1) / DAY_MS
      if (day > hi) break
      if (day >= lo) ticks.push({ day, label: String(y) })
    }
  } else if (span > 62) {
    const months = span / 30.4
    const step = [1, 2, 3, 6].find((s) => months / s <= target) ?? 12
    let y = from.getUTCFullYear()
    let m = Math.ceil(from.getUTCMonth() / step) * step
    for (;;) {
      y += Math.floor(m / 12)
      m %= 12
      const day = Date.UTC(y, m, 1) / DAY_MS
      if (day > hi) break
      if (day >= lo)
        ticks.push({
          day,
          label: m === 0 ? String(y) : `${MONTHS[m]} ${String(y).slice(2)}`,
        })
      m += step
    }
  } else {
    const step = [1, 2, 7, 14].find((s) => span / s <= target) ?? 30
    for (let day = Math.ceil(lo / step) * step; day <= hi; day += step) {
      const d = new Date(day * DAY_MS)
      ticks.push({
        day,
        label: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`,
      })
    }
  }
  return ticks
}

const entryText = (e: { start: string; end: string; kind: 'date' | 'range' }, style: 'long' | 'medium') =>
  e.kind === 'date' ? formatDate(e.start, style) : formatRange(e, style)

/**
 * A timeline ("frise"): a rail with the other ideas' dates and periods faded behind, the idea's
 * own dates as cursors and its periods as bars in front, and a time axis below.
 */
export function Timeline({ name, focus, others = [], accent, size = 'sm', className }: TimelineProps) {
  const lg = size === 'lg'
  const style = lg ? 'long' : 'medium'
  const spans = [...others, ...focus].map((e) => [isoToDay(e.start), isoToDay(e.end)])
  let lo = Math.min(...spans.map((r) => r[0]))
  let hi = Math.max(...spans.map((r) => r[1]))
  // A lone date has no span to scale: centred, without an axis.
  const lone = hi === lo
  // Room around the extremes.
  const pad = lone ? 30 : (hi - lo) * 0.06
  lo -= pad
  hi += pad
  const pct = (iso: string) => ((isoToDay(iso) - lo) / (hi - lo)) * 100
  const ticks = lone ? [] : axisTicks(lo, hi, lg ? 7 : 4)
  const strong = `color-mix(in oklab, ${accent} 70%, var(--foreground))`

  return (
    <div
      className={cn('timeline select-none', lg ? 'text-sm' : 'text-[11px]', className)}
      role="img"
      aria-label={`Frise ${name} : ${focus.map((f) => `${f.label} ${entryText(f, 'long')}`).join(', ')}${
        others.length ? `, parmi ${others.length} autre${others.length > 1 ? 's' : ''} date${others.length > 1 ? 's' : ''}` : ''
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn('truncate font-medium tracking-wide uppercase opacity-55', lg ? 'text-xs' : 'text-[10px]')}>
          {name}
        </span>
        {focus.length === 1 && (
          <span className="shrink-0 font-semibold tabular-nums" style={{ color: strong }}>
            {entryText(focus[0], style)}
          </span>
        )}
      </div>

      {/* Track */}
      <div className={cn('relative', lg ? 'mt-2 h-9' : 'mt-1 h-6')}>
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-current opacity-10" />
        {ticks.map((t) => (
          <div
            key={t.day}
            className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-current opacity-20"
            style={{ left: `${((t.day - lo) / (hi - lo)) * 100}%` }}
          />
        ))}

        {/* Behind: the rest of the timeline. */}
        {others.map((o) => {
          const color = colorCss(o.color)
          const title = `${o.title || 'Sans titre'} · ${entryText(o, 'long')}`
          const key = `${o.nodeId}:${o.fieldId}`
          return o.kind === 'range' ? (
            <div
              key={key}
              title={title}
              className="absolute top-1/2 h-[5px] min-w-[5px] -translate-y-1/2 rounded-full"
              style={{
                left: `${pct(o.start)}%`,
                width: `${pct(o.end) - pct(o.start)}%`,
                background: `color-mix(in oklab, ${color} 30%, transparent)`,
              }}
            />
          ) : (
            <div
              key={key}
              title={title}
              className="absolute top-1/2 size-[7px] -translate-1/2 rounded-full"
              style={{
                left: `${pct(o.start)}%`,
                background: `color-mix(in oklab, ${color} 45%, transparent)`,
              }}
            />
          )
        })}

        {/* In front: the idea's own dates and periods. */}
        {focus.map((f) => {
          const title = `${f.label} · ${entryText(f, 'long')}`
          if (f.kind === 'range') {
            const left = pct(f.start)
            const width = pct(f.end) - left
            // Too short to show two cursors apart: a single pill.
            const pill = width < (lg ? 3 : 6)
            return (
              <div key={f.id} title={title} className="absolute inset-y-0" style={{ left: `${left}%`, width: `${width}%` }}>
                <div
                  className={cn(
                    'absolute top-1/2 -translate-y-1/2 rounded-full',
                    lg ? 'h-2.5' : 'h-2',
                    pill ? 'left-1/2 min-w-3 -translate-x-1/2 ring-2 ring-[var(--canvas)]' : 'inset-x-0',
                  )}
                  style={{
                    background: accent,
                    width: pill ? undefined : '100%',
                  }}
                />
                {!pill &&
                  ['left-0', 'left-full'].map((side) => (
                    <div
                      key={side}
                      className={cn(
                        'absolute top-1/2 -translate-1/2 rounded-full border-2 bg-[var(--canvas)] shadow-sm',
                        side,
                        lg ? 'size-3.5' : 'size-3',
                      )}
                      style={{ borderColor: accent }}
                    />
                  ))}
              </div>
            )
          }
          // A date: a cursor across the track, a round head on the rail.
          return (
            <div key={f.id} title={title} className="absolute inset-y-0 -translate-x-1/2" style={{ left: `${pct(f.start)}%` }}>
              <div className="absolute inset-y-0.5 left-1/2 w-0.5 -translate-x-1/2 rounded-full" style={{ background: accent }} />
              <div
                className={cn(
                  'absolute top-1/2 left-1/2 -translate-1/2 rounded-full ring-2 ring-[var(--canvas)]',
                  lg ? 'size-3.5' : 'size-3',
                )}
                style={{ background: accent }}
              />
            </div>
          )
        })}
      </div>

      {/* Axis */}
      {!lone && (
        <div className={cn('relative tabular-nums opacity-55', lg ? 'mt-0.5 h-5 text-xs' : 'h-3.5 text-[10px]')}>
          {ticks.map((t) => {
            const x = ((t.day - lo) / (hi - lo)) * 100
            const shift = x < 8 ? '0' : x > 92 ? '-100%' : '-50%'
            return (
              <span
                key={t.day}
                className="absolute top-0 whitespace-nowrap"
                style={{ left: `${x}%`, transform: `translateX(${shift})` }}
              >
                {t.label}
              </span>
            )
          })}
        </div>
      )}

      {/* Legend when the idea has several dates on this timeline. */}
      {focus.length > 1 && (
        <ul className={cn('grid gap-0.5', lg ? 'mt-2' : 'mt-1')}>
          {focus.map((f) => (
            <li key={f.id} className="flex items-center gap-1.5 whitespace-nowrap">
              <span
                className={cn('shrink-0 rounded-full', f.kind === 'range' ? 'h-1.5 w-3' : 'size-2')}
                style={{ background: accent }}
              />
              <span className="truncate opacity-70">{f.label}</span>
              <span className="ml-auto shrink-0 font-semibold tabular-nums" style={{ color: strong }}>
                {entryText(f, style)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function focusEntry(node: IdeaNode, field: TemplateField): FocusEntry | undefined {
  const value = fieldValue(node, field)
  if (field.type === 'date' && typeof value === 'string' && value)
    return {
      id: field.id,
      label: field.label,
      start: value,
      end: value,
      kind: 'date',
    }
  if (field.type === 'daterange' && isDateRange(value) && value.start && value.end)
    return { id: field.id, label: field.label, ...value, kind: 'range' }
  return undefined
}

/**
 * The timelines of an idea: its date / period fields grouped by timeline name (a field without
 * one gets its own), each drawn with the rest of that timeline behind.
 */
export function IdeaTimelines({
  node,
  template,
  accent,
  size,
  onlyVisibleOnNode = false,
  className,
}: {
  node: IdeaNode
  template: NodeTemplate | undefined
  accent: string
  size?: 'sm' | 'lg'
  /** Only the fields shown on the canvas (the node itself). */
  onlyVisibleOnNode?: boolean
  className?: string
}) {
  const { timelines } = useMapActions()
  const groups = new Map<string, { name: string; focus: FocusEntry[] }>()
  for (const field of template?.fields ?? []) {
    if (!isTimelineField(field) || (onlyVisibleOnNode && field.showOnNode === false)) continue
    const entry = focusEntry(node, field)
    if (!entry) continue
    const key = timelineKey(field.timelineName) || `field:${field.id}`
    const group = groups.get(key) ?? {
      name: field.timelineName?.trim() || field.label,
      focus: [],
    }
    group.focus.push(entry)
    groups.set(key, group)
  }
  return [...groups].map(([key, group]) => (
    <Timeline
      key={key}
      name={group.name}
      focus={group.focus}
      others={key.startsWith('field:') ? [] : (timelines.get(key) ?? []).filter((e) => e.nodeId !== node.id)}
      accent={accent}
      size={size}
      className={className}
    />
  ))
}
