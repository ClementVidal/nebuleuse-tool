import { Bookmark, BookmarkCheck } from 'lucide-react'
import { ColorPicker, EnumPicker, StrokeWidthPicker } from '@/components/style-pickers'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { setBookmarked, updateNode, updateTemplate } from '@/db/actions'
import { colorCss, COLORS } from '@/db/palette'
import type { IdeaNode, NodeStyle, NodeTemplate } from '@/db/types'
import { cn } from '@/lib/utils'
import { nodeBoxClass, nodeBoxStyle, templateStyle } from './node-style'

interface NodeSettingsSheetProps {
  node: IdeaNode | undefined
  templates: NodeTemplate[]
  onClose: () => void
}

/**
 * Settings of an idea — everything but its title and content (those live in the editor):
 * its template, the template's look, and the bookmark.
 */
export function NodeSettingsSheet({ node, templates, onClose }: NodeSettingsSheetProps) {
  return (
    <Sheet open={node !== undefined} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        {node && <Settings key={node.id} node={node} templates={templates} />}
      </SheetContent>
    </Sheet>
  )
}

function Settings({ node, templates }: { node: IdeaNode; templates: NodeTemplate[] }) {
  const template = templates.find((t) => t.id === node.templateId)
  const style = templateStyle(template)
  const setStyle = (changes: Partial<NodeStyle>) => template && updateTemplate(template.id, { style: { ...style, ...changes } })

  return (
    <>
      <SheetHeader>
        <SheetTitle className="truncate pr-6">Réglages · {node.title || 'Sans titre'}</SheetTitle>
        <SheetDescription>Le titre et le texte se modifient dans l’éditeur (double-clic sur l’idée).</SheetDescription>
      </SheetHeader>

      <div className="grid content-start gap-6 overflow-y-auto px-4 pb-6">
        <div className="grid gap-2">
          <Label>Template</Label>
          <Select value={node.templateId} onValueChange={(templateId) => updateNode(node.id, { templateId })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="size-2.5 rounded-full" style={{ background: colorCss(templateStyle(t).color) }} />
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {template && (
          <div className="grid gap-4 rounded-lg border p-4">
            <div>
              <div className="text-sm font-medium">Apparence</div>
              <p className="text-xs text-muted-foreground">
                Partagée par toutes les idées « {template.name} » : la modifier ici modifie le template.
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Couleur</Label>
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
                <Label>Bordure</Label>
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
            <div
              className={cn('relative flex h-20 flex-col rounded-lg px-3 py-2.5 text-sm shadow-sm', nodeBoxClass(style))}
              style={nodeBoxStyle(style)}
            >
              <span className="font-semibold">{node.title || 'Sans titre'}</span>
              <span className="mt-auto text-[11px] tracking-wide uppercase opacity-50">{template.name}</span>
            </div>
          </div>
        )}

        <Separator />

        <Button
          variant={node.bookmarkedAt ? 'secondary' : 'outline'}
          className="justify-self-start"
          onClick={() => void setBookmarked(node.id, !node.bookmarkedAt)}
        >
          {node.bookmarkedAt ? <BookmarkCheck /> : <Bookmark />}
          {node.bookmarkedAt ? 'Dans les favoris' : 'Ajouter aux favoris'}
        </Button>
      </div>
    </>
  )
}
