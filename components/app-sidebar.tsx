'use client'

import { TrainFront, LogOut, X, Circle } from 'lucide-react'
import { NAV_ITEMS, type ViewId } from '@/lib/nav'
import type { Role } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

interface AppSidebarProps {
  role: Role
  active: ViewId
  onNavigate: (view: ViewId) => void
  onLogout: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
}

export function AppSidebar({
  role,
  active,
  onNavigate,
  onLogout,
  mobileOpen,
  onCloseMobile,
}: AppSidebarProps) {
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role))

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-foreground/40 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-300 lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2 px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <TrainFront className="size-4.5" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-white">RailMind</p>
              <p className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
                Block Planning
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-md p-1 text-sidebar-foreground/70 hover:bg-sidebar-accent lg:hidden"
            aria-label="Close menu"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
            Operations
          </p>
          {items.map((item) => {
            const Icon = item.icon
            const isActive = active === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="size-4.5 shrink-0" />
                {item.label}
                {item.id === 'admin' && (
                  <span className="ml-auto rounded bg-conflict/20 px-1.5 py-0.5 text-[10px] font-semibold text-conflict">
                    Admin
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-sidebar-accent px-3 py-2">
            <Circle className="size-2 fill-approved text-approved" />
            <span className="text-xs text-sidebar-foreground/80">
              AI Planner <span className="font-medium text-white">online</span>
            </span>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-white"
          >
            <LogOut className="size-4.5" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
