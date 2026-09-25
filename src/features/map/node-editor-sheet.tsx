import { Bookmark, BookmarkCheck, Trash2 } from 'lucide-react'
import { RichTextEditor } from '@/components/rich-text-editor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { deleteNodes, setBookmarked, updateNode, updateNodeValue } from '@/db/actions'
import type { IdeaNode, NodeTemplate, TemplateField } from '@/db/types'

interface NodeEditorSheetProps {
  node: IdeaNode | undefined
  templates: NodeTemplate[]
  onClose: () => void
}

export function NodeEditorSheet({ node, templates, onClose }: NodeEditorSheetProps) {
  return (
    <Sheet open={node !== undefined} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
        {node && <NodeEditor key={node.id} node={node} templates={templates} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

function NodeEditor({ node, templates, onClose }: Required<NodeEditorSheetProps> & { node: IdeaNode }) {
  const template = templates.find((t) => t.id === node.templateId)

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
        <Button variant={node.bookmarkedAt ? 'secondary' : 'outline'} onClick={() => setBookmarked(node.id, !node.bookmarkedAt)}>
          {node.bookmarkedAt ? <BookmarkCheck /> : <Bookmark />}
          {node.bookmarkedAt ? 'Dans les favoris' : 'Ajouter aux favoris'}
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
