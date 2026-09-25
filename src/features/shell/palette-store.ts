import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()
let open = false

export function setCommandPaletteOpen(value: boolean) {
  open = value
  for (const listener of listeners) listener()
}

export function useCommandPaletteOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => open,
  )
}
