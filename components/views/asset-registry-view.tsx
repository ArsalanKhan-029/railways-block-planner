'use client'

import { useMemo, useState } from 'react'
import {
  Boxes,
  Plus,
  X,
  Loader2,
  Search,
  Cpu,
  Pencil,
  Trash2,
  CircleAlert,
  CircleCheck,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { ConfirmDelete } from '@/components/confirm-delete'
import { useAuth } from '@/lib/auth'
import {
  deleteAsset,
  insertAsset,
  updateAsset,
} from '@/lib/api'
import type { AssetRow, AssetStatus } from '@/lib/types'
import { useRailData } from '@/lib/use-rail-data'
import { cn } from '@/lib/utils'

const STATUS_META: Record<AssetStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' }> = {
  operational: { label: 'Operational', variant: 'success' },
  degraded: { label: 'Degraded', variant: 'warning' },
  maintenance: { label: 'In Maintenance', variant: 'info' },
  offline: { label: 'Offline', variant: 'danger' },
}

const ASSET_TYPES = [
  'machine',
  'vehicle',
  'track',
  'signal',
  'overhead',
  'bridge',
  'gate',
  'point',
  'safety',
  'equipment',
  'lighting',
]

function HealthBar({ score }: { score: number }) {
  const tone = score >= 85 ? 'bg-approved' : score >= 65 ? 'bg-pending-foreground' : 'bg-conflict'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${score}%` }} />
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{score}</span>
    </div>
  )
}

function AssetForm({
  initial,
  sections,
  onDone,
  onCancel,
}: {
  initial?: AssetRow
  sections: { id: string; name: string }[]
  onDone: () => void
  onCancel: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const sectionId = String(fd.get('section') || '')
    const input = {
      section_id: sectionId || null,
      asset_code: String(fd.get('code') || '').trim(),
      name: String(fd.get('name') || '').trim(),
      asset_type: String(fd.get('type') || 'equipment'),
      status: String(fd.get('status') || 'operational') as AssetStatus,
      health_score: Math.max(0, Math.min(100, Number(fd.get('health') || 100))),
      last_serviced_at: String(fd.get('serviced') || '') || null,
    }
    if (!input.asset_code || !input.name) return

    setSaving(true)
    setError(null)
    const { error: err } = initial
      ? await updateAsset(initial.id, input)
      : await insertAsset(input)
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="a-code">Asset code</Label>
          <Input id="a-code" name="code" defaultValue={initial?.asset_code} placeholder="e.g. RGM-08" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="a-type">Type</Label>
          <Select id="a-type" name="type" defaultValue={initial?.asset_type ?? 'equipment'}>
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="a-name">Name</Label>
        <Input id="a-name" name="name" defaultValue={initial?.name} placeholder="e.g. Rail grinding machine" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="a-section">Section</Label>
        <Select id="a-section" name="section" defaultValue={initial?.section_id ?? ''}>
          <option value="">— Network-wide (no section) —</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="a-status">Status</Label>
          <Select id="a-status" name="status" defaultValue={initial?.status ?? 'operational'}>
            {Object.entries(STATUS_META).map(([value, m]) => (
              <option key={value} value={value}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="a-health">Health</Label>
          <Input
            id="a-health"
            name="health"
            type="number"
            min={0}
            max={100}
            defaultValue={initial?.health_score ?? 100}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="a-serviced">Last serviced</Label>
          <Input
            id="a-serviced"
            name="serviced"
            type="date"
            defaultValue={initial?.last_serviced_at ?? ''}
          />
        </div>
      </div>
      {error && <p className="text-xs text-conflict">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" className="flex-1" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {initial ? 'Save changes' : 'Register asset'}
        </Button>
        <Button type="button" size="sm" variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export function AssetRegistryView() {
  const { assets, sections, trains, assetsAvailable, refresh, loading } = useRailData()
  const { identity } = useAuth()
  // Registering/editing/deleting assets is admin-reserved; everyone else gets
  // the same read-only registry view.
  const canManage = identity?.role === 'admin'
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | AssetStatus>('all')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<AssetRow | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AssetRow | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return assets.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false
      if (!q) return true
      const section = sections.find((s) => s.id === a.section_id)?.name ?? ''
      return (
        a.name.toLowerCase().includes(q) ||
        a.asset_code.toLowerCase().includes(q) ||
        a.asset_type.toLowerCase().includes(q) ||
        section.toLowerCase().includes(q)
      )
    })
  }, [assets, sections, query, statusFilter])

  const stats = useMemo(() => {
    const by = (s: AssetStatus) => assets.filter((a) => a.status === s).length
    const avg = assets.length
      ? Math.round(assets.reduce((acc, a) => acc + a.health_score, 0) / assets.length)
      : 0
    return { operational: by('operational'), degraded: by('degraded'), maintenance: by('maintenance'), offline: by('offline'), avg }
  }, [assets])

  async function remove(a: AssetRow) {
    const { error } = await deleteAsset(a.id)
    if (!error) refresh()
  }

  if (!assetsAvailable) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-3 rounded-lg border border-pending/40 bg-pending/10 p-4">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-pending-foreground" />
            <div>
              <p className="text-sm font-semibold">Assets table not found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Run <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">supabase/migration_auth_assets.sql</code>{' '}
                in the Supabase SQL Editor to create the <code className="font-mono text-xs">assets</code> table.
                Everything else keeps working — this page lights up as soon as the table exists.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        {[
          { label: 'Total assets', value: assets.length, icon: Boxes, tone: 'text-primary bg-primary/10' },
          { label: 'Operational', value: stats.operational, icon: CircleCheck, tone: 'text-approved bg-approved/10' },
          { label: 'Degraded', value: stats.degraded, icon: CircleAlert, tone: 'text-pending-foreground bg-pending/25' },
          { label: 'Offline', value: stats.offline, icon: CircleAlert, tone: 'text-conflict bg-conflict/10' },
          { label: 'Avg health', value: `${stats.avg}%`, icon: Cpu, tone: 'text-primary bg-primary/10' },
        ].map((s) => {
          const Icon = s.icon
          return (
            <Card key={s.label}>
              <CardContent className="flex items-center gap-3 p-4">
                <span className={cn('flex size-9 items-center justify-center rounded-lg', s.tone)}>
                  <Icon className="size-4.5" />
                </span>
                <div>
                  <p className="text-lg font-semibold leading-tight">{loading ? '…' : s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* AI planner tie-in */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Cpu className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">AI planner reads this registry</p>
            <p className="text-sm text-muted-foreground">
              Assets marked <Badge variant="warning" className="mx-1 px-1.5 py-0 text-[10px]">Degraded</Badge>
              or with health &lt; 65 are prioritised for maintenance blocks; assets
              <Badge variant="info" className="mx-1 px-1.5 py-0 text-[10px]">In Maintenance</Badge>
              are excluded from scheduling conflicts.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search assets…"
            className="h-9 w-64 pl-8"
            aria-label="Search assets"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | AssetStatus)}
          className="h-9 w-44"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {Object.entries(STATUS_META).map(([value, m]) => (
            <option key={value} value={value}>
              {m.label}
            </option>
          ))}
        </Select>
        {canManage ? (
          <Button className="ml-auto" onClick={() => setAdding(true)}>
            <Plus />
            Register asset
          </Button>
        ) : (
          <span className="ml-auto text-xs text-muted-foreground">Read-only — asset management is admin-reserved.</span>
        )}
      </div>

      {/* Inline add form */}
      {adding && (
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">New asset</h2>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="max-w-2xl">
              <AssetForm
                sections={sections}
                onCancel={() => setAdding(false)}
                onDone={() => {
                  setAdding(false)
                  refresh()
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Asset</th>
                  <th className="px-3 py-3 font-medium">Type</th>
                  <th className="px-3 py-3 font-medium">Section</th>
                  <th className="px-3 py-3 font-medium">Assigned train</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Health</th>
                  <th className="px-3 py-3 font-medium">Last serviced</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((a) => {
                  const meta = STATUS_META[a.status] ?? STATUS_META.operational
                  const section = sections.find((s) => s.id === a.section_id)
                  return (
                    <tr key={a.id} className="hover:bg-muted/40">
                      <td className="px-5 py-3">
                        <p className="font-medium">{a.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{a.asset_code}</p>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline">{a.asset_type}</Badge>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {section ? section.name.replace(' Section', '') : '—'}
                      </td>
                      <td className="px-3 py-3">
                        {(() => {
                          const tr = a.train_id ? trains.find((t) => t.id === a.train_id) : null
                          return tr ? (
                            <span className="font-mono text-xs">
                              {tr.train_number} <span className="font-sans text-muted-foreground">· {tr.name.slice(0, 22)}</span>
                            </span>
                          ) : '—'
                        })()}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <HealthBar score={a.health_score} />
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {a.last_serviced_at
                          ? new Date(a.last_serviced_at + 'T00:00:00').toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={canManage ? () => setEditing(a) : undefined}
                            disabled={!canManage}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label={`Edit ${a.name}`}
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={canManage ? () => setPendingDelete(a) : undefined}
                            disabled={!canManage}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-conflict/10 hover:text-conflict"
                            aria-label={`Delete ${a.name}`}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-sm text-muted-foreground">
                      {assets.length === 0
                        ? 'No assets registered yet — add the first one.'
                        : 'No assets match the current filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-[1px]" onClick={() => setEditing(null)} />
          <div className="relative w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">Edit asset</h2>
                <p className="font-mono text-xs text-muted-foreground">{editing.asset_code}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5">
              <AssetForm
                initial={editing}
                sections={sections}
                onCancel={() => setEditing(null)}
                onDone={() => {
                  setEditing(null)
                  refresh()
                }}
              />
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <ConfirmDelete
          name={pendingDelete.name}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            await remove(pendingDelete)
            setPendingDelete(null)
          }}
        />
      )}
    </div>
  )
}
