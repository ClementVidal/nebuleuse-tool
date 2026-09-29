import { AArrowDown, AArrowUp, Bookmark, BookmarkCheck, BookOpen, Check, ChevronDown, Ellipsis, PenLine, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { RichTextEditor } from '@/components/rich-text-editor'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { setBookmarked, updateNode, updateNodeValue } from '@/db/actions'
import { colorCss } from '@/db/palette'
import type { IdeaNode, IdeaStatus, NodeTemplate, TemplateField } from '@/db/types'
import { cn } from '@/lib/utils'
import { fieldValue, formatFieldValue, isTimelineField } from '@/db/fields'
import { markdownExcerpt, markdownToHtml } from './markdown'
import { templateStyle } from './node-style'
import { IdeaTimelines } from './timeline'

export type DocumentMode = 'read' | 'edit'

interface IdeaDocumentProps {
  node: IdeaNode | undefined
  mode: DocumentMode
  template: NodeTemplate | undefined
  /** Where the idea lives (parent idea title or project name). */
  location: string
  onClose: () => void
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
        className={cn(
          'idea-document flex h-dvh max-h-dvh w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0',
          // Centred column: a large sheet over the canvas. Full width: the whole screen.
          node?.fullWidth ? 'sm:max-w-none' : 'sm:h-[94dvh] sm:max-w-5xl sm:rounded-xl sm:border',
        )}
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

function DocumentBody({ node, mode, template, location, onClose }: IdeaDocumentProps & { node: IdeaNode }) {
  const reading = mode === 'read'
  const wide = !!node.fullWidth
  const style = templateStyle(template)
  const accent = colorCss(style.color)
  const scrollRef = useRef<HTMLDivElement>(null)
  const articleRef = useRef<HTMLElement>(null)
  const [progress, setProgress] = useState(0)
  const [size, setSize] = useState(readSize)
  const [headings, setHeadings] = useState<Heading[]>([])

  const richFields = template?.fields.filter((f) => f.type === 'richtext') ?? []
  const metaFields = template?.fields.filter((f) => f.type !== 'richtext') ?? []
  const timelineFields = template?.fields.filter(isTimelineField) ?? []
  const showFieldLabels = richFields.length > 1

  const plainText = richFields.map((f) => markdownExcerpt(String(fieldValue(node, f) ?? ''), Infinity)).join(' ').trim()
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
        <PageMenu node={node} />
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
        {reading && !wide && headings.length >= 2 && (
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
            className={cn(
              'mx-auto w-full px-5 pt-8 pb-24 sm:pt-12',
              wide ? 'max-w-none sm:px-12 lg:px-24' : 'max-w-[42rem] sm:px-8',
            )}
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
            {reading ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
                <StatusDot status={node.status} withLabel />
                {words > 0 && (
                  <span>
                    {minutes} min de lecture · {words} mot{words > 1 ? 's' : ''}
                  </span>
                )}
                {metaFields.map((f) => {
                  // Dates and periods are on the timelines below.
                  if (isTimelineField(f)) return null
                  const text = formatFieldValue(f, fieldValue(node, f))
                  if (!text) return null
                  return (
                    <span key={f.id} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
                      {f.label} : {text}
                    </span>
                  )
                })}
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <StatusPicker node={node} />
                {metaFields.map((f) =>
                  f.type === 'number' && !f.readOnly ? (
                    <MetaFieldInput key={f.id} node={node} field={f} />
                  ) : (
                    // Dates are set in the idea's settings (calendar); read-only values can't change.
                    <span
                      key={f.id}
                      className="inline-flex items-center gap-1.5"
                      title={f.readOnly ? 'Lecture seule' : 'Se modifie dans les réglages de l’idée'}
                    >
                      {f.label}
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                        {formatFieldValue(f, fieldValue(node, f)) || '—'}
                      </span>
                    </span>
                  ),
                )}
              </div>
            )}

            {/* Timelines of the date / period fields, the idea's own date in front. */}
            {timelineFields.length > 0 && (
              <div className="mt-6 grid gap-6">
                <IdeaTimelines node={node} template={template} accent={accent} size="lg" />
              </div>
            )}

            <div className="mt-8 grid grid-cols-1 gap-10">
              {richFields.map((field) => {
                const value = String(fieldValue(node, field) ?? '')
                return (
                  <section key={field.id}>
                    {showFieldLabels && <h2 className="doc-field-label">{field.label}</h2>}
                    {!reading && field.description && <p className="-mt-1 mb-3 text-sm text-muted-foreground">{field.description}</p>}
                    {reading || field.readOnly ? (
                      value.trim() ? (
                        <div className="doc-prose" dangerouslySetInnerHTML={{ __html: markdownToHtml(value) }} />
                      ) : (
                        <p className="doc-prose text-muted-foreground italic">Rien d’écrit pour l’instant.</p>
                      )
                    ) : (
                      <RichTextEditor
                        value={value}
                        onChange={(md) => updateNodeValue(node.id, field.id, md)}
                        placeholder={field.description || `${field.label}… (Markdown : ## titre, - liste, [ ] tâche, > citation)`}
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
              <p className="mt-16 border-t pt-8 text-center text-xs text-muted-foreground">Double-clic ou double-tap pour fermer</p>
            )}
          </article>
        </div>
      </div>
    </>
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

const STATUS_LABELS: Record<IdeaStatus, string> = { draft: 'Brouillon', ready: 'Prêt' }

function StatusDot({ status = 'draft', withLabel }: { status?: IdeaStatus; withLabel?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn('size-2 rounded-full', status !== 'ready' && 'border border-muted-foreground/60')}
        style={status === 'ready' ? { background: 'var(--sketch-green)' } : undefined}
      />
      {withLabel && STATUS_LABELS[status]}
    </span>
  )
}

/** "Statut : Brouillon ▾" — a small dropdown right below the title. */
function StatusPicker({ node }: { node: IdeaNode }) {
  const status = node.status ?? 'draft'
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>Statut</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-xs font-medium" aria-label={`Statut : ${STATUS_LABELS[status]}`}>
            <StatusDot status={status} />
            {STATUS_LABELS[status]}
            <ChevronDown className="size-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-36">
          {(Object.keys(STATUS_LABELS) as IdeaStatus[]).map((s) => (
            <DropdownMenuItem key={s} role="menuitemradio" aria-checked={s === status} onSelect={() => void updateNode(node.id, { status: s })}>
              <StatusDot status={s} />
              {STATUS_LABELS[s]}
              {s === status && <Check className="ml-auto" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}

/** Number field, as a small inline pill next to the status. */
function MetaFieldInput({ node, field }: { node: IdeaNode; field: TemplateField }) {
  const value = node.values[field.id]
  const id = `meta-${field.id}`
  return (
    <label htmlFor={id} className="inline-flex items-center gap-1.5" title={field.description}>
      <span>{field.label}</span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        placeholder="—"
        className="doc-meta-input h-7 w-14 rounded-full border bg-transparent px-2.5 text-center text-xs font-medium text-foreground outline-none transition-colors hover:bg-accent focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
        defaultValue={value === null || value === undefined ? '' : String(value)}
        onChange={(e) => updateNodeValue(node.id, field.id, e.target.value === '' ? null : Number(e.target.value))}
      />
    </label>
  )
}

/** "…" menu of the page, as in Notion: layout options of this idea's page. */
function PageMenu({ node }: { node: IdeaNode }) {
  const toggleWidth = () => void updateNode(node.id, { fullWidth: !node.fullWidth || undefined })
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Phones already use the whole screen: the option only matters on wider screens. */}
        <Button variant="ghost" size="icon" className="size-8 max-sm:hidden" title="Options de la page" aria-label="Options de la page">
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Mise en page</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault() // keep the menu open, like a switch
            toggleWidth()
          }}
        >
          Pleine largeur
          <Switch checked={!!node.fullWidth} tabIndex={-1} aria-hidden className="pointer-events-none ml-auto" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
