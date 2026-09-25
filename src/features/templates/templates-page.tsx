import { Link, Navigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useState } from 'react'
import { ColorPicker, EnumPicker, StrokeWidthPicker } from '@/components/style-pickers'
import { ThemeToggle } from '@/components/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createTemplate, countTemplateUsage, deleteTemplate, updateTemplate } from '@/db/actions'
import { useProject, useTemplates } from '@/db/hooks'
import { BACKGROUND_COLORS, colorCss, STROKE_COLORS } from '@/db/palette'
import type { FieldType, NodeStyle, NodeTemplate, TemplateField } from '@/db/types'
import { FILL_STYLE_OPTIONS } from '@/features/map/node-style'
import { cn } from '@/lib/utils'

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'richtext', label: 'Texte riche' },
  { value: 'date', label: 'Date' },
  { value: 'number', label: 'Nombre' },
]

export function TemplatesPage({ projectId }: { projectId: string }) {
  const project = useProject(projectId)
  const templates = useTemplates(projectId)
  const [chosenId, setSelectedId] = useState<string>()
  const selectedId = templates?.some((t) => t.id === chosenId) ? chosenId : templates?.[0]?.id

  if (project === null) return <Navigate to="/" />
  if (!project || !templates) return null
  const selected = templates.find((t) => t.id === selectedId)

  return (
    <div className="min-h-dvh">
      <header className="flex h-12 items-center gap-2 border-b px-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/projects/$projectId" params={{ projectId }}>
            <ArrowLeft /> {project.name}
          </Link>
        </Button>
        <span className="flex-1 text-sm font-medium">Templates</span>
        <ThemeToggle />
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 md:grid-cols-[14rem_1fr]">
        <nav className="grid content-start gap-1">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent',
                t.id === selectedId && 'bg-accent font-medium',
              )}
            >
              <span className="size-3 rounded-full border" style={{ background: colorCss(t.style.stroke) }} />
              {t.name}
            </button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={async () => setSelectedId((await createTemplate(projectId, 'Nouveau template')).id)}
          >
            <Plus /> Ajouter un template
          </Button>
        </nav>

        {selected && <TemplateEditor key={selected.id} template={selected} />}
      </main>
    </div>
  )
}

function TemplateEditor({ template }: { template: NodeTemplate }) {
  const usage = useLiveQuery(() => countTemplateUsage(template.id), [template.id])
  const setStyle = (changes: Partial<NodeStyle>) => updateTemplate(template.id, { style: { ...template.style, ...changes } })
  const setFields = (fields: TemplateField[]) => updateTemplate(template.id, { fields })
  const updateField = (id: string, changes: Partial<TemplateField>) =>
    setFields(template.fields.map((f) => (f.id === id ? { ...f, ...changes } : f)))
  const moveField = (index: number, delta: number) => {
    const fields = [...template.fields]
    const [field] = fields.splice(index, 1)
    fields.splice(index + delta, 0, field)
    void setFields(fields)
  }

  return (
    <div className="grid content-start gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Général</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="template-name">Nom</Label>
            <Input id="template-name" defaultValue={template.name} onChange={(e) => updateTemplate(template.id, { name: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>Couleur du trait</Label>
            <ColorPicker colors={STROKE_COLORS} value={template.style.stroke} onChange={(stroke) => setStyle({ stroke })} />
          </div>
          <div className="grid gap-2">
            <Label>Couleur de fond</Label>
            <ColorPicker colors={BACKGROUND_COLORS} value={template.style.background} onChange={(background) => setStyle({ background })} />
          </div>
          <div className="flex flex-wrap gap-6">
            <div className="grid gap-2">
              <Label>Bordure</Label>
              <StrokeWidthPicker value={template.style.strokeWidth} onChange={(strokeWidth) => setStyle({ strokeWidth })} />
            </div>
            <div className="grid gap-2">
              <Label>Remplissage</Label>
              <EnumPicker value={template.style.fillStyle} onChange={(fillStyle) => setStyle({ fillStyle })} options={FILL_STYLE_OPTIONS} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Champs</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm text-muted-foreground">Chaque idée a toujours un titre. Ajoute ici les champs propres à ce template.</p>
          {template.fields.map((field, index) => (
            <div key={field.id} className="flex flex-wrap items-center gap-2">
              <Input
                className="min-w-40 flex-1"
                aria-label="Nom du champ"
                defaultValue={field.label}
                onChange={(e) => updateField(field.id, { label: e.target.value })}
              />
              <Select value={field.type} onValueChange={(type) => updateField(field.id, { type: type as FieldType })}>
                <SelectTrigger className="w-36" aria-label="Type du champ">
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
                <Button variant="ghost" size="icon" aria-label="Monter" disabled={index === 0} onClick={() => moveField(index, -1)}>
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Descendre"
                  disabled={index === template.fields.length - 1}
                  onClick={() => moveField(index, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Supprimer le champ"
                  className="text-destructive"
                  onClick={() => setFields(template.fields.filter((f) => f.id !== field.id))}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() => setFields([...template.fields, { id: nanoid(), label: 'Nouveau champ', type: 'richtext' }])}
          >
            <Plus /> Ajouter un champ
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          className="text-destructive"
          disabled={usage === undefined || usage > 0}
          onClick={() => void deleteTemplate(template.id)}
        >
          <Trash2 /> Supprimer le template
        </Button>
        {usage !== undefined && usage > 0 && (
          <Badge variant="secondary">
            Utilisé par {usage} idée{usage > 1 ? 's' : ''} : suppression impossible
          </Badge>
        )}
      </div>
    </div>
  )
}
