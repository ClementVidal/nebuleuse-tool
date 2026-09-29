import { ArrowDown, ArrowUp, ChevronRight, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { DatePicker, DateRangePicker } from '@/components/date-picker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { FIELD_TYPES, isDateRange, isTimelineField } from '@/db/fields'
import type { FieldType, TemplateField } from '@/db/types'
import { cn } from '@/lib/utils'

interface FieldEditorProps {
  field: TemplateField
  index: number
  count: number
  /** Timeline names already used in the project, suggested when typing one. */
  timelineListId: string
  defaultOpen?: boolean
  onChange: (changes: Partial<TemplateField>, coalesceKey?: string) => void
  onMove: (delta: number) => void
  onDelete: () => void
}

/** One field of a template: a compact header (name, type, order) that unfolds its options. */
export function FieldEditor({ field, index, count, timelineListId, defaultOpen = false, onChange, onMove, onDelete }: FieldEditorProps) {
  const [open, setOpen] = useState(defaultOpen)
  const visible = field.showOnNode !== false
  const timeline = isTimelineField(field)

  return (
    <div className="rounded-xl border">
      <div className="flex flex-wrap items-center gap-2 p-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label={open ? 'Replier les options' : 'Déplier les options'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <ChevronRight className={cn('transition-transform', open && 'rotate-90')} />
        </Button>
        <Input
          className="min-w-0 flex-1 basis-40"
          aria-label="Nom du champ"
          defaultValue={field.label}
          onChange={(e) => onChange({ label: e.target.value }, `field-label:${field.id}`)}
        />
        <Select
          value={field.type}
          // Another type means another kind of value: the default no longer applies.
          onValueChange={(type) => onChange({ type: type as FieldType, defaultValue: undefined })}
        >
          <SelectTrigger className="w-32" aria-label="Type du champ">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex">
          <Button variant="ghost" size="icon" className="size-8" aria-label="Monter" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" aria-label="Descendre" disabled={index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown />
          </Button>
          <Button variant="ghost" size="icon" className="size-8 text-destructive" aria-label="Supprimer le champ" onClick={onDelete}>
            <Trash2 />
          </Button>
        </div>
      </div>

      {/* Summary of the options while folded. */}
      {/* Timeline name: always visible for dates and periods, it's what groups them on a timeline. */}
      {timeline && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-3 sm:pl-12">
          <label htmlFor={`timeline-${field.id}`} className="text-sm font-medium">
            Frise
          </label>
          <Input
            id={`timeline-${field.id}`}
            list={timelineListId}
            className="h-8 max-w-64 flex-1 basis-40"
            placeholder="ex. Histoire, Projet, Vie"
            defaultValue={field.timelineName ?? ''}
            onChange={(e) => onChange({ timelineName: e.target.value || undefined }, `field-timeline:${field.id}`)}
          />
          <p className="basis-full text-xs text-muted-foreground">
            Les dates et périodes des idées qui partagent ce nom de frise s’affichent ensemble.
          </p>
        </div>
      )}

      {!open && (!visible || field.readOnly || field.description) && (
        <div className="flex flex-wrap gap-1.5 px-12 pb-2.5">
          {!visible && <Badge variant="secondary">Masqué sur l’idée</Badge>}
          {field.readOnly && <Badge variant="secondary">Lecture seule</Badge>}
          {field.description && <span className="truncate text-xs text-muted-foreground">{field.description}</span>}
        </div>
      )}

      {open && (
        <div className="grid gap-4 border-t px-3 py-4 sm:px-12">
          <div className="grid gap-1.5">
            <Label htmlFor={`desc-${field.id}`}>Description</Label>
            <Input
              id={`desc-${field.id}`}
              placeholder="Aide affichée à la saisie"
              defaultValue={field.description ?? ''}
              onChange={(e) => onChange({ description: e.target.value || undefined }, `field-desc:${field.id}`)}
            />
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <SwitchRow
              id={`visible-${field.id}`}
              label="Visible sur l’idée"
              hint="Affiché sur la carte, pas seulement dans l’éditeur."
              checked={visible}
              onChange={(v) => onChange({ showOnNode: v })}
            />
            <SwitchRow
              id={`ro-${field.id}`}
              label="Lecture seule"
              hint="Toutes les idées ont la valeur ci-dessous."
              checked={!!field.readOnly}
              onChange={(v) => onChange({ readOnly: v || undefined })}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`default-${field.id}`}>{field.readOnly ? 'Valeur' : 'Valeur par défaut'}</Label>
            <DefaultValueInput field={field} id={`default-${field.id}`} onChange={onChange} />
          </div>

        </div>
      )}
    </div>
  )
}

function SwitchRow({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex max-w-64 items-start gap-2.5">
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <label htmlFor={id} className="grid gap-0.5 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </label>
    </div>
  )
}

function DefaultValueInput({ field, id, onChange }: { field: TemplateField; id: string; onChange: FieldEditorProps['onChange'] }) {
  const value = field.defaultValue
  switch (field.type) {
    case 'richtext':
      return (
        <Textarea
          id={id}
          rows={3}
          placeholder="Texte de départ (Markdown)"
          defaultValue={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange({ defaultValue: e.target.value || undefined }, `field-default:${field.id}`)}
        />
      )
    case 'number':
      return (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          className="w-32"
          placeholder="—"
          defaultValue={typeof value === 'number' ? String(value) : ''}
          onChange={(e) => onChange({ defaultValue: e.target.value === '' ? undefined : Number(e.target.value) }, `field-default:${field.id}`)}
        />
      )
    case 'date':
      return <DatePicker id={id} value={typeof value === 'string' ? value : null} onChange={(v) => onChange({ defaultValue: v ?? undefined })} placeholder="Aucune" />
    case 'daterange':
      return <DateRangePicker id={id} value={isDateRange(value) ? value : null} onChange={(v) => onChange({ defaultValue: v ?? undefined })} />
  }
}
