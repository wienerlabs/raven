'use client'

import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'raven.theme'
const browserColors: Record<Theme, string> = { dark: '#0b0b0e', light: '#ffffff' }

function readTheme(): Theme {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', browserColors[theme])
}

function persist(theme: Theme): boolean {
  try {
    localStorage.setItem(KEY, theme)
    return true
  } catch {
    return false
  }
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>('dark')
  useEffect(() => {
    setTheme(readTheme())
  }, [])
  const toggle = useCallback(() => {
    const next: Theme = readTheme() === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    persist(next)
    setTheme(next)
  }, [])
  return { theme, toggle }
}
