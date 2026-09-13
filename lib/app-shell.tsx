'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { BlockRow, SectionRow, TrainRow } from '@/lib/types'
import type { Role } from '@/lib/mock-data'

/**
 * App-level UI state shared across the shell: theme (dark/light with
 * persistence) and cross-view navigation intents (search → page, network →
 * schedule/conflict center). Views read intents via useAppShell().
 */

export type SearchTarget =
  | { kind: 'train'; train: TrainRow }
  | { kind: 'section'; section: SectionRow }
  | { kind: 'conflict'; block: BlockRow }
  | { kind: 'asset'; assetId: string }
  | { kind: 'station'; stationCode: string }
  | { kind: 'complaint'; complaintId: string }
  | { kind: 'user'; userId: string }

export type Theme = 'dark' | 'light'

interface AppShellValue {
  theme: Theme
  setTheme: (t: Theme) => void
  /** Intent set by search / network clicks; consumed once by target views. */
  target: SearchTarget | null
  go: (t: SearchTarget) => void
  clearTarget: () => void
  role: Role
  /** Identifier of the currently displayed page (for context-aware UI). */
  view: string
  setView: (v: string) => void
}

const AppShellContext = createContext<AppShellValue | null>(null)

const THEME_KEY = 'railmind-theme'

export function AppShellProvider({
  children,
  role,
}: {
  children: React.ReactNode
  role: Role
}) {
  const [theme, setThemeState] = useState<Theme>('dark')
  const [target, setTarget] = useState<SearchTarget | null>(null)
  const [view, setView] = useState('dashboard')

  // Restore persisted theme once on mount
  useEffect(() => {
    const saved = window.localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') setThemeState(saved)
  }, [])

  // Reflect the theme on <html> (tailwind dark variant)
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme
  }, [theme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    window.localStorage.setItem(THEME_KEY, t)
  }, [])

  const go = useCallback((t: SearchTarget) => setTarget(t), [])
  const clearTarget = useCallback(() => setTarget(null), [])

  const value = useMemo(
    () => ({ theme, setTheme, target, go, clearTarget, role, view, setView }),
    [theme, setTheme, target, go, clearTarget, role, view],
  )

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>
}

export function useAppShell(): AppShellValue {
  const ctx = useContext(AppShellContext)
  if (!ctx) throw new Error('useAppShell must be used within AppShellProvider')
  return ctx
}
