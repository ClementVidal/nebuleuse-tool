import { Markdown } from '@tiptap/markdown'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Undo2,
} from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Separator } from '@/components/ui/separator'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'

interface RichTextEditorProps {
  /** Markdown content. Only read on mount: remount (via `key`) to load another document. */
  value: string
  onChange: (markdown: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}

/**
 * Document-style rich text editor (Markdown in, Markdown out). Markdown shortcuts work while
 * typing (`## `, `- `, `[ ] `, `> `, `**bold**`…); a toolbar stays visible and a bubble menu
 * appears on text selection.
 */
export function RichTextEditor({ value, onChange, placeholder, className, autoFocus }: RichTextEditorProps) {
  // Saves are grouped: written after a short typing pause, and right away on blur / unmount,
  // so long texts don't queue one database write per keystroke.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])
  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const flush = () => {
    clearTimeout(timer.current)
    if (pending.current === null) return
    const markdown = pending.current
    pending.current = null
    onChangeRef.current(markdown)
  }
  useEffect(() => flush, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, defaultProtocol: 'https' } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown,
      Placeholder.configure({ placeholder: placeholder ?? 'Écris ton idée…' }),
    ],
    content: value,
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    onUpdate: ({ editor }) => {
      pending.current = editor.getMarkdown()
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, 250)
    },
    onBlur: flush,
    editorProps: { attributes: { class: 'doc-prose rich-text-content' } },
  })

  return (
    <div className={cn('rich-text', className)}>
      {editor && <Toolbar editor={editor} />}
      {editor && <SelectionMenu editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  )
}

function ToolButton({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Toggle size="sm" aria-label={label} title={label} pressed={pressed ?? false} onPressedChange={onClick} className="shrink-0">
      {children}
    </Toggle>
  )
}

function askLink(editor: Editor) {
  const previous = editor.getAttributes('link').href as string | undefined
  const url = window.prompt('Adresse du lien', previous ?? 'https://')
  if (url === null) return
  if (url.trim() === '' || url.trim() === 'https://') editor.chain().focus().extendMarkRange('link').unsetLink().run()
  else editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
}

/** Toolbar pinned at the top of the editing surface. Scrolls horizontally on small screens. */
function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor }) => ({
      h1: editor.isActive('heading', { level: 1 }),
      h2: editor.isActive('heading', { level: 2 }),
      h3: editor.isActive('heading', { level: 3 }),
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      strike: editor.isActive('strike'),
      code: editor.isActive('code'),
      link: editor.isActive('link'),
      bulletList: editor.isActive('bulletList'),
      orderedList: editor.isActive('orderedList'),
      taskList: editor.isActive('taskList'),
      blockquote: editor.isActive('blockquote'),
      codeBlock: editor.isActive('codeBlock'),
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    }),
  })
  const chain = () => editor.chain().focus()

  return (
    <div className="rich-text-toolbar flex items-center gap-0.5 overflow-x-auto">
      <ToolButton label="Annuler" onClick={() => chain().undo().run()}>
        <Undo2 className={cn(!s.canUndo && 'opacity-40')} />
      </ToolButton>
      <ToolButton label="Rétablir" onClick={() => chain().redo().run()}>
        <Redo2 className={cn(!s.canRedo && 'opacity-40')} />
      </ToolButton>
      <Separator orientation="vertical" className="mx-1 !h-5" />
      <ToolButton label="Titre 1" pressed={s.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}>
        <Heading1 />
      </ToolButton>
      <ToolButton label="Titre 2" pressed={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
        <Heading2 />
      </ToolButton>
      <ToolButton label="Titre 3" pressed={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
        <Heading3 />
      </ToolButton>
      <Separator orientation="vertical" className="mx-1 !h-5" />
      <ToolButton label="Gras (Ctrl+B)" pressed={s.bold} onClick={() => chain().toggleBold().run()}>
        <Bold />
      </ToolButton>
      <ToolButton label="Italique (Ctrl+I)" pressed={s.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic />
      </ToolButton>
      <ToolButton label="Barré" pressed={s.strike} onClick={() => chain().toggleStrike().run()}>
        <Strikethrough />
      </ToolButton>
      <ToolButton label="Code" pressed={s.code} onClick={() => chain().toggleCode().run()}>
        <Code />
      </ToolButton>
      <ToolButton label="Lien" pressed={s.link} onClick={() => askLink(editor)}>
        <Link2 />
      </ToolButton>
      <Separator orientation="vertical" className="mx-1 !h-5" />
      <ToolButton label="Liste à puces" pressed={s.bulletList} onClick={() => chain().toggleBulletList().run()}>
        <List />
      </ToolButton>
      <ToolButton label="Liste numérotée" pressed={s.orderedList} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrdered />
      </ToolButton>
      <ToolButton label="Liste de tâches" pressed={s.taskList} onClick={() => chain().toggleTaskList().run()}>
        <ListChecks />
      </ToolButton>
      <ToolButton label="Citation" pressed={s.blockquote} onClick={() => chain().toggleBlockquote().run()}>
        <Quote />
      </ToolButton>
      <ToolButton label="Bloc de code" pressed={s.codeBlock} onClick={() => chain().toggleCodeBlock().run()}>
        <SquareCode />
      </ToolButton>
      <ToolButton label="Séparateur" onClick={() => chain().setHorizontalRule().run()}>
        <Minus />
      </ToolButton>
    </div>
  )
}

/** Compact formatting menu shown next to a text selection. */
function SelectionMenu({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      strike: editor.isActive('strike'),
      code: editor.isActive('code'),
      link: editor.isActive('link'),
    }),
  })
  const run = (fn: () => void) => fn()
  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top' }}
      className="flex items-center gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
    >
      <ToolButton label="Gras" pressed={s.bold} onClick={() => run(() => editor.chain().focus().toggleBold().run())}>
        <Bold />
      </ToolButton>
      <ToolButton label="Italique" pressed={s.italic} onClick={() => run(() => editor.chain().focus().toggleItalic().run())}>
        <Italic />
      </ToolButton>
      <ToolButton label="Barré" pressed={s.strike} onClick={() => run(() => editor.chain().focus().toggleStrike().run())}>
        <Strikethrough />
      </ToolButton>
      <ToolButton label="Code" pressed={s.code} onClick={() => run(() => editor.chain().focus().toggleCode().run())}>
        <Code />
      </ToolButton>
      <ToolButton label="Lien" pressed={s.link} onClick={() => run(() => askLink(editor))}>
        <Link2 />
      </ToolButton>
    </BubbleMenu>
  )
}
