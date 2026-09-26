import { useSyncExternalStore } from 'react'

/**
 * Canvas interaction mode. "Locked" is edit mode (pencil icon): double-clicking a node opens its
 * editor. Unlocked is navigation mode (eye icon): double-clicking a node enters its nested map.
 */
const STORAGE_KEY = 'nebuleuse-canvas-locked'
const listeners = new Set<() => void>()
let locked = read()

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

export function setCanvasLocked(value: boolean) {
  locked = value
  try {
    localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    // Ignore: the choice just won't persist.
  }
  for (const listener of listeners) listener()
}

export function isCanvasLocked() {
  return locked
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
