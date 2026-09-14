'use client'

import { useEffect, useState } from 'react'
import { Bell, Globe, Loader2, Presentation, ShieldCheck } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type { Role } from '@/lib/mock-data'
import { useRailData } from '@/lib/use-rail-data'
import { usePush } from '@/lib/use-push'
import { enableDemoMode, disableDemoMode, getDemoModeState, type DemoModeState } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Real Web Push toggle — subscribes this device for out-of-app alerts. */
function PushToggle() {
  const { permission, enabled, busy, enable } = usePush()
  const on = enabled && permission === 'granted'
  const unsupported = permission === 'unsupported'
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3.5">
      <div>
        <p className="text-sm font-medium">Device notifications</p>
        <p className="text-xs text-muted-foreground">
          {unsupported
            ? 'Not supported in this browser'
            : on
              ? 'Subscribed — you receive alerts even with the app closed'
              : permission === 'denied'
                ? 'Blocked in browser settings — re-enable notifications for this site'
                : 'Enable Web Push for this device (recommended for drivers)'}
        </p>
      </div>
      <button
        type="button"
        disabled={unsupported || busy || on}
        onClick={() => enable()}
        role="switch"
        aria-checked={on}
        aria-label="Device notifications"
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50',
          on ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-background transition-transform',
            on ? 'translate-x-4.5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  )
}

function Toggle({ label, desc, defaultOn }: { label: string; desc: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(!!defaultOn)
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3.5 last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <button
        type="button"
        onClick={() => setOn((o) => !o)}
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          on ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform',
            on ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  )
}

export function SettingsView({ role, email, displayName }: { role: Role; email: string; displayName?: string }) {
  return (
    <div className="grid max-w-4xl grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Profile</h2>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-name">Display name</Label>
            <Input id="s-name" defaultValue={displayName ?? email.split('@')[0]} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-email">Email</Label>
            <Input id="s-email" defaultValue={email} readOnly />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-role">Role</Label>
            <Input id="s-role" defaultValue={role} readOnly />
          </div>
          <Button size="sm">Save profile</Button>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardContent className="p-5">
            <div className="mb-1 flex items-center gap-2">
              <Bell className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">Notifications</h2>
            </div>
            <PushToggle />
            <Toggle label="Conflict alerts" desc="Push when a new scheduling conflict is detected" defaultOn />
            <Toggle label="Block approvals" desc="Notify when your requests are approved" defaultOn />
            <Toggle label="Daily digest" desc="Summary of section activity at 06:00" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="mb-1 flex items-center gap-2">
              <Globe className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">Preferences</h2>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-border py-3.5">
              <div>
                <p className="text-sm font-medium">Timezone</p>
                <p className="text-xs text-muted-foreground">Used across all timelines</p>
              </div>
              <Select defaultValue="IST" className="h-8 w-36">
                <option value="IST">IST (UTC+5:30)</option>
                <option value="UTC">UTC</option>
              </Select>
            </div>
            <Toggle label="Compact tables" desc="Show denser data rows" />
            <Toggle label="Dark mode" desc="Control-room night theme" />
          </CardContent>
        </Card>

        {role === 'Admin' && <DemoModeCard />}
      </div>
    </div>
  )
}

/** Admin-only Demo Mode: non-destructively hides seeded data from all views
 * except the Network View map, for empty-state demos and walkthroughs. */
function DemoModeCard() {
  const { refresh } = useRailData()
  const [state, setState] = useState<DemoModeState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void getDemoModeState().then(setState)
  }, [])

  async function toggle(next: boolean) {
    setBusy(true)
    const s = next ? await enableDemoMode() : await disableDemoMode()
    setState(s)
    setBusy(false)
    refresh() // provider refetch — views now show/hide flagged rows
  }

  const enabled = state?.enabled ?? false
  const counts = state?.hiddenCounts
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-1 flex items-center gap-2">
          <Presentation className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Demo Mode</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Temporarily hides seeded trains, blocks, complaints and assets from every view except the Network
          View map. Nothing is deleted — data is flagged and fully restorable. Anything you create while Demo
          Mode is on stays visible for the walkthrough.
        </p>
        <div className="mt-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{enabled ? 'Demo Mode is ON' : 'Demo Mode is off'}</p>
            {counts && (
              <p className="text-xs text-muted-foreground">
                {counts.trains} trains · {counts.blocks} blocks · {counts.complaints} complaints · {counts.assets}{' '}assets
                {enabled ? ' hidden (restorable)' : ' restored'}
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant={enabled ? 'destructive' : 'default'}
            disabled={busy || !state}
            onClick={() => void toggle(!enabled)}
          >
            {busy && <Loader2 className="animate-spin" />}
            {enabled ? 'Disable & restore data' : 'Enable Demo Mode'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
