'use client'

import { useState } from 'react'
import { Bell, Globe, ShieldCheck } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type { Role } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

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

export function SettingsView({ role, email }: { role: Role; email: string }) {
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
            <Input id="s-name" defaultValue="Arjun Mehta" />
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
      </div>
    </div>
  )
}
