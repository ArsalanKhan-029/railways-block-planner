'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Menu, ChevronDown, ShieldAlert, Sun, Moon, SearchX } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useRailData } from '@/lib/use-rail-data'
import { NotificationBell } from '@/lib/notifications'
import { useAppShell, type SearchTarget } from '@/lib/app-shell'
import type { Role } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

interface AppHeaderProps {
  role: Role
  email: string
  title: string
  onOpenMobile: () => void
  onNavigateSearch: (t: SearchTarget) => void
}

interface Suggestion {
  label: string
  sub: string
  kind: 'Train' | 'Section' | 'Station' | 'Asset' | 'Conflict' | 'Block' | 'Complaint' | 'User'
  target: SearchTarget
}

export function AppHeader({ role, email, title, onOpenMobile, onNavigateSearch }: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const { theme, setTheme } = useAppShell()
  const { sections, stations, trains, blocks, assets, complaints, users } = useRailData()
  const isAdmin = role === 'Admin'

  // Universal, categorized search: trains, stations, sections, blocks &
  // conflicts, assets, complaints, users (users only for Admin).
  const grouped = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (query.length < 2) return []
    const groups: { kind: Suggestion['kind']; items: Suggestion[] }[] = []
    const add = (kind: Suggestion['kind'], items: Suggestion[]) => {
      if (items.length) groups.push({ kind, items: items.slice(0, 4) })
    }

    add(
      'Train',
      trains
        .filter((t) => t.train_number.toLowerCase().includes(query) || t.name.toLowerCase().includes(query))
        .map((t) => ({ kind: 'Train' as const, label: `${t.train_number} · ${t.name}`, sub: 'Train', target: { kind: 'train', train: t } })),
    )
    add(
      'Station',
      stations
        .filter((s) => s.code.toLowerCase().includes(query) || s.name.toLowerCase().includes(query))
        .slice(0, 40)
        .map((s) => ({ kind: 'Station' as const, label: `${s.code} · ${s.name}`, sub: `${s.zone} · ${s.tier}`, target: { kind: 'station', stationCode: s.code } })),
    )
    add(
      'Section',
      sections
        .filter((s) => s.code.toLowerCase().includes(query) || s.name.toLowerCase().includes(query))
        .map((s) => ({ kind: 'Section' as const, label: s.name, sub: `Section · ${s.code}`, target: { kind: 'section', section: s } })),
    )
    add(
      'Conflict',
      blocks
        .filter((b) => b.status === 'conflict' && (b.title.toLowerCase().includes(query) || b.requested_by.toLowerCase().includes(query)))
        .map((b) => ({ kind: 'Conflict' as const, label: b.title, sub: `Conflict · ${b.urgency} urgency`, target: { kind: 'conflict', block: b } })),
    )
    add(
      'Block',
      blocks
        .filter((b) => b.status !== 'conflict' && b.title.toLowerCase().includes(query))
        .map((b) => ({ kind: 'Block' as const, label: b.title, sub: `Block · ${b.status} · ${b.urgency}`, target: { kind: 'conflict', block: b } })),
    )
    add(
      'Asset',
      assets
        .filter((a) => a.asset_code.toLowerCase().includes(query) || a.name.toLowerCase().includes(query) || a.asset_type.toLowerCase().includes(query))
        .map((a) => ({ kind: 'Asset' as const, label: `${a.asset_code} · ${a.name}`, sub: `Asset · ${a.asset_type}`, target: { kind: 'asset', assetId: a.id } })),
    )
    add(
      'Complaint',
      complaints
        .filter((c) => c.category.toLowerCase().includes(query) || c.description.toLowerCase().includes(query) || c.reported_by.toLowerCase().includes(query))
        .map((c) => ({ kind: 'Complaint' as const, label: `${c.category} — ${c.description.slice(0, 42)}${c.description.length > 42 ? '…' : ''}`, sub: `Complaint · ${c.severity} · ${c.status}`, target: { kind: 'complaint', complaintId: c.id } })),
    )
    if (isAdmin) {
      add(
        'User',
        users
          .filter((u) => u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query) || u.role.toLowerCase().includes(query))
          .map((u) => ({ kind: 'User' as const, label: `${u.name}`, sub: `User · ${u.role} · ${u.status}`, target: { kind: 'user', userId: u.id } })),
      )
    }
    return groups
  }, [q, trains, stations, sections, blocks, assets, complaints, users, isAdmin])

  const suggestions = useMemo(() => grouped.flatMap((g) => g.items).slice(0, 18), [grouped])

  // close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(s: Suggestion) {
    setOpen(false)
    setQ('')
    onNavigateSearch(s.target)
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-md lg:px-6">
      <button
        type="button"
        onClick={onOpenMobile}
        className="rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>

      <h1 className="hidden shrink-0 text-base font-semibold tracking-tight sm:block">{title}</h1>

      {isAdmin && (
        <span className="hidden items-center gap-1 rounded-full border border-conflict/30 bg-conflict/10 px-2 py-0.5 text-xs font-medium text-conflict md:inline-flex">
          <ShieldAlert className="size-3" />
          Admin mode
        </span>
      )}

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {/* Working global search */}
        <div ref={boxRef} className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder="Search trains, stations, sections…"
            className="h-9 w-52 pl-8 lg:w-80"
            aria-label="Search"
            autoComplete="off"
          />
          {open && q.trim().length >= 2 && (
            <div className="absolute right-0 top-11 z-50 max-h-96 w-[26rem] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-2xl">
              {suggestions.length === 0 && (
                <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                  <SearchX className="size-4" /> No matches for “{q}”
                </p>
              )}
              {grouped.map((g) => (
                <div key={g.kind}>
                  <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {g.kind}s
                  </p>
                  {g.items.map((s, i) => (
                    <button
                      key={`${g.kind}-${i}`}
                      type="button"
                      onClick={() => pick(s)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted"
                    >
                      <span className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                        s.kind === 'Conflict' ? 'bg-conflict/15 text-conflict' : 'bg-primary/10 text-primary',
                      )}>
                        {s.kind}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">{s.sub}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>

        <NotificationBell />

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-muted"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span
              className={cn(
                'flex size-8 items-center justify-center overflow-hidden rounded-full text-xs font-semibold text-white',
                isAdmin ? 'bg-conflict' : 'bg-primary',
              )}
            >
              {role.slice(0, 2).toUpperCase()}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-sm font-medium">{role}</span>
              <span className="block text-xs text-muted-foreground">{email}</span>
            </span>
            <ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-popover p-1.5 shadow-lg"
              role="menu"
            >
              <div className="border-b border-border px-3 py-2">
                <p className="text-sm font-medium">{role}</p>
                <p className="truncate text-xs text-muted-foreground">{email}</p>
              </div>
              <div className="py-1">
                {['Profile settings', 'Notification preferences', 'Help & support'].map((i) => (
                  <button
                    key={i}
                    type="button"
                    className="w-full rounded-md px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                    role="menuitem"
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
