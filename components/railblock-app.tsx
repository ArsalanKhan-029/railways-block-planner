'use client'

import { AppSidebar } from '@/components/app-sidebar'
import { AppHeader } from '@/components/app-header'
import { DashboardView } from '@/components/views/dashboard-view'
import { BlockPlanningView } from '@/components/views/block-planning-view'
import { NetworkView } from '@/components/views/network-view'
import { AssetRegistryView } from '@/components/views/asset-registry-view'
import { ReportIssueView } from '@/components/views/report-issue-view'
import { AnalyticsView } from '@/components/views/analytics-view'
import { AdminView } from '@/components/views/admin-view'
import { DataConsoleView } from '@/components/views/data-console-view'
import { ScheduleView } from '@/components/views/schedule-view'
import { DriverView } from '@/components/views/driver-view'
import { SettingsView } from '@/components/views/settings-view'
import { LoginScreen } from '@/components/login-screen'
import { canAccess, type ViewId } from '@/lib/nav'
import { AppShellProvider, useAppShell, type SearchTarget } from '@/lib/app-shell'
import { RailDataProvider } from '@/lib/use-rail-data'
import { NotificationsProvider, NotificationToasts } from '@/lib/notifications'
import { RailAIWidget } from '@/components/railai-widget'
import { useAuth, profileToRole } from '@/lib/auth'
import type { Role } from '@/lib/mock-data'
import { useEffect, useState } from 'react'

const TITLES: Record<ViewId, string> = {
  dashboard: 'Operations Dashboard',
  planning: 'Block Planning & Conflict Center',
  network: 'Network View — Live Train Map',
  assets: 'Asset Registry',
  schedule: 'Schedule Management',
  report: 'Report an Issue',
  analytics: 'Analytics & Reports',
  admin: 'User Management',
  data: 'Data Console',
  driver: 'My Train',
  settings: 'Settings',
}

/** Which page each search-result kind lands on. */
const TARGET_VIEW: Record<SearchTarget['kind'], ViewId> = {
  train: 'network',
  station: 'network',
  section: 'network',
  conflict: 'planning',
  asset: 'assets',
  complaint: 'report',
  user: 'admin',
}

function Shell() {
  const { identity, ready, signOut } = useAuth()
  const { target, go, clearTarget, setView: setShellView } = useAppShell()
  // Drivers land on their own console; everyone else on the ops dashboard.
  const [view, setView] = useState<ViewId>('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)

  // One-time landing per session: route drivers to My Train.
  useEffect(() => {
    if (identity?.role === 'driver') setView('driver')
  }, [identity?.role])

  // Route protection: nothing renders until the session check completes, and
  // an unauthenticated visitor always gets the login screen.
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!identity) {
    return <LoginScreen />
  }

  const role: Role = profileToRole(identity.role) as Role
  const displayName = identity.name
  const email = identity.email

  function navigate(next: ViewId) {
    setView(next)
    setShellView(next)
    setMobileOpen(false)
  }

  // Search intent: switch to the right page, then hand over the payload.
  function handleSearchNavigate(t: SearchTarget) {
    const next = TARGET_VIEW[t.kind]
    // respect role guards — fall back to dashboard if not permitted
    setView(canAccess(next, role) ? next : 'dashboard')
    // defer so the target view mounts before consuming the intent
    setTimeout(() => go(t), 0)
  }

  // Guard: if current view is not accessible to the role, fall back to dashboard
  const activeView: ViewId = canAccess(view, role) ? view : 'dashboard'

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar
        role={role}
        active={activeView}
        onNavigate={navigate}
        onLogout={signOut}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          role={role}
          email={displayName}
          title={TITLES[activeView]}
          onOpenMobile={() => setMobileOpen(true)}
          onNavigateSearch={handleSearchNavigate}
        />
        <main className="flex-1 p-4 lg:p-6">
          {activeView === 'dashboard' && <DashboardView />}
          {activeView === 'planning' && (
            <BlockPlanningView
              focusBlockId={target?.kind === 'conflict' ? target.block.id : null}
              onConsumeFocus={clearTarget}
            />
          )}
          {activeView === 'network' && <NetworkView />}
          {activeView === 'assets' && <AssetRegistryView />}
          {activeView === 'schedule' && <ScheduleView />}
          {activeView === 'report' && <ReportIssueView />}
          {activeView === 'analytics' && <AnalyticsView />}
          {activeView === 'admin' && <AdminView />}
          {activeView === 'data' && <DataConsoleView />}
          {activeView === 'driver' && identity && <DriverView identity={identity} />}
          {activeView === 'settings' && (
            <SettingsView role={role} email={email} displayName={displayName} />
          )}
        </main>
      </div>
      <RailAIWidget />
    </div>
  )
}

export function RailblockApp() {
  const { ready, identity } = useAuth()
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }
  const role = identity ? (profileToRole(identity.role) as Role) : 'Viewer'
  return (
    <AppShellProvider role={role}>
      <RailDataProvider>
        <NotificationsProvider userId={identity ? identity.userId : 'anonymous'}>
          <Shell />
          <NotificationToasts />
        </NotificationsProvider>
      </RailDataProvider>
    </AppShellProvider>
  )
}
