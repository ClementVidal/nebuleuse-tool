import { Link, Navigate, useNavigate } from '@tanstack/react-router'
import { ReactFlowProvider } from '@xyflow/react'
import { House, Redo2, Search, Shapes, Undo2 } from 'lucide-react'
import { Fragment, useCallback, useState } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ensureChildMap } from '@/db/actions'
import { redo, undo } from '@/db/history'
import { useBreadcrumb, useHistoryState, useMap, useProject, useTemplates } from '@/db/hooks'
import { colorCss } from '@/db/palette'
import { setCommandPaletteOpen } from '@/features/shell/palette-store'
import { KeyboardHelp } from './keyboard-help'
import { MapCanvas } from './map-canvas'

interface MapPageProps {
  projectId: string
  mapId: string
  focusNodeId: string | undefined
}

export function MapPage({ projectId, mapId, focusNodeId }: MapPageProps) {
  const navigate = useNavigate()
  const project = useProject(projectId)
  const map = useMap(mapId)
  const templates = useTemplates(projectId)
  const breadcrumb = useBreadcrumb(project, mapId)
  const history = useHistoryState(projectId)
  const [chosenTemplateId, setActiveTemplateId] = useState<string>()
  const activeTemplateId = templates?.some((t) => t.id === chosenTemplateId) ? chosenTemplateId : templates?.[0]?.id

  const openNode = useCallback(
    async (nodeId: string) => {
      const childMapId = await ensureChildMap(nodeId)
      await navigate({ to: '/projects/$projectId/maps/$mapId', params: { projectId, mapId: childMapId } })
    },
    [navigate, projectId],
  )

  const parentNode = map?.parentNodeId ? breadcrumb?.at(-1)?.node : null
  const navigateUp = useCallback(() => {
    if (!parentNode) return
    void navigate({
      to: '/projects/$projectId/maps/$mapId',
      params: { projectId, mapId: parentNode.mapId },
      search: { focus: parentNode.id },
    })
  }, [navigate, parentNode, projectId])

  const selectTemplateIndex = useCallback(
    (index: number) => {
      const template = templates?.[index]
      if (template) setActiveTemplateId(template.id)
    },
    [templates],
  )

  if (project === null || map === null) return <Navigate to="/" />
  if (!project || !map || !templates || !breadcrumb) return null

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
        <Button variant="ghost" size="icon" asChild title="Projets">
          <Link to="/">
            <House />
          </Link>
        </Button>
        <Separator orientation="vertical" className="!h-5" />
        <Breadcrumb className="min-w-0 flex-1">
          <BreadcrumbList className="flex-nowrap">
            {breadcrumb.map((item, i) => (
              <Fragment key={item.mapId}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem className="min-w-0">
                  {i === breadcrumb.length - 1 ? (
                    <BreadcrumbPage className="truncate">{item.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild className="truncate">
                      <Link
                        to="/projects/$projectId/maps/$mapId"
                        params={{ projectId, mapId: item.mapId }}
                        search={{ focus: breadcrumb[i + 1]?.node?.id }}
                      >
                        {item.label}
                      </Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>

        <ToggleGroup
          type="single"
          size="sm"
          value={activeTemplateId}
          onValueChange={(v) => v && setActiveTemplateId(v)}
          aria-label="Template des nouvelles idées"
          className="hidden sm:flex"
        >
          {templates.map((t, i) => (
            <ToggleGroupItem key={t.id} value={t.id} title={`${t.name} (${i + 1})`} className="gap-1.5 px-2.5">
              <span className="size-2.5 rounded-full border" style={{ background: colorCss(t.style.stroke) }} />
              {t.name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button
          variant="ghost"
          size="icon"
          title="Annuler (Ctrl+Z)"
          aria-label="Annuler"
          disabled={!history.canUndo}
          onClick={() => void undo(projectId)}
        >
          <Undo2 />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Rétablir (Ctrl+Maj+Z)"
          aria-label="Rétablir"
          disabled={!history.canRedo}
          onClick={() => void redo(projectId)}
        >
          <Redo2 />
        </Button>
        <Separator orientation="vertical" className="!h-5" />
        <Button
          variant="outline"
          size="sm"
          className="hidden gap-2 text-muted-foreground md:flex"
          onClick={() => setCommandPaletteOpen(true)}
        >
          <Search />
          Rechercher
          <Kbd>Ctrl K</Kbd>
        </Button>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Rechercher" onClick={() => setCommandPaletteOpen(true)}>
          <Search />
        </Button>
        <Button variant="ghost" size="icon" asChild title="Templates du projet">
          <Link to="/projects/$projectId/templates" params={{ projectId }}>
            <Shapes />
          </Link>
        </Button>
        <KeyboardHelp />
        <ThemeToggle />
      </header>

      <main className="min-h-0 flex-1">
        <ReactFlowProvider>
          <MapCanvas
            map={map}
            templates={templates}
            activeTemplateId={activeTemplateId}
            focusNodeId={focusNodeId}
            onOpenNode={openNode}
            onNavigateUp={parentNode ? navigateUp : undefined}
            onSelectTemplateIndex={selectTemplateIndex}
          />
        </ReactFlowProvider>
      </main>
    </div>
  )
}
