import { Outlet, useParams } from '@tanstack/react-router'
import { useEffect } from 'react'
import { redo, undo } from '@/db/history'
import { CommandPalette } from './command-palette'
import { DbGate } from './db-gate'
import { setCommandPaletteOpen } from './palette-store'
import { useSwipeBack } from './use-swipe-back'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** Root layout: global shortcuts (command palette, undo / redo) around the current page. */
export function AppShell() {
  const { projectId } = useParams({ strict: false })
  useSwipeBack()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (!mod || event.altKey) return
      const key = event.key.toLowerCase()

      if (key === 'k') {
        event.preventDefault()
        setCommandPaletteOpen(true)
        return
      }
      // Text fields keep their native undo; dialogs show a snapshot we'd make stale.
      if (!projectId || isTypingTarget(event.target) || document.querySelector('[role="dialog"][data-state="open"]')) return
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        void undo(projectId)
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault()
        void redo(projectId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [projectId])

  return (
    <DbGate>
      <Outlet />
      <CommandPalette />
    </DbGate>
  )
}
