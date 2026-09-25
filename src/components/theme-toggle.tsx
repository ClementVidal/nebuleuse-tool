import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setTheme, THEME_LABELS, useTheme, type Theme } from '@/lib/theme'

const NEXT: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' }

export function ThemeToggle() {
  const theme = useTheme()
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor
  return (
    <Button variant="ghost" size="icon" title={THEME_LABELS[theme]} aria-label={THEME_LABELS[theme]} onClick={() => setTheme(NEXT[theme])}>
      <Icon />
    </Button>
  )
}
