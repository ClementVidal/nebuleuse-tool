import { AArrowDown, AArrowUp, Bookmark, BookmarkCheck, BookOpen, CornerDownRight, PenLine, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { RichTextEditor } from '@/components/rich-text-editor'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { setBookmarked, updateNode, updateNodeValue } from '@/db/actions'
import { colorCss } from '@/db/palette'
import type { IdeaNode, NodeTemplate, TemplateField } from '@/db/types'
import { cn } from '@/lib/utils'
import { markdownExcerpt, markdownToHtml } from './markdown'
import { templateStyle } from './node-style'

export type DocumentMode = 'read' | 'edit'

interface IdeaDocumentProps {
  node: IdeaNode | undefined
  mode: DocumentMode
  template: NodeTemplate | undefined
  /** Number of ideas in the idea's own map (0 if empty or not created yet). */
  childSize: number
  /** Where the idea lives (parent idea title or project name). */
  location: string
  onClose: () => void
  onDig: (nodeId: string) => void
}

/**
 * Full-page view of an idea.
 * - read: a calm reading page (reading font, comfortable measure, progress, table of contents).
 *   A double-click / double-tap anywhere closes it.
 * - edit: the same page with an editable title and a rich text editor; changes save as you type.
 */
export function IdeaDocument(props: IdeaDocumentProps) {
  const { node, onClose } = props
  return (
    <Dialog open={node !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="idea-document flex h-dvh max-h-dvh w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[94dvh] sm:max-w-5xl sm:rounded-xl sm:border"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {node && <DocumentBody key={`${node.id}:${props.mode}`} {...props} node={node} />}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- reading preferences

const SIZES = [16, 17, 18, 20, 22] as const
const SIZE_KEY = 'nebuleuse-reader-size'

function readSize(): number {
  try {
    const stored = Number(localStorage.getItem(SIZE_KEY))
    return (SIZES as readonly number[]).includes(stored) ? stored : 18
  } catch {
    return 18
  }
}

function storeSize(size: number) {
  try {
    localStorage.setItem(SIZE_KEY, String(size))
  } catch {
    // Ignore: the size just won't persist.
  }
}

// ---------------------------------------------------------------- body

interface Heading {
  id: string
  text: string
  level: number
}

function DocumentBody({ node, mode, template, childSize, location, onClose, onDig }: IdeaDocumentProps & { node: IdeaNode }) {
  const reading = mode === 'read'
  const style = templateStyle(template)
  const accent = colorCss(style.color)
  const scrollRef = useRef<HTMLDivElement>(null)
  const articleRef = useRef<HTMLElement>(null)
  const [progress, setProgress] = useState(0)
  const [size, setSize] = useState(readSize)
  const [headings, setHeadings] = useState<Heading[]>([])

  const richFields = template?.fields.filter((f) => f.type === 'richtext') ?? []
  const metaFields = template?.fields.filter((f) => f.type !== 'richtext') ?? []
  const showFieldLabels = richFields.length > 1

  const plainText = richFields.map((f) => markdownExcerpt(String(node.values[f.id] ?? ''), Infinity)).join(' ').trim()
  const words = plainText ? plainText.split(/\s+/).length : 0
  const minutes = Math.max(1, Math.round(words / 220))

  // Table of contents from the rendered headings (reading mode).
  useLayoutEffect(() => {
    if (!reading || !articleRef.current) return
    const found = [...articleRef.current.querySelectorAll<HTMLElement>('.doc-prose h1, .doc-prose h2, .doc-prose h3')]
    found.forEach((el, i) => (el.id = `h-${i}`))
    setHeadings(found.map((el, i) => ({ id: `h-${i}`, text: el.textContent ?? '', level: Number(el.tagName[1]) })))
  }, [reading, node.values])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    setProgress(max > 0 ? el.scrollTop / max : 1)
  }
  useEffect(onScroll, [])

  const changeSize = (delta: number) => {
    const i = SIZES.indexOf(size as (typeof SIZES)[number])
    const next = SIZES[Math.min(SIZES.length - 1, Math.max(0, i + delta))]
    setSize(next)
    storeSize(next)
  }

  // Reading mode: a double-click, or a double-tap on touch screens, closes the page.
  const lastTap = useRef<{ time: number; x: number; y: number } | undefined>(undefined)
  const closeGestures = reading
    ? {
        onDoubleClick: (e: React.MouseEvent) => {
          if ((e.target as HTMLElement).closest('button, a, input')) return
          window.getSelection()?.removeAllRanges()
          onClose()
        },
        onPointerUp: (e: React.PointerEvent) => {
          if (e.pointerType !== 'touch' || (e.target as HTMLElement).closest('button, a, input')) return
          const last = lastTap.current
          if (last && e.timeStamp - last.time < 350 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30) {
            lastTap.current = undefined
            onClose()
          } else {
            lastTap.current = { time: e.timeStamp, x: e.clientX, y: e.clientY }
          }
        },
      }
    : {}

  return (
    <>
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: accent }} />
        <div className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{template?.name ?? 'Idée'}</span>
          <span className="mx-1.5">·</span>
          <span>{location}</span>
        </div>
        <span
          className={cn(
            'hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex',
            reading ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground',
          )}
        >
          {reading ? <BookOpen className="size-3.5" /> : <PenLine className="size-3.5" />}
          {reading ? 'Lecture' : 'Édition'}
        </span>
        {reading && (
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="size-8" title="Texte plus petit" aria-label="Texte plus petit" disabled={size === SIZES[0]} onClick={() => changeSize(-1)}>
              <AArrowDown />
            </Button>
            <Button variant="ghost" size="icon" className="size-8" title="Texte plus grand" aria-label="Texte plus grand" disabled={size === SIZES.at(-1)} onClick={() => changeSize(1)}>
              <AArrowUp />
            </Button>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          title={node.bookmarkedAt ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          aria-label={node.bookmarkedAt ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          onClick={() => void setBookmarked(node.id, !node.bookmarkedAt)}
        >
          {node.bookmarkedAt ? <BookmarkCheck className="fill-current" /> : <Bookmark />}
        </Button>
        <Button variant="ghost" size="icon" className="size-8" title="Fermer (Échap)" aria-label="Fermer" onClick={onClose}>
          <X />
        </Button>
      </header>

      {/* Reading progress */}
      {reading && (
        <div className="h-0.5 shrink-0 bg-transparent">
          <div className="h-full transition-[width] duration-150" style={{ width: `${progress * 100}%`, background: accent }} />
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {reading && headings.length >= 2 && (
          <nav className="absolute top-10 left-6 hidden w-48 xl:block" aria-label="Sommaire">
            <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Sommaire</div>
            <ul className="grid gap-1 text-sm">
              {headings.map((h) => (
                <li key={h.id} style={{ paddingLeft: (h.level - 1) * 10 }}>
                  <button
                    type="button"
                    className="text-left text-muted-foreground hover:text-foreground"
                    onClick={() => articleRef.current?.querySelector(`#${h.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  >
                    {h.text}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain" {...closeGestures}>
          <article
            ref={articleRef}
            className="mx-auto w-full max-w-[42rem] px-5 pt-8 pb-24 sm:px-8 sm:pt-12"
            style={{ ['--doc-size' as string]: `${size}px` }}
          >
            {reading ? (
              <DialogTitle className="doc-title">{node.title || 'Sans titre'}</DialogTitle>
            ) : (
              <>
                <DialogTitle className="sr-only">Éditer « {node.title || 'Sans titre'} »</DialogTitle>
                <TitleInput node={node} />
              </>
            )}
            <DialogDescription className="sr-only">
              {reading ? 'Lecture. Double-clic ou double-tap pour fermer.' : 'Édition. Enregistrement automatique.'}
            </DialogDescription>

            {/* Meta line */}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
              {reading && words > 0 && (
                <span>
                  {minutes} min de lecture · {words} mot{words > 1 ? 's' : ''}
                </span>
              )}
              {!reading && <span>Enregistré automatiquement</span>}
              {reading &&
                metaFields.map((f) => {
                  const v = node.values[f.id]
                  if (v === null || v === undefined || v === '') return null
                  return (
                    <span key={f.id} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
                      {f.label} : {f.type === 'date' ? new Date(String(v)).toLocaleDateString('fr-FR', { dateStyle: 'long' }) : String(v)}
                    </span>
                  )
                })}
            </div>
            {!reading && metaFields.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-4">
                {metaFields.map((f) => (
                  <MetaFieldInput key={f.id} node={node} field={f} />
                ))}
              </div>
            )}

            <div className="mt-8 grid gap-10">
              {richFields.map((field) => {
                const value = String(node.values[field.id] ?? '')
                return (
                  <section key={field.id}>
                    {showFieldLabels && <h2 className="doc-field-label">{field.label}</h2>}
                    {reading ? (
                      value.trim() ? (
                        <div className="doc-prose" dangerouslySetInnerHTML={{ __html: markdownToHtml(value) }} />
                      ) : (
                        <p className="doc-prose text-muted-foreground italic">Rien d’écrit pour l’instant.</p>
                      )
                    ) : (
                      <RichTextEditor
                        value={value}
                        onChange={(md) => updateNodeValue(node.id, field.id, md)}
                        placeholder={`${field.label}… (Markdown : ## titre, - liste, [ ] tâche, > citation)`}
                      />
                    )}
                  </section>
                )
              })}
              {richFields.length === 0 && (
                <p className="text-sm text-muted-foreground">Le template « {template?.name} » n’a pas de champ texte.</p>
              )}
            </div>

            {reading && (
              <DigFooter childSize={childSize} onDig={() => onDig(node.id)}>
                <p className="mt-6 text-center text-xs text-muted-foreground">Double-clic ou double-tap pour fermer</p>
              </DigFooter>
            )}
          </article>
        </div>
      </div>
    </>
  )
}

function DigFooter({ childSize, onDig, children }: { childSize: number; onDig: () => void; children?: ReactNode }) {
  return (
    <div className="mt-16 border-t pt-8">
      <Button size="lg" className="w-full sm:w-auto" onClick={onDig}>
        <CornerDownRight /> Explorer l’idée
        <span className="font-normal opacity-70">
          {childSize > 0 ? `· ${childSize} idée${childSize > 1 ? 's' : ''}` : '· carte vide'}
        </span>
      </Button>
      {children}
    </div>
  )
}

/** Large, borderless, auto-growing title field. */
function TitleInput({ node }: { node: IdeaNode }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const resize = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  const isNew = useRef(node.title === 'Nouvelle idée')
  useLayoutEffect(resize, [])
  useEffect(() => {
    // Select the title of a freshly created idea (default title) so it can be typed right away.
    if (isNew.current) ref.current?.select()
  }, [])
  return (
    <textarea
      ref={ref}
      rows={1}
      aria-label="Titre"
      placeholder="Titre de l’idée"
      defaultValue={node.title}
      className="doc-title w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-muted-foreground/50"
      onInput={resize}
      onChange={(e) => updateNode(node.id, { title: e.target.value.replace(/\n/g, ' ') }, { coalesceKey: `title:${node.id}` })}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        // Enter moves on to the text rather than adding a line break to the title.
        e.preventDefault()
        const editor = (e.currentTarget.closest('.idea-document') as HTMLElement | null)?.querySelector<HTMLElement>('.ProseMirror')
        editor?.focus()
      }}
    />
  )
}

function MetaFieldInput({ node, field }: { node: IdeaNode; field: TemplateField }) {
  const value = node.values[field.id]
  const id = `meta-${field.id}`
  return (
    <label htmlFor={id} className="grid gap-1 text-sm">
      <span className="text-muted-foreground">{field.label}</span>
      <Input
        id={id}
        type={field.type === 'date' ? 'date' : 'number'}
        className="w-44"
        defaultValue={value === null || value === undefined ? '' : String(value)}
        onChange={(e) =>
          updateNodeValue(
            node.id,
            field.id,
            e.target.value === '' ? null : field.type === 'number' ? Number(e.target.value) : e.target.value,
          )
        }
      />
    </label>
  )
}
