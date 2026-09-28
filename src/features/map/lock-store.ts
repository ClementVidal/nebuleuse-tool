import { useSyncExternalStore } from 'react'

/**
 * Canvas lock.
 * - Locked (default, reading): the canvas is read-only. A click on an idea offers "Explorer
 *   l'idée", a double-click opens it in the reader.
 * - Unlocked (editing): ideas can be created, moved, linked and deleted. A click offers
 *   "Explorer l'idée", "Réglages" and "Supprimer", a double-click opens the editor.
 */
const STORAGE_KEY = 'nebuleuse-canvas-lock'
const listeners = new Set<() => void>()
let locked = read()

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'unlocked'
  } catch {
    return true
  }
}

export function setCanvasLocked(value: boolean) {
  locked = value
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'locked' : 'unlocked')
  } catch {
    // Ignore: the choice just won't persist.
  }
  for (const listener of listeners) listener()
}

export function useCanvasLocked(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => locked,
  )
}
