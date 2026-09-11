'use client'

import { useState } from 'react'
import { Search, Bell, Menu, ChevronDown, ShieldAlert } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { Role } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

interface AppHeaderProps {
  role: Role
  email: string
  title: string
  onOpenMobile: () => void
}

const ROLE_INITIALS: Record<Role, string> = {
  Admin: 'AM',
  'Section Controller': 'SC',
  'Maintenance Engineer': 'ME',
  Viewer: 'VW',
}

export function AppHeader({ role, email, title, onOpenMobile }: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isAdmin = role === 'Admin'

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

      <h1 className="text-base font-semibold tracking-tight">{title}</h1>

      {isAdmin && (
        <span className="hidden items-center gap-1 rounded-full border border-conflict/30 bg-conflict/10 px-2 py-0.5 text-xs font-medium text-conflict sm:inline-flex">
          <ShieldAlert className="size-3" />
          Admin mode
        </span>
      )}

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search sections, trains, blocks…"
            className="h-9 w-56 pl-8 lg:w-72"
            aria-label="Search"
          />
        </div>

        <button
          type="button"
          className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Notifications — 3 new alerts"
        >
          <Bell className="size-5" />
          <span className="absolute right-1.5 top-1.5 flex size-2 items-center justify-center">
            <span className="absolute inline-flex size-2 animate-ping rounded-full bg-conflict/70" />
            <span className="relative inline-flex size-2 rounded-full bg-conflict" />
          </span>
        </button>

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
                'flex size-8 items-center justify-center rounded-full text-xs font-semibold text-white',
                isAdmin ? 'bg-conflict' : 'bg-primary',
              )}
            >
              {ROLE_INITIALS[role]}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-sm font-medium">{role}</span>
              <span className="block text-xs text-muted-foreground">Signed in</span>
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
