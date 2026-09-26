import { createRootRoute, createRoute, createRouter, Navigate } from '@tanstack/react-router'
import { useProject } from '@/db/hooks'
import { MapPage } from '@/features/map/map-page'
import { ProjectsPage } from '@/features/projects/projects-page'
import { AppShell } from '@/features/shell/app-shell'
import { ErrorPage } from '@/features/shell/error-page'
import { TemplatesPage } from '@/features/templates/templates-page'

const rootRoute = createRootRoute({
  component: AppShell,
  notFoundComponent: () => <Navigate to="/" />,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: ProjectsPage,
})

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId',
  component: function ProjectRedirect() {
    const { projectId } = projectRoute.useParams()
    const project = useProject(projectId)
    if (project === undefined) return null
    if (project === null) return <Navigate to="/" replace />
    return <Navigate to="/projects/$projectId/maps/$mapId" params={{ projectId, mapId: project.rootMapId }} replace />
  },
})

export const mapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/maps/$mapId',
  validateSearch: (search: Record<string, unknown>): { focus?: string } =>
    typeof search.focus === 'string' ? { focus: search.focus } : {},
  component: function MapRoute() {
    const { projectId, mapId } = mapRoute.useParams()
    const { focus } = mapRoute.useSearch()
    return <MapPage key={mapId} projectId={projectId} mapId={mapId} focusNodeId={focus} />
  },
})

export const templatesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/templates',
  component: function TemplatesRoute() {
    const { projectId } = templatesRoute.useParams()
    return <TemplatesPage projectId={projectId} />
  },
})

const routeTree = rootRoute.addChildren([indexRoute, projectRoute, mapRoute, templatesRoute])

export const router = createRouter({ routeTree, defaultErrorComponent: ErrorPage })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
