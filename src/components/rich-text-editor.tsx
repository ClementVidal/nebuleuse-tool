import { Markdown } from '@tiptap/markdown'
import { Placeholder } from '@tiptap/extensions'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Code, Heading2, Italic, List, ListOrdered, Quote, Strikethrough } from 'lucide-react'
import type { ReactNode } from 'react'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'

interface RichTextEditorProps {
  /** Markdown content. Only read on mount: remount (via `key`) to load another document. */
  value: string
  onChange: (markdown: string) => void
  placeholder?: string
  className?: string
}

export function RichTextEditor({ value, onChange, placeholder, className }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit, Markdown, Placeholder.configure({ placeholder: placeholder ?? 'Écrire…' })],
    content: value,
    contentType: 'markdown',
    onUpdate: ({ editor }) => onChange(editor.getMarkdown()),
    editorProps: {
      attributes: { class: 'px-3 py-2 text-sm' },
    },
  })

  return (
    <div className={cn('rich-text rounded-md border border-input bg-transparent shadow-xs focus-within:ring-[3px] focus-within:ring-ring/50', className)}>
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      strike: editor.isActive('strike'),
      code: editor.isActive('code'),
      heading: editor.isActive('heading', { level: 2 }),
      bulletList: editor.isActive('bulletList'),
      orderedList: editor.isActive('orderedList'),
      blockquote: editor.isActive('blockquote'),
    }),
  })

  const item = (label: string, pressed: boolean, run: () => void, icon: ReactNode) => (
    <Toggle size="sm" aria-label={label} title={label} pressed={pressed} onPressedChange={run}>
      {icon}
    </Toggle>
  )

  return (
    <div className="flex flex-wrap gap-0.5 border-b border-input p-1">
      {item('Gras', state.bold, () => editor.chain().focus().toggleBold().run(), <Bold />)}
      {item('Italique', state.italic, () => editor.chain().focus().toggleItalic().run(), <Italic />)}
      {item('Barré', state.strike, () => editor.chain().focus().toggleStrike().run(), <Strikethrough />)}
      {item('Code', state.code, () => editor.chain().focus().toggleCode().run(), <Code />)}
      {item('Titre de section', state.heading, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 />)}
      {item('Liste', state.bulletList, () => editor.chain().focus().toggleBulletList().run(), <List />)}
      {item('Liste numérotée', state.orderedList, () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered />)}
      {item('Citation', state.blockquote, () => editor.chain().focus().toggleBlockquote().run(), <Quote />)}
    </div>
  )
}
