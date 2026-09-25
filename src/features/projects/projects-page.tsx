import { Link, useNavigate } from '@tanstack/react-router'
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { createProject, deleteProject, renameProject } from '@/db/actions'
import { useProjects } from '@/db/hooks'
import type { Project } from '@/db/types'

type NameDialogState = { mode: 'create' } | { mode: 'rename'; project: Project }

export function ProjectsPage() {
  const projects = useProjects()
  const navigate = useNavigate()
  const [nameDialog, setNameDialog] = useState<NameDialogState>()
  const [toDelete, setToDelete] = useState<Project>()

  const submitName = async (name: string) => {
    if (!nameDialog) return
    setNameDialog(undefined)
    if (nameDialog.mode === 'rename') {
      await renameProject(nameDialog.project.id, name)
      return
    }
    const project = await createProject(name)
    await navigate({ to: '/projects/$projectId/maps/$mapId', params: { projectId: project.id, mapId: project.rootMapId } })
  }

  return (
    <div className="min-h-dvh">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <span className="text-lg font-semibold tracking-tight">Nébuleuse</span>
        <ThemeToggle />
      </header>

      <main className="mx-auto grid max-w-4xl gap-6 px-4 py-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Projets</h1>
          <Button onClick={() => setNameDialog({ mode: 'create' })}>
            <Plus /> Nouveau projet
          </Button>
        </div>

        {projects?.length === 0 && (
          <Card className="items-center border-dashed py-12 text-center">
            <CardHeader className="w-full">
              <CardTitle>Aucun projet</CardTitle>
              <CardDescription>Crée un projet pour commencer à cartographier tes idées.</CardDescription>
            </CardHeader>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {projects?.map((project) => (
            <Card key={project.id} className="relative transition-colors hover:bg-accent/50">
              <CardHeader>
                <CardTitle>
                  <Link to="/projects/$projectId" params={{ projectId: project.id }} className="after:absolute after:inset-0">
                    {project.name}
                  </Link>
                </CardTitle>
                <CardDescription>Modifié le {new Date(project.updatedAt).toLocaleString('fr-FR')}</CardDescription>
                <CardAction className="relative z-10">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Actions du projet">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setNameDialog({ mode: 'rename', project })}>
                        <Pencil /> Renommer
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(project)}>
                        <Trash2 /> Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardAction>
              </CardHeader>
            </Card>
          ))}
        </div>
      </main>

      <NameDialog state={nameDialog} onCancel={() => setNameDialog(undefined)} onSubmit={submitName} />

      <AlertDialog open={toDelete !== undefined} onOpenChange={(open) => !open && setToDelete(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {toDelete?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Toutes les cartes, idées et templates du projet seront définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => toDelete && void deleteProject(toDelete.id)}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function NameDialog({
  state,
  onCancel,
  onSubmit,
}: {
  state: NameDialogState | undefined
  onCancel: () => void
  onSubmit: (name: string) => void
}) {
  return (
    <Dialog open={state !== undefined} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            const name = String(new FormData(e.currentTarget).get('name') ?? '').trim()
            if (name) onSubmit(name)
          }}
        >
          <DialogHeader>
            <DialogTitle>{state?.mode === 'rename' ? 'Renommer le projet' : 'Nouveau projet'}</DialogTitle>
          </DialogHeader>
          <Input
            name="name"
            autoFocus
            placeholder="Nom du projet"
            defaultValue={state?.mode === 'rename' ? state.project.name : ''}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Annuler
            </Button>
            <Button type="submit">{state?.mode === 'rename' ? 'Renommer' : 'Créer'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
