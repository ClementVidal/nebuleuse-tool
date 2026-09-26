import { Panel } from '@xyflow/react'
import { Bookmark, BookmarkX, Eye, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { setBookmarked } from '@/db/actions'
import { useBookmarks, useProject } from '@/db/hooks'
import { cn } from '@/lib/utils'
import { setCanvasLocked, useCanvasLocked } from './lock-store'
import { useGoToNode } from './use-go-to-node'

/** Floating tools over the canvas (bottom right): navigation / edit mode and bookmarks. */
export function CanvasToolbar({ projectId }: { projectId: string }) {
  const editMode = useCanvasLocked()
  const modeLabel = editMode
    ? 'Mode édition : double-clic sur une idée pour l’éditer (L pour passer en navigation)'
    : 'Mode navigation : double-clic sur une idée pour y entrer (L pour passer en édition)'

  return (
    // Above the minimap on large screens (minimap: 150px high + 15px margin).
    <Panel position="bottom-right" className="max-md:!mb-8 md:!mb-[176px]">
      <div className="flex items-center gap-0.5 rounded-lg border bg-background p-1 shadow-sm">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          title={modeLabel}
          aria-label={modeLabel}
          onClick={() => setCanvasLocked(!editMode)}
        >
          {editMode ? <Pencil /> : <Eye />}
        </Button>
        <Separator orientation="vertical" className="!h-5" />
        <BookmarksButton projectId={projectId} />
      </div>
    </Panel>
  )
}

function BookmarksButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const project = useProject(projectId)
  const bookmarks = useBookmarks(project)
  const goToNode = useGoToNode()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-8" title="Favoris" aria-label="Favoris">
          <Bookmark className={cn(bookmarks?.length && 'fill-current')} />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-72 p-1">
        <div className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">Favoris</div>
        {bookmarks?.length === 0 && (
          <p className="px-2 pb-2 text-sm text-muted-foreground">
            Aucun favori. Sélectionne une idée et appuie sur <kbd className="rounded border px-1 text-xs">B</kbd>, ou utilise
            son éditeur.
          </p>
        )}
        <ul className="grid max-h-80 overflow-y-auto">
          {bookmarks?.map(({ node, location }) => (
            <li key={node.id} className="group flex items-center rounded-md hover:bg-accent">
              <button
                type="button"
                className="flex min-w-0 flex-1 flex-col items-start px-2 py-1.5 text-left"
                onClick={() => {
                  setOpen(false)
                  goToNode(node)
                }}
              >
                <span className="w-full truncate text-sm">{node.title || 'Sans titre'}</span>
                <span className="w-full truncate text-xs text-muted-foreground">{location}</span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="mr-1 size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-60"
                title="Retirer des favoris"
                aria-label="Retirer des favoris"
                onClick={() => void setBookmarked(node.id, false)}
              >
                <BookmarkX />
              </Button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
