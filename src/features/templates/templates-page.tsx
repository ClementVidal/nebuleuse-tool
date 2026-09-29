import { Link, Navigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useState } from 'react'
import { ColorPicker, EnumPicker, StrokeWidthPicker } from '@/components/style-pickers'
import { ThemeToggle } from '@/components/theme-toggle'
import { AccountButton } from '@/features/shell/account-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addDefaultLinkTemplates, createLinkTemplate, createTemplate, countTemplateUsage, deleteTemplate, updateTemplate } from '@/db/actions'
import { useLinkTemplates, useProject, useTemplates } from '@/db/hooks'
import { colorCss, COLORS } from '@/db/palette'
import type { NodeStyle, NodeTemplate, TemplateField } from '@/db/types'
import { nodeBoxClass, nodeBoxStyle, templateStyle } from '@/features/map/node-style'
import { FieldEditor } from './field-editor'
import { LinkTemplateEditor } from './link-template-editor'
import { cn } from '@/lib/utils'


export function TemplatesPage({ projectId }: { projectId: string }) {
  const project = useProject(projectId)
  const templates = useTemplates(projectId)
  const linkTemplates = useLinkTemplates(projectId)
  const [chosenId, setSelectedId] = useState<string>()
  const selectedId =
    templates?.some((t) => t.id === chosenId) || linkTemplates?.some((t) => t.id === chosenId) ? chosenId : templates?.[0]?.id

  if (project === null) return <Navigate to="/" />
  if (!project || !templates || !linkTemplates) return null
  const selected = templates.find((t) => t.id === selectedId)
  const selectedLink = linkTemplates.find((t) => t.id === selectedId)

  return (
    <div className="min-h-dvh">
      <header className="flex h-12 items-center gap-2 border-b px-2">
        <Button variant="ghost" size="sm" asChild className="min-w-0 max-w-[60%]">
          <Link to="/projects/$projectId" params={{ projectId }}>
            <ArrowLeft /> <span className="truncate">{project.name}</span>
          </Link>
        </Button>
        <span className="flex-1 truncate text-sm font-medium">Templates</span>
        <AccountButton />
        <ThemeToggle />
      </header>

      <main className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 md:grid-cols-[14rem_minmax(0,1fr)]">
        <nav className="flex flex-wrap content-start gap-1 md:grid">
          <div className="w-full px-3 pt-1 pb-0.5 text-xs font-medium text-muted-foreground">Idées</div>
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
              <span className="size-3 rounded-full border" style={{ background: colorCss(t.style.color) }} />
              {t.name}
            </button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="md:mt-2"
            onClick={async () => setSelectedId((await createTemplate(projectId, 'Nouveau template')).id)}
          >
            <Plus /> Ajouter un template
          </Button>

          <div className="w-full px-3 pt-5 pb-0.5 text-xs font-medium text-muted-foreground">Liens</div>
          {linkTemplates.length === 0 && (
            <div className="grid w-full gap-2 px-3 pb-1 text-xs text-muted-foreground">
              <p>Aucun type de lien : les liens ont chacun leur style.</p>
              <Button variant="secondary" size="sm" className="justify-self-start" onClick={() => void addDefaultLinkTemplates(projectId)}>
                Ajouter les types par défaut
              </Button>
            </div>
          )}
          {linkTemplates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent',
                t.id === selectedId && 'bg-accent font-medium',
              )}
            >
              <span className="h-0.5 w-3 rounded-full" style={{ background: colorCss(t.style.color) }} />
              {t.name}
            </button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="md:mt-2"
            onClick={async () => setSelectedId((await createLinkTemplate(projectId, 'Nouveau lien')).id)}
          >
            <Plus /> Ajouter un type de lien
          </Button>
        </nav>

        {selected && <TemplateEditor key={selected.id} template={selected} timelineNames={timelineNames(templates)} />}
        {selectedLink && <LinkTemplateEditor key={selectedLink.id} template={selectedLink} />}
      </main>
    </div>
  )
}

/** Timeline names used by the project's fields, suggested when naming a timeline. */
function timelineNames(templates: NodeTemplate[]): string[] {
  const names = new Map<string, string>()
  for (const t of templates) for (const f of t.fields) if (f.timelineName?.trim()) names.set(f.timelineName.trim().toLowerCase(), f.timelineName.trim())
  return [...names.values()].sort((a, b) => a.localeCompare(b, 'fr'))
}

function TemplateEditor({ template, timelineNames }: { template: NodeTemplate; timelineNames: string[] }) {
  const usage = useLiveQuery(() => countTemplateUsage(template.id), [template.id])
  const [addedFieldId, setAddedFieldId] = useState<string>()
  const style = templateStyle(template)
  const setStyle = (changes: Partial<NodeStyle>) => updateTemplate(template.id, { style: { ...style, ...changes } })
  const setFields = (fields: TemplateField[], coalesceKey?: string) => updateTemplate(template.id, { fields }, { coalesceKey })
  const updateField = (id: string, changes: Partial<TemplateField>, coalesceKey?: string) =>
    setFields(template.fields.map((f) => (f.id === id ? { ...f, ...changes } : f)), coalesceKey)
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
            <Input id="template-name" defaultValue={template.name} onChange={(e) => updateTemplate(template.id, { name: e.target.value }, { coalesceKey: `template-name:${template.id}` })} />
          </div>
          <div className="grid gap-2">
            <Label>Couleur</Label>
            <p className="-mt-1 text-xs text-muted-foreground">Couleur d’accent des idées de ce template : liseré à gauche et pastille du nom.</p>
            <ColorPicker colors={COLORS} value={style.color} onChange={(color) => setStyle({ color })} />
          </div>
          <div className="grid gap-2">
            <Label>Forme</Label>
            <EnumPicker
              value={style.shape}
              onChange={(shape) => setStyle({ shape })}
              options={[
                { value: 'card', label: 'Carte' },
                { value: 'sticky', label: 'Post-it' },
              ]}
            />
          </div>
          <div className="flex flex-wrap gap-6">
            <div className="grid gap-2">
              <Label>Liseré</Label>
              <StrokeWidthPicker value={style.strokeWidth} onChange={(strokeWidth) => setStyle({ strokeWidth })} />
            </div>
            <div className="grid gap-2">
              <Label>Contour</Label>
              <EnumPicker
                value={style.dashed ? 'dashed' : 'solid'}
                onChange={(v) => setStyle({ dashed: v === 'dashed' })}
                options={[
                  { value: 'solid', label: 'Plein' },
                  { value: 'dashed', label: 'Pointillé' },
                ]}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Aperçu</Label>
            <div
              className={cn('relative flex h-24 w-56 flex-col gap-1 rounded-lg px-3 py-2.5 text-sm shadow-sm', nodeBoxClass(style))}
              style={nodeBoxStyle(style)}
            >
              <span className="font-medium">Une idée</span>
              <span className="mt-auto text-[11px] uppercase tracking-wide opacity-50">{template.name}</span>
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
            <FieldEditor
              key={field.id}
              field={field}
              index={index}
              count={template.fields.length}
              timelineListId="timeline-names"
              defaultOpen={field.id === addedFieldId}
              onChange={(changes, coalesceKey) => updateField(field.id, changes, coalesceKey)}
              onMove={(delta) => moveField(index, delta)}
              onDelete={() => setFields(template.fields.filter((f) => f.id !== field.id))}
            />
          ))}
          <datalist id="timeline-names">
            {timelineNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() => {
              const id = nanoid()
              setAddedFieldId(id)
              void setFields([...template.fields, { id, label: 'Nouveau champ', type: 'richtext' }])
            }}
          >
            <Plus /> Ajouter un champ
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          className="text-destructive"
          disabled={usage === undefined || usage > 0}
          onClick={() => void deleteTemplate(template.id)}
        >
          <Trash2 /> Supprimer le template
        </Button>
        {usage !== undefined && usage > 0 && (
          <Badge variant="secondary" className="whitespace-normal">
            Utilisé par {usage} idée{usage > 1 ? 's' : ''} : suppression impossible
          </Badge>
        )}
      </div>
    </div>
  )
}
