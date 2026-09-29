import { CalendarDays, X } from 'lucide-react'
import { useState } from 'react'
import { fr } from 'react-day-picker/locale'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDate, formatRange, parseIsoDate, toIsoDate } from '@/db/fields'
import type { DateRangeValue } from '@/db/types'
import { cn } from '@/lib/utils'

// Year dropdowns span a wide range: timelines can be historical.
const START_MONTH = new Date(1800, 0)
const END_MONTH = new Date(2100, 11)
const FORMATTERS = { formatMonthDropdown: (date: Date) => date.toLocaleString('fr-FR', { month: 'short' }) }

interface DatePickerProps {
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  id?: string
}

/** A pill showing the date; opens a calendar (month / year dropdowns for quick jumps). */
export function DatePicker({ value, onChange, disabled, placeholder = 'Choisir une date', className, id }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = parseIsoDate(value)
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} variant="outline" disabled={disabled} className={cn('justify-start font-normal', !value && 'text-muted-foreground')}>
            <CalendarDays className="opacity-60" />
            {value ? formatDate(value) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            locale={fr}
            captionLayout="dropdown"
            formatters={FORMATTERS}
            startMonth={START_MONTH}
            endMonth={END_MONTH}
            defaultMonth={selected}
            selected={selected}
            onSelect={(date) => {
              onChange(date ? toIsoDate(date) : null)
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      {value && !disabled && (
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="Effacer la date" onClick={() => onChange(null)}>
          <X />
        </Button>
      )}
    </div>
  )
}

interface DateRangePickerProps {
  value: DateRangeValue | null
  onChange: (value: DateRangeValue | null) => void
  disabled?: boolean
  className?: string
  id?: string
}

/** Same for a period: pick the start then the end (two months side by side on wide screens). */
export function DateRangePicker({ value, onChange, disabled, className, id }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<{ from?: Date; to?: Date }>()
  const committed = value ? { from: parseIsoDate(value.start), to: parseIsoDate(value.end) } : undefined
  const selected = draft ?? committed
  const wide = typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          setDraft(undefined)
        }}
      >
        <PopoverTrigger asChild>
          <Button id={id} variant="outline" disabled={disabled} className={cn('justify-start font-normal', !value && 'text-muted-foreground')}>
            <CalendarDays className="opacity-60" />
            {value ? formatRange(value) : 'Choisir une période'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            locale={fr}
            captionLayout="dropdown"
            formatters={FORMATTERS}
            startMonth={START_MONTH}
            endMonth={END_MONTH}
            numberOfMonths={wide ? 2 : 1}
            defaultMonth={selected?.from}
            selected={selected?.from ? { from: selected.from, to: selected.to } : undefined}
            onSelect={(_, day) => {
              // First click starts a new period; the second one ends it and closes the calendar.
              if (!draft) {
                setDraft({ from: day, to: undefined })
                return
              }
              const from = draft.from ?? day
              const [start, end] = from <= day ? [from, day] : [day, from]
              onChange({ start: toIsoDate(start), end: toIsoDate(end) })
              setDraft(undefined)
              setOpen(false)
            }}
          />
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            {draft ? 'Choisis la date de fin.' : 'Choisis la date de début.'}
          </p>
        </PopoverContent>
      </Popover>
      {value && !disabled && (
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="Effacer la période" onClick={() => onChange(null)}>
          <X />
        </Button>
      )}
    </div>
  )
}
