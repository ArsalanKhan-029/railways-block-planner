'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  Database, Loader2, Trash2, Pencil, Plus, X, TriangleAlert, Ban, ShieldCheck,
} from 'lucide-react'
import { useRailData } from '@/lib/use-rail-data'
import {
  deleteAsset, deleteBlock, deleteComplaint, deleteSection, deleteStation, deleteTrain,
  insertSection, insertStation, insertTrain, updateSection, updateStation, updateTrain,
  updateBlockStatus, updateAsset, setSectionConflict,
} from '@/lib/api'
import type { BlockStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Data Console — admin-only CRUD over every table: sections, stations,
 * trains, assets, blocks, complaints. Destructive deletes require a typed
 * confirmation; manual conflict flags toggle straight from here.
 */

type Tab = 'sections' | 'stations' | 'trains' | 'assets' | 'blocks' | 'complaints'

const TABS: { id: Tab; label: string }[] = [
  { id: 'sections', label: 'Sections' },
  { id: 'stations', label: 'Stations' },
  { id: 'trains', label: 'Trains' },
  { id: 'assets', label: 'Assets' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'complaints', label: 'Complaints' },
]

/** Typed confirmation before any destructive delete. */
function ConfirmDelete({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  const [typed, setTyped] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-[1px]" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-xl border border-conflict/40 bg-card p-5 shadow-2xl">
        <div className="flex items-center gap-2 text-conflict">
          <TriangleAlert className="size-5" />
          <h2 className="text-base font-semibold">Delete “{name}”?</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          This permanently removes the row from Supabase. Type <span className="font-mono text-conflict">DELETE</span> to confirm.
        </p>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-3 font-mono" placeholder="DELETE" aria-label="Type DELETE to confirm" />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" variant="destructive" disabled={typed !== 'DELETE'} onClick={onConfirm}>Delete forever</Button>
        </div>
      </div>
    </div>
  )
}

export function DataConsoleView() {
  const data = useRailData()
  const { sections, stations, trains, assets, blocks, complaints, refresh, loading } = data
  const [tab, setTab] = useState<Tab>('sections')
  const [query, setQuery] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ kind: Tab; id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  const sectionById = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections])
  const q = query.trim().toLowerCase()

  async function run(fn: () => unknown) {
    setBusy(true)
    await fn()
    setBusy(false)
    refresh()
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    const { kind, id } = pendingDelete
    setPendingDelete(null)
    await run(() => {
      if (kind === 'sections') return deleteSection(id)
      if (kind === 'stations') return deleteStation(id)
      if (kind === 'trains') return deleteTrain(id)
      if (kind === 'assets') return deleteAsset(id)
      if (kind === 'blocks') return deleteBlock(id)
      return deleteComplaint(id)
    })
  }

  const filtered = useMemo<unknown[]>(() => {
    const match = <T extends object>(rows: T[], keys: string[]) =>
      !q ? rows : rows.filter((r) => keys.some((k) => String((r as Record<string, unknown>)[k] ?? '').toLowerCase().includes(q)))
    switch (tab) {
      case 'sections': return match(sections, ['name', 'code'])
      case 'stations': return match(stations, ['name', 'code', 'zone'])
      case 'trains': return match(trains, ['name', 'train_number'])
      case 'assets': return match(assets, ['name', 'asset_code', 'asset_type'])
      case 'blocks': return match(blocks, ['title', 'requested_by'])
      case 'complaints': return match(complaints, ['category', 'description', 'reported_by'])
    }
  }, [tab, q, sections, stations, trains, assets, blocks, complaints])

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Database className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Full data control</p>
            <p className="text-xs text-muted-foreground">
              Add, edit, and remove rows across every table. Destructive deletes ask for confirmation. Manual conflict flags appear on the Network View instantly.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Tabs + toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); setAdding(false); setEditing(null) }}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              tab === t.id ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {t.label}
            <span className="ml-1.5 text-xs opacity-60">
              {t.id === 'sections' ? sections.length : t.id === 'stations' ? stations.length : t.id === 'trains' ? trains.length : t.id === 'assets' ? assets.length : t.id === 'blocks' ? blocks.length : complaints.length}
            </span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Filter ${tab}…`} className="h-9 w-52" aria-label="Filter rows" />
          <Button size="sm" onClick={() => setAdding((v) => !v)}>
            {adding ? <X /> : <Plus />}
            {adding ? 'Close' : 'Add'}
          </Button>
        </div>
      </div>

      {/* Add forms (per tab) */}
      {adding && tab === 'sections' && (
        <InlineCard title="New section" onClose={() => setAdding(false)}>
          <form
            className="grid grid-cols-2 gap-3 md:grid-cols-4"
            onSubmit={async (e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              await run(() => insertSection({
                name: String(fd.get('name') || ''), code: String(fd.get('code') || '').toUpperCase(),
                from_station: String(fd.get('from') || '').toUpperCase() || null,
                to_station: String(fd.get('to') || '').toUpperCase() || null,
              }))
              setAdding(false)
            }}
          >
            <Field label="Name"><Input name="name" required placeholder="e.g. NDLS–JP Section" /></Field>
            <Field label="Code"><Input name="code" required placeholder="NDLS-JP" /></Field>
            <Field label="From station"><Input name="from" placeholder="NDLS" /></Field>
            <Field label="To station"><Input name="to" placeholder="JP" /></Field>
            <div className="col-span-2 md:col-span-4"><SubmitBtn /></div>
          </form>
        </InlineCard>
      )}
      {adding && tab === 'stations' && (
        <InlineCard title="New station" onClose={() => setAdding(false)}>
          <form
            className="grid grid-cols-2 gap-3 md:grid-cols-6"
            onSubmit={async (e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              await run(() => insertStation({
                code: String(fd.get('code') || '').toUpperCase(), name: String(fd.get('name') || ''),
                zone: String(fd.get('zone') || 'Indian Railways'), tier: String(fd.get('tier') || 'station'),
                latitude: Number(fd.get('lat') || 0), longitude: Number(fd.get('lng') || 0),
              }))
              setAdding(false)
            }}
          >
            <Field label="Code"><Input name="code" required placeholder="NDLS" /></Field>
            <Field label="Name"><Input name="name" required placeholder="New Delhi" /></Field>
            <Field label="Zone"><Input name="zone" placeholder="Northern" /></Field>
            <Field label="Tier">
              <Select name="tier" defaultValue="station">
                <option value="hub">hub</option>
                <option value="junction">junction</option>
                <option value="station">station</option>
              </Select>
            </Field>
            <Field label="Latitude"><Input name="lat" type="number" step="any" required /></Field>
            <Field label="Longitude"><Input name="lng" type="number" step="any" required /></Field>
            <div className="col-span-2 md:col-span-6"><SubmitBtn /></div>
          </form>
        </InlineCard>
      )}
      {adding && tab === 'trains' && (
        <InlineCard title="New train" onClose={() => setAdding(false)}>
          <form
            className="grid grid-cols-2 gap-3 md:grid-cols-6"
            onSubmit={async (e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              await run(() => insertTrain({
                section_id: String(fd.get('section') || ''), train_number: String(fd.get('number') || ''),
                name: String(fd.get('name') || ''), start_time: String(fd.get('start') || '00:00:00'),
                end_time: String(fd.get('end') || '23:59:00'), train_type: String(fd.get('type') || 'express'),
              }))
              setAdding(false)
            }}
          >
            <Field label="Number"><Input name="number" required placeholder="12951" /></Field>
            <Field label="Name"><Input name="name" required placeholder="Mumbai Rajdhani" /></Field>
            <Field label="Section">
              <Select name="section" required>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Type">
              <Select name="type" defaultValue="express">
                <option value="express">express</option>
                <option value="passenger">passenger</option>
                <option value="freight">freight</option>
              </Select>
            </Field>
            <Field label="Start (IST)"><Input name="start" type="time" defaultValue="06:00" required /></Field>
            <Field label="End (IST)"><Input name="end" type="time" defaultValue="12:00" required /></Field>
            <div className="col-span-2 md:col-span-6"><SubmitBtn /></div>
          </form>
        </InlineCard>
      )}

      {/* Tables */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {tab === 'sections' && (
              <Table head={['Name', 'Code', 'Endpoints', 'Blocks', 'Conflict', '']}>
                {(filtered as typeof sections).map((s) => (
                  <tr key={s.id} className="hover:bg-muted/40">
                    <Td className="font-medium">{s.name}</Td>
                    <Td mono>{s.code}</Td>
                    <Td>{s.from_station ?? '—'} → {s.to_station ?? '—'}</Td>
                    <Td>{blocks.filter((b) => b.section_id === s.id).length}</Td>
                    <Td>
                      <Button
                        size="sm" variant={blocks.some((b) => b.section_id === s.id && b.status === 'conflict') ? 'destructive' : 'outline'}
                        className="h-7 px-2 text-xs"
                        disabled={busy}
                        onClick={() => run(() => setSectionConflict(s.id, !blocks.some((b) => b.section_id === s.id && b.status === 'conflict')))}
                      >
                        {blocks.some((b) => b.section_id === s.id && b.status === 'conflict') ? <><Ban className="size-3.5" /> Blocked</> : <><ShieldCheck className="size-3.5" /> Clear</>}
                      </Button>
                    </Td>
                    <RowActions onEdit={() => setEditing(editing === s.id ? null : s.id)} onDelete={() => setPendingDelete({ kind: 'sections', id: s.id, name: s.name })} />
                  </tr>
                ))}
                {editing && sections.filter((s) => s.id === editing).map((s) => (
                  <tr key={`${s.id}-edit`} className="bg-muted/30">
                    <td colSpan={6} className="px-5 py-3">
                      <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => {
                        e.preventDefault()
                        const fd = new FormData(e.currentTarget)
                        await run(() => updateSection(s.id, {
                          name: String(fd.get('name') || s.name), code: String(fd.get('code') || s.code).toUpperCase(),
                          from_station: String(fd.get('from') || '').toUpperCase() || null,
                          to_station: String(fd.get('to') || '').toUpperCase() || null,
                        }))
                        setEditing(null)
                      }}>
                        <Field label="Name"><Input name="name" defaultValue={s.name} className="w-56" /></Field>
                        <Field label="Code"><Input name="code" defaultValue={s.code} className="w-32 font-mono" /></Field>
                        <Field label="From"><Input name="from" defaultValue={s.from_station ?? ''} className="w-24 font-mono" /></Field>
                        <Field label="To"><Input name="to" defaultValue={s.to_station ?? ''} className="w-24 font-mono" /></Field>
                        <SubmitBtn label="Save" />
                      </form>
                    </td>
                  </tr>
                ))}
              </Table>
            )}

            {tab === 'stations' && (
              <Table head={['Code', 'Name', 'Zone', 'Tier', 'Lat, Lng', '']}>
                {(filtered as typeof stations).map((s) => (
                  <tr key={s.code} className="hover:bg-muted/40">
                    <Td mono>{s.code}</Td>
                    <Td className="font-medium">{s.name}</Td>
                    <Td>{s.zone}</Td>
                    <Td><Badge variant={s.tier === 'hub' ? 'warning' : s.tier === 'junction' ? 'info' : 'neutral'}>{s.tier}</Badge></Td>
                    <Td mono>{s.latitude.toFixed(3)}, {s.longitude.toFixed(3)}</Td>
                    <RowActions onEdit={() => setEditing(editing === s.code ? null : s.code)} onDelete={() => setPendingDelete({ kind: 'stations', id: s.code, name: s.name })} />
                  </tr>
                ))}
                {editing && stations.filter((s) => s.code === editing).map((s) => (
                  <tr key={`${s.code}-edit`} className="bg-muted/30">
                    <td colSpan={6} className="px-5 py-3">
                      <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => {
                        e.preventDefault()
                        const fd = new FormData(e.currentTarget)
                        await run(() => updateStation(s.code, {
                          name: String(fd.get('name') || s.name), zone: String(fd.get('zone') || s.zone),
                          tier: String(fd.get('tier') || s.tier),
                          latitude: Number(fd.get('lat') || s.latitude), longitude: Number(fd.get('lng') || s.longitude),
                        }))
                        setEditing(null)
                      }}>
                        <Field label="Name"><Input name="name" defaultValue={s.name} className="w-56" /></Field>
                        <Field label="Zone"><Input name="zone" defaultValue={s.zone} className="w-40" /></Field>
                        <Field label="Tier">
                          <Select name="tier" defaultValue={s.tier}>
                            <option value="hub">hub</option>
                            <option value="junction">junction</option>
                            <option value="station">station</option>
                          </Select>
                        </Field>
                        <Field label="Lat"><Input name="lat" type="number" step="any" defaultValue={s.latitude} className="w-28" /></Field>
                        <Field label="Lng"><Input name="lng" type="number" step="any" defaultValue={s.longitude} className="w-28" /></Field>
                        <SubmitBtn label="Save" />
                      </form>
                    </td>
                  </tr>
                ))}
              </Table>
            )}

            {tab === 'trains' && (
              <Table head={['Number', 'Name', 'Section', 'Start', 'End', 'Status', '']}>
                {(filtered as typeof trains).map((t) => (
                  <tr key={t.id} className="hover:bg-muted/40">
                    <Td mono>{t.train_number}</Td>
                    <Td className="font-medium">{t.name}</Td>
                    <Td>{sectionById.get(t.section_id)?.name ?? '—'}</Td>
                    <Td mono>{t.start_time.slice(0, 5)}</Td>
                    <Td mono>{t.end_time.slice(0, 5)}</Td>
                    <Td>
                      <Select value={t.status} className="h-8 w-32 text-xs" aria-label="Train status" onChange={(e) => run(() => updateTrain(t.id, { status: e.target.value as typeof t.status }))}>
                        <option value="scheduled">scheduled</option>
                        <option value="delayed">delayed</option>
                        <option value="completed">completed</option>
                      </Select>
                    </Td>
                    <RowActions onEdit={() => setEditing(editing === t.id ? null : t.id)} onDelete={() => setPendingDelete({ kind: 'trains', id: t.id, name: `${t.train_number} ${t.name}` })} />
                  </tr>
                ))}
                {editing && trains.filter((t) => t.id === editing).map((t) => (
                  <tr key={`${t.id}-edit`} className="bg-muted/30">
                    <td colSpan={7} className="px-5 py-3">
                      <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => {
                        e.preventDefault()
                        const fd = new FormData(e.currentTarget)
                        await run(() => updateTrain(t.id, {
                          train_number: String(fd.get('number') || t.train_number), name: String(fd.get('name') || t.name),
                          start_time: String(fd.get('start') || t.start_time), end_time: String(fd.get('end') || t.end_time),
                        }))
                        setEditing(null)
                      }}>
                        <Field label="Number"><Input name="number" defaultValue={t.train_number} className="w-28 font-mono" /></Field>
                        <Field label="Name"><Input name="name" defaultValue={t.name} className="w-64" /></Field>
                        <Field label="Start"><Input name="start" type="time" defaultValue={t.start_time.slice(0, 5)} /></Field>
                        <Field label="End"><Input name="end" type="time" defaultValue={t.end_time.slice(0, 5)} /></Field>
                        <SubmitBtn label="Save" />
                      </form>
                    </td>
                  </tr>
                ))}
              </Table>
            )}

            {tab === 'assets' && (
              <Table head={['Code', 'Name', 'Type', 'Section', 'Status', 'Health', 'Train link', '']}>
                {(filtered as typeof assets).map((a) => {
                  const linkedTrain = a.train_id ? trains.find((t) => t.id === a.train_id) : null
                  return (
                    <tr key={a.id} className="hover:bg-muted/40">
                      <Td mono>{a.asset_code}</Td>
                      <Td className="font-medium">{a.name}</Td>
                      <Td><Badge variant="outline">{a.asset_type}</Badge></Td>
                      <Td>{sectionById.get(a.section_id ?? '')?.name?.replace(' Section', '') ?? '—'}</Td>
                      <Td>
                        <Select value={a.status} className="h-8 w-36 text-xs" aria-label="Asset status" onChange={(e) => run(() => updateAsset(a.id, { status: e.target.value as typeof a.status }))}>
                          <option value="operational">operational</option>
                          <option value="degraded">degraded</option>
                          <option value="maintenance">maintenance</option>
                          <option value="offline">offline</option>
                        </Select>
                      </Td>
                      <Td mono>{a.health_score}</Td>
                      <Td>{linkedTrain ? <span className="font-mono text-xs">{linkedTrain.train_number}</span> : '—'}</Td>
                      <RowActions onDelete={() => setPendingDelete({ kind: 'assets', id: a.id, name: a.name })} />
                    </tr>
                  )
                })}
              </Table>
            )}

            {tab === 'blocks' && (
              <Table head={['Title', 'Section', 'Window (IST)', 'Requested by', 'Urgency', 'Status', '']}>
                {(filtered as typeof blocks).map((b) => (
                  <tr key={b.id} className="hover:bg-muted/40">
                    <Td className="font-medium">{b.title}</Td>
                    <Td>{sectionById.get(b.section_id)?.name?.replace(' Section', '') ?? '—'}</Td>
                    <Td mono>
                      {new Date(b.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}–{new Date(b.end_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </Td>
                    <Td>{b.requested_by}</Td>
                    <Td><Badge variant={b.urgency === 'high' ? 'danger' : b.urgency === 'medium' ? 'warning' : 'neutral'}>{b.urgency}</Badge></Td>
                    <Td>
                      <Select
                        value={b.status}
                        className="h-8 w-32 text-xs"
                        aria-label="Block status"
                        onChange={(e) => {
                          const next = e.target.value as BlockStatus
                          if (next === 'conflict' && b.status !== 'conflict') {
                            void import('@/lib/api').then(({ notifyConflict }) => notifyConflict(b.id))
                          }
                          run(() => updateBlockStatus(b.id, next))
                        }}
                      >
                        <option value="pending">pending</option>
                        <option value="approved">approved</option>
                        <option value="conflict">conflict</option>
                        <option value="rejected">rejected</option>
                      </Select>
                    </Td>
                    <RowActions onDelete={() => setPendingDelete({ kind: 'blocks', id: b.id, name: b.title })} />
                  </tr>
                ))}
              </Table>
            )}

            {tab === 'complaints' && (
              <Table head={['Category', 'Section', 'Description', 'Severity', 'Status', '']}>
                {(filtered as typeof complaints).map((c) => (
                  <tr key={c.id} className="hover:bg-muted/40">
                    <Td className="font-medium">{c.category}</Td>
                    <Td>{c.section_id ? sectionById.get(c.section_id)?.name?.replace(' Section', '') ?? '—' : '—'}</Td>
                    <Td className="max-w-xs truncate text-muted-foreground">{c.description}</Td>
                    <Td><Badge variant={c.severity === 'high' ? 'danger' : c.severity === 'medium' ? 'warning' : 'neutral'}>{c.severity}</Badge></Td>
                    <Td><Badge variant={c.status === 'resolved' ? 'success' : c.status === 'linked' ? 'info' : 'warning'}>{c.status}</Badge></Td>
                    <RowActions onDelete={() => setPendingDelete({ kind: 'complaints', id: c.id, name: c.category })} />
                  </tr>
                ))}
              </Table>
            )}

            {!loading && filtered.length === 0 && (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                {q ? `No ${tab} match “${query}”.` : `No ${tab} yet.`}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {pendingDelete && (
        <ConfirmDelete
          name={pendingDelete.name}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted-foreground">
          {head.map((h, i) => (
            <th key={i} className={cn('px-3 py-3 font-medium', i === 0 && 'pl-5')}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">{children}</tbody>
    </table>
  )
}

function Td({ children, className, mono }: { children: React.ReactNode; className?: string; mono?: boolean }) {
  return <td className={cn('px-3 py-2.5 first:pl-5', mono && 'font-mono text-xs', className)}>{children}</td>
}

function RowActions({ onEdit, onDelete }: { onEdit?: () => void; onDelete: () => void }) {
  return (
    <td className="px-3 py-2.5">
      <div className="flex justify-end gap-1">
        {onEdit && (
          <button type="button" onClick={onEdit} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Edit">
            <Pencil className="size-4" />
          </button>
        )}
        <button type="button" onClick={onDelete} className="rounded-md p-1.5 text-muted-foreground hover:bg-conflict/10 hover:text-conflict" aria-label="Delete">
          <Trash2 className="size-4" />
        </button>
      </div>
    </td>
  )
}

function InlineCard({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}

function SubmitBtn({ label = 'Save' }: { label?: string }) {
  return (
    <Button type="submit" size="sm" disabled={false}>
      {label}
    </Button>
  )
}
