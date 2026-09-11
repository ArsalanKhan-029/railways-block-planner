'use client'

import { useState } from 'react'
import { UserPlus, X, ShieldAlert, ScrollText, Users, Settings2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { USERS, AUDIT_LOG, SECTIONS, type Role, type ManagedUser } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const ROLES: Role[] = ['Admin', 'Section Controller', 'Maintenance Engineer', 'Viewer']
const STATUS_VARIANT = { Active: 'success', Pending: 'warning', Revoked: 'danger' } as const

type Tab = 'users' | 'audit' | 'settings'

export function AdminView() {
  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<ManagedUser[]>(USERS)
  const [inviteOpen, setInviteOpen] = useState(false)

  function cycleStatus(id: string) {
    const order: ManagedUser['status'][] = ['Active', 'Pending', 'Revoked']
    setUsers((prev) =>
      prev.map((u) =>
        u.id === id ? { ...u, status: order[(order.indexOf(u.status) + 1) % 3] } : u,
      ),
    )
  }

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: 'users', label: 'User Management', icon: Users },
    { id: 'audit', label: 'Audit Log', icon: ScrollText },
    { id: 'settings', label: 'Global Settings', icon: Settings2 },
  ]

  return (
    <div className="space-y-6">
      {/* Admin banner */}
      <div className="flex items-center gap-3 rounded-xl border border-conflict/30 bg-conflict/5 p-4">
        <span className="flex size-9 items-center justify-center rounded-lg bg-conflict/15 text-conflict">
          <ShieldAlert className="size-5" />
        </span>
        <div>
          <p className="text-sm font-semibold">Administrator area</p>
          <p className="text-sm text-muted-foreground">
            Changes here are logged to the audit trail and affect all sections.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        {tabs.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                tab === t.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'users' && (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div>
                <h2 className="text-sm font-semibold">Users</h2>
                <p className="text-sm text-muted-foreground">{users.length} accounts</p>
              </div>
              <Button onClick={() => setInviteOpen(true)}>
                <UserPlus />
                Invite User
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-3 py-3 font-medium">Role</th>
                    <th className="px-3 py-3 font-medium">Assigned Sections</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/40">
                      <td className="px-5 py-3">
                        <p className="font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </td>
                      <td className="px-3 py-3">
                        <Select
                          defaultValue={u.role}
                          className="h-8 w-44"
                          aria-label={`Role for ${u.name}`}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.sections.map((s) => (
                            <Badge key={s} variant="neutral">
                              {s.replace(' Section', '')}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <button type="button" onClick={() => cycleStatus(u.id)}>
                          <Badge variant={STATUS_VARIANT[u.status]}>{u.status}</Badge>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'audit' && (
        <Card>
          <CardContent className="p-0">
            <div className="border-b border-border p-5">
              <h2 className="text-sm font-semibold">Audit Log</h2>
              <p className="text-sm text-muted-foreground">Recent administrative &amp; planner actions</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Timestamp</th>
                    <th className="px-3 py-3 font-medium">User</th>
                    <th className="px-3 py-3 font-medium">Action</th>
                    <th className="px-5 py-3 font-medium">Reason / note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {AUDIT_LOG.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/40">
                      <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-muted-foreground">
                        {a.timestamp}
                      </td>
                      <td className="px-3 py-3 font-medium">{a.user}</td>
                      <td className="px-3 py-3">
                        <Badge variant="info">{a.action}</Badge>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{a.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'settings' && <GlobalSettings />}

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
    </div>
  )
}

function GlobalSettings() {
  const [weights, setWeights] = useState([
    { key: 'punctuality', label: 'Punctuality', value: 60 },
    { key: 'throughput', label: 'Maintenance Throughput', value: 30 },
    { key: 'cost', label: 'Cost', value: 10 },
  ])

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <h2 className="text-sm font-semibold">Default Optimisation Weights</h2>
            <p className="text-sm text-muted-foreground">Applied to new planning runs org-wide</p>
          </div>
          {weights.map((w, idx) => (
            <div key={w.key} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{w.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{w.value}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={w.value}
                onChange={(e) =>
                  setWeights((prev) =>
                    prev.map((q, i) => (i === idx ? { ...q, value: Number(e.target.value) } : q)),
                  )
                }
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full accent-primary"
                style={{
                  background: `linear-gradient(to right, var(--primary) ${w.value}%, var(--muted) ${w.value}%)`,
                }}
              />
            </div>
          ))}
          <Button size="sm">Save defaults</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div>
            <h2 className="text-sm font-semibold">Section List Management</h2>
            <p className="text-sm text-muted-foreground">Sections monitored by the planner</p>
          </div>
          <div className="space-y-2">
            {SECTIONS.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.code}</p>
                </div>
                <Badge variant="success">Active</Badge>
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline">
            Add section
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function InviteModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Invite User</h2>
            <p className="text-sm text-muted-foreground">Send an access invitation by email</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault()
            onClose()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" placeholder="name@ir.gov.in" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select id="invite-role" defaultValue="Viewer">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-section">Assigned sections</Label>
            <Select id="invite-section" multiple className="h-auto min-h-24 py-2">
              {SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">Hold Ctrl / Cmd to select multiple.</p>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1">
              Send invite
            </Button>
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
