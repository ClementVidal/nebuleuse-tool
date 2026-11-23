import { useNavigate, useParams } from '@tanstack/react-router'
import { defaultFilter } from 'cmdk'
import {
  ArrowUp,
  Bookmark,
  FolderOpen,
  House,
  Lock,
  LockOpen,
  Monitor,
  Moon,
  Plus,
  Redo2,
  Shapes,
  Sun,
  Undo2,
} from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { redo, undo } from '@/db/history'
import { useBookmarks, useHistoryState, useMap, useProject, useProjectNodes, useProjects, useTemplates } from '@/db/hooks'
import { colorCss } from '@/db/palette'
import { setCanvasLocked, useCanvasLocked } from '@/features/map/lock-store'
import { sendMapCommand } from '@/features/map/map-commands'
import { useGoToNode } from '@/features/map/use-go-to-node'
import { markdownExcerpt } from '@/features/map/markdown'
import { setTheme, THEME_LABELS, type Theme } from '@/lib/theme'
import { setCommandPaletteOpen, useCommandPaletteOpen } from './palette-store'

const THEME_ICONS: Record<Theme, ReactNode> = { light: <Sun />, dark: <Moon />, system: <Monitor /> }

/** Marks the keyword holding an idea's whole text (normalized), searched word by word. */
const FULL_TEXT = '\u0001'

/** Lowercase, without accents: « Révolution » is found by « revolution ». */
const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Small string hash, so an item's cmdk value changes whenever what it is searched on changes. */
function hash(s: string) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i)
  return (h >>> 0).toString(36)
}

/**
 * Items match on their `keywords` only, so ids used as `value` never cause false matches. Short
 * keywords (title, location, command names) match fuzzily; an idea's full text matches when it
 * contains every word typed, accents and case ignored.
 */
function filter(value: string, search: string, keywords: string[] = []) {
  const short = keywords.filter((k) => !k.startsWith(FULL_TEXT))
  const fuzzy = keywords.length ? (short.length ? defaultFilter('', search, short) : 0) : defaultFilter(value, search)
  if (fuzzy > 0) return fuzzy
  const text = keywords.find((k) => k.startsWith(FULL_TEXT))
  if (!text) return 0
  const words = normalize(search).split(/\s+/).filter(Boolean)
  return words.length > 0 && words.every((w) => text.includes(w)) ? 0.05 : 0
}

export function CommandPalette() {
  const open = useCommandPaletteOpen()
  return (
    <Dialog open={open} onOpenChange={setCommandPaletteOpen}>
      <DialogContent className="top-[20%] translate-y-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>Palette de commandes</DialogTitle>
          <DialogDescription>Rechercher une idée ou lancer une commande</DialogDescription>
        </DialogHeader>
        {open && <PaletteContent />}
      </DialogContent>
    </Dialog>
  )
}

function PaletteContent() {
  const navigate = useNavigate()
  const params = useParams({ strict: false })
  const projectId = params.projectId
  const mapId = params.mapId
  const project = useProject(projectId ?? '')
  const map = useMap(mapId ?? '')
  const templates = useTemplates(projectId ?? '')
  const projects = useProjects()
  const searchable = useProjectNodes(projectId ? project : null, true)
  const { canUndo, canRedo } = useHistoryState(projectId)
  const bookmarks = useBookmarks(projectId ? project : null)
  const goToNode = useGoToNode()
  const locked = useCanvasLocked()
  const templateById = new Map(templates?.map((t) => [t.id, t]))

  const run = (action: () => unknown) => {
    setCommandPaletteOpen(false)
    void action()
  }

  return (
    <Command
      filter={filter}
      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-item]]:py-2.5"
    >
      <CommandInput placeholder={project ? `Rechercher dans « ${project.name} » ou une commande…` : 'Rechercher une commande ou un projet…'} />
      <CommandList className="max-h-[min(60vh,420px)]">
        <CommandEmpty>Aucun résultat.</CommandEmpty>

        {project && bookmarks && bookmarks.length > 0 && (
          <CommandGroup heading="Favoris">
            {bookmarks.map(({ node, location }) => (
              <CommandItem
                key={node.id}
                value={`bookmark-${node.id}:${hash(node.title + location)}`}
                keywords={['favori', node.title, location]}
                onSelect={() => run(() => goToNode(node))}
              >
                <Bookmark className="fill-current" />
                <span className="truncate">{node.title || 'Sans titre'}</span>
                <span className="ml-auto truncate pl-4 text-xs text-muted-foreground">{location}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {project && searchable && searchable.length > 0 && (
          <CommandGroup heading="Idées">
            {searchable.map(({ node, location }) => {
              const template = templateById.get(node.templateId)
              // The whole text, not an excerpt: a word at the end of a long text must be found too.
              const text = (template?.fields ?? [])
                .filter((f) => f.type === 'richtext')
                .map((f) => markdownExcerpt(String(node.values[f.id] ?? ''), Infinity))
                .join(' ')
              const fullText = FULL_TEXT + normalize(`${node.title} ${text} ${location}`)
              return (
                <CommandItem
                  key={node.id}
                  // cmdk only re-reads keywords when the value changes: tie the value to the content.
                  value={`${node.id}:${hash(fullText)}`}
                  keywords={[node.title, location, fullText]}
                  onSelect={() => run(() => goToNode(node))}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: template ? colorCss(template.style.color) : 'var(--muted-foreground)' }}
                  />
                  <span className="truncate">{node.title || 'Sans titre'}</span>
                  <span className="ml-auto truncate pl-4 text-xs text-muted-foreground">{location}</span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}

        {project && (
          <CommandGroup heading="Actions">
            {mapId &&
              !locked &&
              templates?.map((t) => (
                <CommandItem
                  key={t.id}
                  value={`new-${t.id}`}
                  keywords={['nouvelle idée', 'créer', t.name]}
                  onSelect={() => run(() => sendMapCommand({ type: 'create-node', templateId: t.id }))}
                >
                  <Plus />
                  Nouvelle idée : {t.name}
                </CommandItem>
              ))}
            {map?.parentNodeId && (
              <CommandItem value="up" keywords={['remonter', 'carte parente', 'retour']} onSelect={() => run(() => sendMapCommand({ type: 'navigate-up' }))}>
                <ArrowUp />
                Remonter à la carte parente
                <CommandShortcut>Échap</CommandShortcut>
              </CommandItem>
            )}
            {mapId !== project.rootMapId && (
              <CommandItem
                value="root"
                keywords={['carte racine', 'accueil du projet', project.name]}
                onSelect={() => run(() => navigate({ to: '/projects/$projectId/maps/$mapId', params: { projectId: project.id, mapId: project.rootMapId } }))}
              >
                <House />
                Aller à la carte racine
              </CommandItem>
            )}
            {mapId && (
              <CommandItem
                value="lock"
                keywords={['verrou', 'verrouiller', 'déverrouiller', 'lecture', 'édition', 'modifier']}
                onSelect={() => run(() => setCanvasLocked(!locked))}
              >
                {locked ? <LockOpen /> : <Lock />}
                {locked ? 'Déverrouiller : modifier la carte' : 'Verrouiller : lecture seule'}
                <CommandShortcut>L</CommandShortcut>
              </CommandItem>
            )}
            <CommandItem value="undo" keywords={['annuler', 'undo']} disabled={!canUndo} onSelect={() => run(() => undo(project.id))}>
              <Undo2 />
              Annuler
              <CommandShortcut>Ctrl+Z</CommandShortcut>
            </CommandItem>
            <CommandItem value="redo" keywords={['rétablir', 'refaire', 'redo']} disabled={!canRedo} onSelect={() => run(() => redo(project.id))}>
              <Redo2 />
              Rétablir
              <CommandShortcut>Ctrl+Maj+Z</CommandShortcut>
            </CommandItem>
            <CommandItem
              value="templates"
              keywords={['templates', 'modèles', 'champs']}
              onSelect={() => run(() => navigate({ to: '/projects/$projectId/templates', params: { projectId: project.id } }))}
            >
              <Shapes />
              Templates du projet
            </CommandItem>
          </CommandGroup>
        )}

        <CommandSeparator />
        <CommandGroup heading="Projets">
          <CommandItem value="all-projects" keywords={['tous les projets', 'accueil', 'liste']} onSelect={() => run(() => navigate({ to: '/' }))}>
            <House />
            Tous les projets
          </CommandItem>
          {projects
            ?.filter((p) => p.id !== projectId)
            .map((p) => (
              <CommandItem
                key={p.id}
                value={`project-${p.id}`}
                keywords={['ouvrir le projet', p.name]}
                onSelect={() => run(() => navigate({ to: '/projects/$projectId', params: { projectId: p.id } }))}
              >
                <FolderOpen />
                {p.name}
              </CommandItem>
            ))}
        </CommandGroup>

        <CommandGroup heading="Préférences">
          {(Object.keys(THEME_LABELS) as Theme[]).map((theme) => (
            <CommandItem key={theme} value={`theme-${theme}`} keywords={['thème', THEME_LABELS[theme]]} onSelect={() => run(() => setTheme(theme))}>
              {THEME_ICONS[theme]}
              {THEME_LABELS[theme]}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
