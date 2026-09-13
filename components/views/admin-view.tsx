'use client'

import { useMemo, useState } from 'react'
import {
  UserPlus,
  X,
  ShieldAlert,
  ScrollText,
  Users,
  Settings2,
  Tags,
  Plus,
  Trash2,
  Loader2,
  KeyRound,
  Copy,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { AUDIT_LOG, type ManagedUser } from '@/lib/mock-data'
import { toManagedUsers } from '@/lib/mappers'
import { useRoles, roleInitials, roleBlurb } from '@/lib/roles'
import {
  createAuthUser,
  insertUserWithAuth,
  resetAuthPassword,
  setUserAccess,
  updateUserRole,
  updateUserSections,
  updateUserStatus,
  toAuthEmail,
} from '@/lib/api'
import { useRailData } from '@/lib/use-rail-data'
import type { UserRow, RoleRow } from '@/lib/types'
import { cn } from '@/lib/utils'

const STATUS_VARIANT = { Active: 'success', Pending: 'warning', Revoked: 'danger' } as const

type Tab = 'users' | 'roles' | 'audit' | 'settings'

/** Built-in display names keep snake_case DB ids; custom roles store verbatim. */
function toDbRole(displayName: string): string {
  switch (displayName) {
    case 'Admin':
      return 'admin'
    case 'Section Controller':
      return 'section_controller'
    case 'Maintenance Engineer':
      return 'maintenance_engineer'
    case 'Viewer':
      return 'viewer'
    default:
      return displayName
  }
}

export function AdminView() {
  const { sections, users, trains, refresh, loading } = useRailData()
  const { roles, rows: roleRows, available: rolesAvailable, addRole, removeRole } = useRoles()
  const [tab, setTab] = useState<Tab>('users')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [credFor, setCredFor] = useState<UserRow | null>(null)

  const managed: ManagedUser[] = useMemo(
    () => toManagedUsers(users, sections),
    [users, sections],
  )

  async function changeRole(id: string, roleName: string) {
    // DB stores the role name verbatim; built-ins keep their snake_case ids
    const dbRole = toDbRole(roleName)
    const { error } = await updateUserRole(id, dbRole as never)
    if (!error) refresh()
  }

  async function cycleStatus(u: ManagedUser) {
    const order = ['Active', 'Pending', 'Revoked'] as const
    const next = order[(order.indexOf(u.status) + 1) % 3].toLowerCase() as
      | 'active'
      | 'pending'
      | 'revoked'
    // Users with a real auth account are banned/unbanned in Supabase Auth so
    // the change actually blocks sign-in; rows without one are table-only.
    const row = users.find((r) => r.id === u.id)
    if (row?.auth_user_id) {
      const res = await setUserAccess(u.id, next === 'revoked')
      if (!res.ok) return
    } else {
      const { error } = await updateUserStatus(u.id, next)
      if (error) return
    }
    refresh()
  }

  async function toggleSection(u: ManagedUser, sectionId: string) {
    const next = u.sectionIds.includes(sectionId)
      ? u.sectionIds.filter((id) => id !== sectionId)
      : [...u.sectionIds, sectionId]
    const { error } = await updateUserSections(u.id, next)
    if (!error) refresh()
  }

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: 'users', label: 'User Management', icon: Users },
    { id: 'roles', label: 'Roles', icon: Tags },
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
                <p className="text-sm text-muted-foreground">
                  {loading ? '…' : `${managed.length} accounts`}
                </p>
              </div>
              <Button onClick={() => setInviteOpen(true)}>
                <UserPlus />
                Create User
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-3 py-3 font-medium">Login</th>
                    <th className="px-3 py-3 font-medium">Role</th>
                    <th className="px-3 py-3 font-medium">Assigned Sections</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {managed.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/40">
                      <td className="px-5 py-3">
                        <p className="font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </td>
                      <td className="px-3 py-3">
                        <CredentialCell user={users.find((r) => r.id === u.id)} onManage={setCredFor} />
                      </td>
                      <td className="px-3 py-3">
                        <Select
                          value={u.role}
                          onChange={(e) => changeRole(u.id, e.target.value)}
                          className="h-8 w-44"
                          aria-label={`Role for ${u.name}`}
                        >
                          {roles.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex max-w-md flex-wrap gap-1">
                          {sections.map((s) => {
                            const on = u.sectionIds.includes(s.id)
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => toggleSection(u, s.id)}
                                title={on ? 'Click to unassign' : 'Click to assign'}
                              >
                                <Badge variant={on ? 'neutral' : 'outline'}>
                                  {s.name.replace(' Section', '')}
                                </Badge>
                              </button>
                            )
                          })}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <button type="button" onClick={() => cycleStatus(u)}>
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

      {tab === 'roles' && (
        <RolesManager
          rows={roleRows}
          available={rolesAvailable}
          users={managed}
          addRole={addRole}
          removeRole={removeRole}
        />
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

      {inviteOpen && (
        <CreateUserModal
          sections={sections}
          roles={roles}
          trains={trains.map((t) => ({ train_number: t.train_number, name: t.name }))}
          onClose={() => setInviteOpen(false)}
          onCreated={refresh}
        />
      )}

      {credFor && (
        <CredentialModal
          user={credFor}
          onClose={() => setCredFor(null)}
          onSaved={() => {
            setCredFor(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

/** Login column: shows the username if a credential exists, else an issue button. */
function CredentialCell({
  user,
  onManage,
}: {
  user?: UserRow
  onManage: (u: UserRow) => void
}) {
  if (!user) return <span className="text-xs text-muted-foreground">—</span>
  const hasCred = !!user.auth_user_id
  const handle = user.email.replace(/@railmind\.app$/, '')
  return (
    <div className="flex items-center gap-2">
      {hasCred ? (
        <>
          <span className="font-mono text-xs">{handle}</span>
          <button
            type="button"
            onClick={() => onManage(user)}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Manage password"
            aria-label={`Manage credential for ${user.name}`}
          >
            <KeyRound className="size-3.5" />
          </button>
        </>
      ) : (
        <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-xs" onClick={() => onManage(user)}>
          <KeyRound className="size-3.5" />
          Issue login
        </Button>
      )}
    </div>
  )
}

/** Issue / reset / revoke a username+password for a user. */
function CredentialModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserRow
  onClose: () => void
  onSaved: () => void
}) {
  const existing = !!user.auth_user_id
  const handle = user.email.replace(/@railmind\.app$/, '')
  const [username, setUsername] = useState(handle)
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function generatePw() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    let out = ''
    const arr = new Uint32Array(10)
    crypto.getRandomValues(arr)
    for (let i = 0; i < 10; i++) out += chars[arr[i] % chars.length]
    return out
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = existing
      ? await resetAuthPassword(user.id, password)
      : await createAuthUser({
          authEmail: toAuthEmail(username),
          password,
          user_id: user.id,
          name: user.name,
          sections: user.assigned_sections ?? [],
        })
    setSaving(false)
    if (!res.ok) {
      setError(res.error ?? 'Could not save the credential')
      return
    }
    setIssued({ username: toAuthEmail(username).replace(/@railmind\.app$/, ''), password })
  }

  async function handleRevoke() {
    setSaving(true)
    setError(null)
    const res = await setUserAccess(user.id, true)
    setSaving(false)
    if (res.ok) {
      onSaved()
    } else {
      setError(res.error ?? 'Could not revoke access')
    }
  }

  function copyAll() {
    if (!issued) return
    navigator.clipboard
      ?.writeText(`RailMind login\nUsername: ${issued.username}\nPassword: ${issued.password}`)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">
              {existing ? 'Manage login' : 'Issue login'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {user.name} · {user.email}
            </p>
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

        {issued ? (
          <div className="space-y-4 p-5">
            <div className="rounded-lg border border-approved/30 bg-approved/10 p-4">
              <p className="text-sm font-semibold text-approved">Credential created</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Share these with {user.name} — the password is not stored in a
                readable form, so this is the only time it is shown.
              </p>
            </div>
            <dl className="space-y-2 rounded-lg border border-border p-4 font-mono text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Username</dt>
                <dd>{issued.username}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Password</dt>
                <dd>{issued.password}</dd>
              </div>
            </dl>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 gap-2" onClick={copyAll}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? 'Copied' : 'Copy for sharing'}
              </Button>
              <Button size="sm" className="flex-1" onClick={onSaved}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form className="space-y-4 p-5" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cred-username">Username</Label>
              <Input
                id="cred-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. r.deshmukh"
                pattern="[a-zA-Z0-9._@-]+"
                title="Letters, numbers, dots, dashes, underscores — or a full email"
                disabled={existing}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cred-password">Password</Label>
              <div className="flex gap-2">
                <Input
                  id="cred-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPw ? 'text' : 'password'}
                  minLength={6}
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 px-2.5"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 px-2.5"
                  onClick={() => setPassword(generatePw())}
                  title="Generate a strong password"
                >
                  <KeyRound className="size-4" />
                </Button>
              </div>
            </div>
            {error && <p className="text-xs text-conflict">{error}</p>}
            <div className="flex gap-2 pt-1">
              <Button type="submit" className="flex-1" disabled={saving || !username || !password}>
                {saving && <Loader2 className="animate-spin" />}
                {existing ? 'Reset password' : 'Create login'}
              </Button>
              {existing && (
                <Button
                  type="button"
                  variant="outline"
                  className="text-conflict"
                  disabled={saving}
                  onClick={handleRevoke}
                >
                  Revoke
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {existing
                ? 'Resets the Supabase Auth password — the previous one stops working immediately.'
                : 'Creates a real Supabase Auth account, so this person can sign in right away.'}
            </p>
          </form>
        )}
      </div>
    </div>
  )
}

function GlobalSettings() {
  const { sections } = useRailData()
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
            {sections.map((s) => (
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

function CreateUserModal({
  sections,
  roles,
  trains,
  onClose,
  onCreated,
}: {
  sections: { id: string; name: string }[]
  roles: string[]
  trains: { train_number: string; name: string }[]
  onClose: () => void
  onCreated: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [trainQuery, setTrainQuery] = useState('')
  const [selectedTrain, setSelectedTrain] = useState<string | null>(null)
  const [role, setRole] = useState('Viewer')

  function generatePw() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    let out = ''
    const arr = new Uint32Array(10)
    crypto.getRandomValues(arr)
    for (let i = 0; i < 10; i++) out += chars[arr[i] % chars.length]
    return out
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const handle = String(fd.get('username') || '').trim().toLowerCase()
    const password = String(fd.get('password') || '')
    const name = String(fd.get('name') || '').trim() || handle
    const role = String(fd.get('role') || 'Viewer')
    const selected = fd.getAll('sections').map(String)
    if (!handle || !password) return

    setSaving(true)
    setError(null)
    const dbRole = toDbRole(role)
    if (dbRole === 'driver' && !selectedTrain) {
      setSaving(false)
      setError('Drivers must be assigned a train.')
      return
    }
    const res = await insertUserWithAuth({
      name,
      handle,
      password,
      role: dbRole as 'admin' | 'section_controller' | 'maintenance_engineer' | 'viewer',
      assigned_sections: selected,
    })
    if (res.ok && dbRole === 'driver' && selectedTrain) {
      // link the driver to their train after the staff row exists
      const { fetchUsers, updateUserTrain } = await import('@/lib/api')
      const rows = await fetchUsers()
      const created = rows.find((r) => r.email === toAuthEmail(handle))
      if (created) await updateUserTrain(created.id, selectedTrain)
    }
    setSaving(false)
    if (!res.ok) {
      setError(res.error ?? 'Could not create the user')
      return
    }
    setIssued({ username: handle, password })
  }

  function copyAll() {
    if (!issued) return
    navigator.clipboard
      ?.writeText(`RailMind login\nUsername: ${issued.username}\nPassword: ${issued.password}`)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Create User</h2>
            <p className="text-sm text-muted-foreground">Issues a real login — share the credentials</p>
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
        {issued ? (
          <div className="space-y-4 p-5">
            <div className="rounded-lg border border-approved/30 bg-approved/10 p-4">
              <p className="text-sm font-semibold text-approved">Login created</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Share these credentials — the password is not shown again.
              </p>
            </div>
            <dl className="space-y-2 rounded-lg border border-border p-4 font-mono text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Username</dt>
                <dd>{issued.username}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Password</dt>
                <dd>{issued.password}</dd>
              </div>
            </dl>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 gap-2" onClick={copyAll}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? 'Copied' : 'Copy for sharing'}
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => {
                  onCreated()
                  onClose()
                }}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form className="space-y-4 p-5" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-name">Full name</Label>
              <Input id="invite-name" name="name" placeholder="e.g. Priya Nair" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-username">Username</Label>
              <Input
                id="invite-username"
                name="username"
                placeholder="e.g. p.nair"
                pattern="[a-zA-Z0-9._-]+"
                title="Letters, numbers, dots, dashes and underscores"
                required
              />
              <p className="text-xs text-muted-foreground">
                Signs in as this handle (or the full handle@railmind.app email).
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-password">Temporary password</Label>
              <div className="flex gap-2">
                <Input
                  id="invite-password"
                  name="password"
                  type="text"
                  minLength={6}
                  placeholder="min. 6 characters"
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 px-2.5"
                  onClick={(e) => {
                    const input = e.currentTarget.parentElement?.querySelector('input') ?? null
                    if (input) input.value = generatePw()
                  }}
                  title="Generate a strong password"
                >
                  <KeyRound className="size-4" />
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <Select id="invite-role" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </div>
            {role === 'Driver' && (
              <DriverTrainPicker
                trains={trains}
                query={trainQuery}
                setQuery={setTrainQuery}
                selected={selectedTrain}
                setSelected={setSelectedTrain}
              />
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-section">Assigned sections</Label>
              <Select id="invite-section" name="sections" multiple className="h-auto min-h-24 py-2">
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">Hold Ctrl / Cmd to select multiple.</p>
            </div>
            {error && <p className="text-xs text-conflict">{error}</p>}
            <div className="flex gap-2 pt-1">
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving && <Loader2 className="animate-spin" />}
                Create user
              </Button>
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

/** Searchable train picker shown only when the Driver role is selected. */
function DriverTrainPicker({
  trains,
  query,
  setQuery,
  selected,
  setSelected,
}: {
  trains: { train_number: string; name: string }[]
  query: string
  setQuery: (v: string) => void
  selected: string | null
  setSelected: (v: string | null) => void
}) {
  const q = query.trim().toLowerCase()
  const matches = q
    ? trains.filter((t) => t.train_number.includes(q) || t.name.toLowerCase().includes(q)).slice(0, 6)
    : trains.slice(0, 6)
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Assigned train</Label>
      {selected ? (
        <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
          <span className="text-sm font-medium">{selected}</span>
          <button type="button" onClick={() => setSelected(null)} className="text-xs text-muted-foreground hover:text-foreground">
            change
          </button>
        </div>
      ) : (
        <>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search train number or name…" aria-label="Search trains" />
          <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
            {matches.map((t) => (
              <button
                key={t.train_number}
                type="button"
                onClick={() => { setSelected(t.train_number); setQuery('') }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="font-mono text-xs text-muted-foreground">{t.train_number}</span>{' '}
                <span className="ml-1">{t.name.slice(0, 40)}</span>
              </button>
            ))}
            {matches.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No trains match.</p>}
          </div>
        </>
      )}
    </div>
  )
}

function RolesManager({
  rows,
  available,
  users,
  addRole,
  removeRole,
}: {
  rows: RoleRow[]
  available: boolean
  users: ManagedUser[]
  addRole: (name: string) => Promise<{ ok: boolean; error?: string }>
  removeRole: (row: RoleRow) => Promise<{ ok: boolean; error?: string }>
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  if (!available) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm font-semibold">Roles table not found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Run <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">supabase/migration_auth_assets.sql</code>{' '}
            in the Supabase SQL Editor to enable custom role management.
          </p>
        </CardContent>
      </Card>
    )
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await addRole(name)
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? 'Could not add role')
      return
    }
    setName('')
  }

  async function handleRemove(row: RoleRow) {
    setBusy(true)
    setError(null)
    const res = await removeRole(row)
    setBusy(false)
    setConfirmId(null)
    if (!res.ok) setError(res.error ?? 'Could not delete role')
  }

  const userCount = (roleName: string) => users.filter((u) => u.role === roleName).length

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border p-5">
            <h2 className="text-sm font-semibold">Role catalog</h2>
            <p className="text-sm text-muted-foreground">
              Custom roles get the shared dashboards and issue reporting. Default roles cannot be deleted.
            </p>
          </div>
          <div className="divide-y divide-border">
            {rows.map((row) => {
              const count = userCount(row.name)
              return (
                <div key={row.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {roleInitials(row.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{row.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{roleBlurb(row.name)}</p>
                  </div>
                  <Badge variant={row.is_default ? 'info' : 'neutral'}>
                    {row.is_default ? 'Default' : 'Custom'}
                  </Badge>
                  <span className="hidden w-20 text-right text-xs text-muted-foreground sm:block">
                    {count} user{count === 1 ? '' : 's'}
                  </span>
                  {!row.is_default &&
                    (confirmId === row.id ? (
                      <span className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs text-conflict"
                          disabled={busy}
                          onClick={() => handleRemove(row)}
                        >
                          {busy ? <Loader2 className="size-3.5 animate-spin" /> : 'Confirm'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => setConfirmId(null)}
                        >
                          Keep
                        </Button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(row.id)}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-conflict/10 hover:text-conflict"
                        aria-label={`Delete role ${row.name}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ))}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Plus className="size-4" />
            </span>
            <h2 className="text-sm font-semibold">Add a role</h2>
          </div>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-role">Role name</Label>
              <Input
                id="new-role"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Yard Supervisor"
                required
              />
            </div>
            {error && <p className="text-xs text-conflict">{error}</p>}
            <Button type="submit" size="sm" className="w-full" disabled={busy || !name.trim()}>
              {busy && <Loader2 className="animate-spin" />}
              Create role
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            Deleting a custom role moves its users back to Viewer — nothing breaks.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
