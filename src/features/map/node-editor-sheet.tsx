import { CornerDownRight, RotateCcw, Trash2 } from 'lucide-react'
import { ColorPicker, StrokeWidthPicker } from '@/components/style-pickers'
import { RichTextEditor } from '@/components/rich-text-editor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { deleteNodes, updateNode, updateNodeValue } from '@/db/actions'
import { BACKGROUND_COLORS, STROKE_COLORS } from '@/db/palette'
import type { IdeaNode, NodeStyle, NodeTemplate, TemplateField } from '@/db/types'
import { resolveNodeStyle } from './node-style'

interface NodeEditorSheetProps {
  node: IdeaNode | undefined
  templates: NodeTemplate[]
  onClose: () => void
  onOpenNode: (nodeId: string) => void
}

export function NodeEditorSheet({ node, templates, onClose, onOpenNode }: NodeEditorSheetProps) {
  return (
    <Sheet open={node !== undefined} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
        {node && <NodeEditor key={node.id} node={node} templates={templates} onClose={onClose} onOpenNode={onOpenNode} />}
      </SheetContent>
    </Sheet>
  )
}

function NodeEditor({ node, templates, onClose, onOpenNode }: Required<NodeEditorSheetProps> & { node: IdeaNode }) {
  const template = templates.find((t) => t.id === node.templateId)
  const style = resolveNodeStyle(node, template)
  const setStyle = (changes: Partial<NodeStyle>) => updateNode(node.id, { style: { ...node.style, ...changes } })

  return (
    <>
      <SheetHeader>
        <SheetTitle>Éditer l'idée</SheetTitle>
        <SheetDescription>Les modifications sont enregistrées automatiquement.</SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
        <div className="grid gap-2">
          <Label htmlFor="node-title">Titre</Label>
          <Input
            id="node-title"
            autoFocus
            defaultValue={node.title}
            onChange={(e) => updateNode(node.id, { title: e.target.value }, { coalesceKey: `title:${node.id}` })}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => e.key === 'Enter' && onClose()}
          />
        </div>

        <div className="grid gap-2">
          <Label>Template</Label>
          <Select value={node.templateId} onValueChange={(templateId) => updateNode(node.id, { templateId })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {template?.fields.map((field) => (
          <FieldEditor key={field.id} node={node} field={field} />
        ))}

        <Separator />

        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Style</span>
            {node.style && Object.keys(node.style).length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => updateNode(node.id, { style: undefined })}>
                <RotateCcw /> Style du template
              </Button>
            )}
          </div>
          <div className="grid gap-2">
            <Label>Trait</Label>
            <ColorPicker colors={STROKE_COLORS} value={style.stroke} onChange={(stroke) => setStyle({ stroke })} />
          </div>
          <div className="grid gap-2">
            <Label>Fond</Label>
            <ColorPicker colors={BACKGROUND_COLORS} value={style.background} onChange={(background) => setStyle({ background })} />
          </div>
          <div className="grid gap-2">
            <Label>Bordure</Label>
            <StrokeWidthPicker value={style.strokeWidth} onChange={(strokeWidth) => setStyle({ strokeWidth })} />
          </div>
        </div>
      </div>

      <SheetFooter className="flex-row justify-between border-t">
        <Button
          variant="ghost"
          className="text-destructive"
          onClick={() => {
            onClose()
            void deleteNodes([node.id])
          }}
        >
          <Trash2 /> Supprimer
        </Button>
        <Button onClick={() => onOpenNode(node.id)}>
          <CornerDownRight /> Entrer dans l'idée
        </Button>
      </SheetFooter>
    </>
  )
}

function FieldEditor({ node, field }: { node: IdeaNode; field: TemplateField }) {
  const value = node.values[field.id]
  const id = `field-${field.id}`
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{field.label}</Label>
      {field.type === 'richtext' && (
        <RichTextEditor value={typeof value === 'string' ? value : ''} onChange={(md) => updateNodeValue(node.id, field.id, md)} />
      )}
      {field.type === 'date' && (
        <Input
          id={id}
          type="date"
          defaultValue={typeof value === 'string' ? value : ''}
          onChange={(e) => updateNodeValue(node.id, field.id, e.target.value || null)}
        />
      )}
      {field.type === 'number' && (
        <Input
          id={id}
          type="number"
          defaultValue={typeof value === 'number' ? value : ''}
          onChange={(e) => updateNodeValue(node.id, field.id, e.target.value === '' ? null : Number(e.target.value))}
        />
      )}
    </div>
  )
}
