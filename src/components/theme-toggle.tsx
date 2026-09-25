import { Monitor, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

type Theme = 'light' | 'dark' | 'system'
const STORAGE_KEY = 'nebuleuse-theme'
const NEXT: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' }
const LABEL: Record<Theme, string> = { light: 'Thème clair', dark: 'Thème sombre', system: 'Thème du système' }

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // Storage unavailable: fall back to the system theme.
  }
  return 'system'
}

function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

/** Call once at startup so the first paint uses the right theme. */
export function initTheme() {
  applyTheme(readTheme())
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme)

  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Ignore: the choice just won't persist.
    }
    if (theme !== 'system') return
    const media = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])

  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor
  return (
    <Button variant="ghost" size="icon" title={LABEL[theme]} aria-label={LABEL[theme]} onClick={() => setTheme(NEXT[theme])}>
      <Icon />
    </Button>
  )
}
