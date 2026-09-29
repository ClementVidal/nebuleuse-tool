import { ArrowLeft, ArrowLeftRight, ArrowRight, Minus, Spline, Trash2 } from 'lucide-react'
import { ColorPicker, EnumPicker, StrokeWidthPicker } from '@/components/style-pickers'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { deleteEdges, linkStyleOf, setEdgeTemplate, updateEdge, updateLinkTemplate } from '@/db/actions'
import { colorCss, COLORS } from '@/db/palette'
import type { ArrowMode, EdgeDash, EdgePathKind, IdeaEdge, LinkStyle, LinkTemplate } from '@/db/types'

export const ARROW_OPTIONS: { value: ArrowMode; label: string; icon: React.ReactNode }[] = [
  { value: 'none', label: 'Aucune flèche', icon: <Minus /> },
  { value: 'start', label: 'Flèche au début', icon: <ArrowLeft /> },
  { value: 'end', label: 'Flèche à la fin', icon: <ArrowRight /> },
  { value: 'both', label: 'Flèches aux deux extrémités', icon: <ArrowLeftRight /> },
]

export const PATH_OPTIONS: { value: EdgePathKind; label: string; icon: React.ReactNode }[] = [
  { value: 'straight', label: 'Droit', icon: <Minus className="-rotate-45" /> },
  { value: 'curved', label: 'Courbe', icon: <Spline /> },
]

export const DASH_OPTIONS: { value: EdgeDash; label: string; icon: React.ReactNode }[] = [
  { value: 'solid', label: 'Plein', icon: <span className="block h-0.5 w-5 bg-current" /> },
  { value: 'dashed', label: 'Tirets', icon: <span className="block h-0.5 w-5 bg-[repeating-linear-gradient(90deg,currentColor_0_5px,transparent_5px_8px)]" /> },
  { value: 'dotted', label: 'Pointillés', icon: <span className="block h-0.5 w-5 bg-[repeating-linear-gradient(90deg,currentColor_0_2px,transparent_2px_5px)]" /> },
]

interface EdgePanelProps {
  edge: IdeaEdge
  sourceTitle: string | undefined
  targetTitle: string | undefined
  linkTemplates: Map<string, LinkTemplate>
  /** Focus and select the name right away (a link that was just drawn). */
  autoFocusLabel?: boolean
}

/** Floating panel to name and style the selected edge. */
const NO_TEMPLATE = '__none'

export function EdgePanel({ edge, sourceTitle, targetTitle, linkTemplates, autoFocusLabel }: EdgePanelProps) {
  const template = edge.templateId ? linkTemplates.get(edge.templateId) : undefined
  const style = linkStyleOf(edge, linkTemplates)
  // A typed link's look is its type's: changing it here changes every link of that type.
  const set = (changes: Partial<LinkStyle>) =>
    template ? updateLinkTemplate(template.id, { style: { ...template.style, ...changes } }) : updateEdge(edge.id, changes)
  // No keyboard popping up on phones: only focus with a mouse / trackpad.
  const focusLabel = autoFocusLabel && matchMedia('(pointer: fine)').matches
  return (
    <Card className="w-72 gap-0 py-3 shadow-lg">
      <CardContent className="grid gap-3 px-3">
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" title={`${sourceTitle ?? ''} → ${targetTitle ?? ''}`}>
          <span className="truncate font-medium text-foreground">{sourceTitle || 'Sans titre'}</span>
          <ArrowRight className="size-3.5 shrink-0" />
          <span className="truncate font-medium text-foreground">{targetTitle || 'Sans titre'}</span>
        </p>
        {linkTemplates.size > 0 && (
          <div className="grid gap-1.5">
            <Label htmlFor="edge-template">Type de lien</Label>
            <Select
              value={template?.id ?? NO_TEMPLATE}
              onValueChange={(id) => void setEdgeTemplate(edge, linkTemplates.get(id), template)}
            >
              <SelectTrigger id="edge-template" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...linkTemplates.values()].map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="h-0.5 w-4 rounded-full" style={{ background: colorCss(t.style.color) }} />
                    {t.name}
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem value={NO_TEMPLATE}>Sans type (style propre)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="edge-label">Nom du lien</Label>
          <Input
            id="edge-label"
            placeholder="lié à, cause, s’oppose à…"
            autoFocus={focusLabel}
            onFocus={(e) => focusLabel && e.currentTarget.select()}
            key={`${edge.id}:${edge.templateId ?? ''}`}
            defaultValue={edge.label}
            onChange={(e) => updateEdge(edge.id, { label: e.target.value }, { coalesceKey: `edge-label:${edge.id}` })}
          />
        </div>
        {template && (
          <p className="-mb-1 text-xs text-muted-foreground">Style partagé par tous les liens « {template.name} ».</p>
        )}
        <div className="grid gap-1.5">
          <Label>Flèches</Label>
          <EnumPicker value={style.arrows} onChange={(arrows) => set({ arrows })} options={ARROW_OPTIONS} />
        </div>
        <div className="grid gap-1.5">
          <Label>Couleur</Label>
          <ColorPicker colors={COLORS} value={style.color} onChange={(color) => set({ color })} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-3">
          <div className="grid gap-1.5">
            <Label>Épaisseur</Label>
            <StrokeWidthPicker value={style.strokeWidth} onChange={(strokeWidth) => set({ strokeWidth })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Tracé</Label>
            <EnumPicker value={style.path} onChange={(path) => set({ path })} options={PATH_OPTIONS} />
          </div>
          <div className="grid gap-1.5">
            <Label>Trait</Label>
            <EnumPicker value={style.dash} onChange={(dash) => set({ dash })} options={DASH_OPTIONS} />
          </div>
        </div>
        <Button variant="ghost" size="sm" className="justify-self-start text-destructive" onClick={() => deleteEdges([edge.id])}>
          <Trash2 /> Supprimer le lien
        </Button>
      </CardContent>
    </Card>
  )
}
