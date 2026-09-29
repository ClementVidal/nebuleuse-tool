import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2 } from 'lucide-react'
import { ColorPicker, EnumPicker, StrokeWidthPicker } from '@/components/style-pickers'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { countLinkTemplateUsage, deleteLinkTemplate, updateLinkTemplate } from '@/db/actions'
import { colorCss, COLORS, STROKE_WIDTHS } from '@/db/palette'
import type { LinkStyle, LinkTemplate } from '@/db/types'
import { ARROW_OPTIONS, DASH_OPTIONS, PATH_OPTIONS } from '@/features/map/edge-panel'

/** A link template: name, label given to its links, and the look they share. */
export function LinkTemplateEditor({ template }: { template: LinkTemplate }) {
  const usage = useLiveQuery(() => countLinkTemplateUsage(template.id), [template.id])
  const style = template.style
  const setStyle = (changes: Partial<LinkStyle>) => updateLinkTemplate(template.id, { style: { ...style, ...changes } })

  return (
    <div className="grid content-start gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Type de lien</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <p className="-mt-2 text-sm text-muted-foreground">
            Les liens de ce type partagent son style : le modifier ici modifie tous ces liens. Le premier type de la liste est
            donné aux nouveaux liens.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="link-template-name">Nom</Label>
              <Input
                id="link-template-name"
                defaultValue={template.name}
                onChange={(e) => updateLinkTemplate(template.id, { name: e.target.value }, { coalesceKey: `link-template-name:${template.id}` })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="link-template-label">Nom donné aux liens</Label>
              <Input
                id="link-template-label"
                placeholder="cause, s’oppose à…"
                defaultValue={template.label}
                onChange={(e) => updateLinkTemplate(template.id, { label: e.target.value }, { coalesceKey: `link-template-label:${template.id}` })}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Flèches</Label>
            <EnumPicker value={style.arrows} onChange={(arrows) => setStyle({ arrows })} options={ARROW_OPTIONS} />
          </div>
          <div className="grid gap-2">
            <Label>Couleur</Label>
            <ColorPicker colors={COLORS} value={style.color} onChange={(color) => setStyle({ color })} />
          </div>
          <div className="flex flex-wrap gap-6">
            <div className="grid gap-2">
              <Label>Épaisseur</Label>
              <StrokeWidthPicker value={style.strokeWidth} onChange={(strokeWidth) => setStyle({ strokeWidth })} />
            </div>
            <div className="grid gap-2">
              <Label>Tracé</Label>
              <EnumPicker value={style.path} onChange={(path) => setStyle({ path })} options={PATH_OPTIONS} />
            </div>
            <div className="grid gap-2">
              <Label>Trait</Label>
              <EnumPicker value={style.dash} onChange={(dash) => setStyle({ dash })} options={DASH_OPTIONS} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Aperçu</Label>
            <LinkPreview style={style} label={template.label} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" className="text-destructive" onClick={() => void deleteLinkTemplate(template.id)}>
          <Trash2 /> Supprimer le type de lien
        </Button>
        {usage !== undefined && usage > 0 && (
          <span className="text-xs text-muted-foreground">
            Utilisé par {usage} lien{usage > 1 ? 's' : ''}, qui garderont leur style actuel.
          </span>
        )}
      </div>
    </div>
  )
}

const DASHES = { solid: undefined, dashed: (w: number) => `${w * 4} ${w * 3}`, dotted: (w: number) => `0 ${w * 2.5}` }

/** Two idea boxes joined by a link drawn with this style. */
function LinkPreview({ style, label }: { style: LinkStyle; label: string }) {
  const w = STROKE_WIDTHS[style.strokeWidth].px
  const color = `color-mix(in srgb, ${colorCss(style.color)} 78%, var(--canvas))`
  const head = 7 + w * 2.5
  const start = style.arrows === 'start' || style.arrows === 'both'
  const end = style.arrows === 'end' || style.arrows === 'both'
  const d = style.path === 'curved' ? 'M 84 58 C 150 10, 210 10, 276 38' : 'M 84 52 L 276 32'
  return (
    <svg viewBox="0 0 360 90" className="h-24 w-full max-w-md rounded-lg border bg-[var(--canvas)]" role="img" aria-label="Aperçu du lien">
      <defs>
        <marker id="preview-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth={head / w} markerHeight={head / w} orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
        </marker>
      </defs>
      <rect x="12" y="40" width="72" height="36" rx="6" fill="var(--card)" stroke="var(--node-border)" />
      <rect x="276" y="14" width="72" height="36" rx="6" fill="var(--card)" stroke="var(--node-border)" />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={w}
        strokeLinecap="round"
        strokeDasharray={style.dash === 'solid' ? undefined : DASHES[style.dash](w)}
        markerStart={start ? 'url(#preview-head)' : undefined}
        markerEnd={end ? 'url(#preview-head)' : undefined}
      />
      {label && (
        <text x="180" y={style.path === 'curved' ? 13 : 30} textAnchor="middle" fontSize="12" fill="var(--foreground)" opacity="0.75">
          {label}
        </text>
      )}
    </svg>
  )
}
