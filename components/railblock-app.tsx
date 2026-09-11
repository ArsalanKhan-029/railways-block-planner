'use client'

import { useState } from 'react'
import { LoginScreen } from '@/components/login-screen'
import { AppSidebar } from '@/components/app-sidebar'
import { AppHeader } from '@/components/app-header'
import { DashboardView } from '@/components/views/dashboard-view'
import { BlockPlanningView } from '@/components/views/block-planning-view'
import { ReportIssueView } from '@/components/views/report-issue-view'
import { AnalyticsView } from '@/components/views/analytics-view'
import { AdminView } from '@/components/views/admin-view'
import { SettingsView } from '@/components/views/settings-view'
import { canAccess, type ViewId } from '@/lib/nav'
import type { Role } from '@/lib/mock-data'

const TITLES: Record<ViewId, string> = {
  dashboard: 'Operations Dashboard',
  planning: 'Block Planning & Conflict Center',
  report: 'Report an Issue',
  analytics: 'Analytics & Reports',
  admin: 'User Management',
  settings: 'Settings',
}

export function RailblockApp() {
  const [auth, setAuth] = useState<{ role: Role; email: string } | null>(null)
  const [view, setView] = useState<ViewId>('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)

  if (!auth) {
    return (
      <LoginScreen
        onLogin={(role, email) => {
          setAuth({ role, email })
          setView('dashboard')
        }}
      />
    )
  }

  function navigate(next: ViewId) {
    setView(next)
    setMobileOpen(false)
  }

  // Guard: if current view is not accessible to the role, fall back to dashboard
  const activeView: ViewId = canAccess(view, auth.role) ? view : 'dashboard'

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar
        role={auth.role}
        active={activeView}
        onNavigate={navigate}
        onLogout={() => setAuth(null)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          role={auth.role}
          email={auth.email}
          title={TITLES[activeView]}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <main className="flex-1 p-4 lg:p-6">
          {activeView === 'dashboard' && <DashboardView />}
          {activeView === 'planning' && <BlockPlanningView />}
          {activeView === 'report' && <ReportIssueView />}
          {activeView === 'analytics' && <AnalyticsView />}
          {activeView === 'admin' && <AdminView />}
          {activeView === 'settings' && <SettingsView role={auth.role} email={auth.email} />}
        </main>
      </div>
    </div>
  )
}
