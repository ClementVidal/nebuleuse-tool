import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark' | 'system'

export const THEME_LABELS: Record<Theme, string> = { light: 'Thème clair', dark: 'Thème sombre', system: 'Thème du système' }

const STORAGE_KEY = 'nebuleuse-theme'
const listeners = new Set<() => void>()
let current: Theme = readStoredTheme()

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // Storage unavailable: fall back to the system theme.
  }
  return 'system'
}

const media = matchMedia('(prefers-color-scheme: dark)')

function applyTheme() {
  const dark = current === 'dark' || (current === 'system' && media.matches)
  document.documentElement.classList.toggle('dark', dark)
}

media.addEventListener('change', applyTheme)
applyTheme()

export function setTheme(theme: Theme) {
  current = theme
  applyTheme()
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Ignore: the choice just won't persist.
  }
  for (const listener of listeners) listener()
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  )
}
