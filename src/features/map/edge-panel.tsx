import { ArrowLeft, ArrowLeftRight, ArrowRight, Minus, Spline, Trash2 } from 'lucide-react'
import { ColorPicker, EnumPicker, StrokeWidthPicker } from '@/components/style-pickers'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deleteEdges, updateEdge } from '@/db/actions'
import { COLORS } from '@/db/palette'
import type { ArrowMode, EdgeDash, EdgePathKind, IdeaEdge } from '@/db/types'

const ARROW_OPTIONS: { value: ArrowMode; label: string; icon: React.ReactNode }[] = [
  { value: 'none', label: 'Aucune flèche', icon: <Minus /> },
  { value: 'start', label: 'Flèche au début', icon: <ArrowLeft /> },
  { value: 'end', label: 'Flèche à la fin', icon: <ArrowRight /> },
  { value: 'both', label: 'Flèches aux deux extrémités', icon: <ArrowLeftRight /> },
]

const PATH_OPTIONS: { value: EdgePathKind; label: string; icon: React.ReactNode }[] = [
  { value: 'straight', label: 'Droit', icon: <Minus className="-rotate-45" /> },
  { value: 'curved', label: 'Courbe', icon: <Spline /> },
]

const DASH_OPTIONS: { value: EdgeDash; label: string; icon: React.ReactNode }[] = [
  { value: 'solid', label: 'Plein', icon: <span className="block h-0.5 w-5 bg-current" /> },
  { value: 'dashed', label: 'Tirets', icon: <span className="block h-0.5 w-5 bg-[repeating-linear-gradient(90deg,currentColor_0_5px,transparent_5px_8px)]" /> },
  { value: 'dotted', label: 'Pointillés', icon: <span className="block h-0.5 w-5 bg-[repeating-linear-gradient(90deg,currentColor_0_2px,transparent_2px_5px)]" /> },
]

/** Floating panel to style the selected edge. */
export function EdgePanel({ edge }: { edge: IdeaEdge }) {
  const set = (changes: Partial<IdeaEdge>) => updateEdge(edge.id, changes)
  return (
    <Card className="w-72 gap-0 py-3 shadow-lg">
      <CardContent className="grid gap-3 px-3">
        <div className="grid gap-1.5">
          <Label htmlFor="edge-label">Label</Label>
          <Input
            key={edge.id}
            id="edge-label"
            placeholder="Relation…"
            defaultValue={edge.label}
            onChange={(e) => updateEdge(edge.id, { label: e.target.value }, { coalesceKey: `edge-label:${edge.id}` })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Flèches</Label>
          <EnumPicker value={edge.arrows} onChange={(arrows) => set({ arrows })} options={ARROW_OPTIONS} />
        </div>
        <div className="grid gap-1.5">
          <Label>Couleur</Label>
          <ColorPicker colors={COLORS} value={edge.color} onChange={(color) => set({ color })} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-3">
          <div className="grid gap-1.5">
            <Label>Épaisseur</Label>
            <StrokeWidthPicker value={edge.strokeWidth} onChange={(strokeWidth) => set({ strokeWidth })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Tracé</Label>
            <EnumPicker value={edge.path} onChange={(path) => set({ path })} options={PATH_OPTIONS} />
          </div>
          <div className="grid gap-1.5">
            <Label>Trait</Label>
            <EnumPicker value={edge.dash} onChange={(dash) => set({ dash })} options={DASH_OPTIONS} />
          </div>
        </div>
        <Button variant="ghost" size="sm" className="justify-self-start text-destructive" onClick={() => deleteEdges([edge.id])}>
          <Trash2 /> Supprimer le lien
        </Button>
      </CardContent>
    </Card>
  )
}
