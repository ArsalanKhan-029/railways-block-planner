'use client'

/**
 * Schedule (admin-only) — unified train + maintenance scheduling.
 *
 * Tabs:
 *  • Train Service — create/edit timetable entries with priority class and
 *    running frequency, with AI-suggested departure/arrival times (Groq,
 *    heuristic fallback) the admin can override before saving.
 *  • Maintenance Session — block requests, reusing the standard blocks model.
 *  • AI Plan — generates a full proposed plan (trains + blocks), previews it
 *    in reviewable tables with an impact comparison, and only writes on
 *    "Approve & Implement" (via the standard APIs → realtime propagation).
 */

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Sparkles, Check, X, Wrench, TrainFront, History, Pencil, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useRailData } from '@/lib/use-rail-data'
import { insertTrain, insertTrainMultiTrip, insertBlock, setSectionConflict } from '@/lib/api'
import { railDistanceKm, durationMinutes, round5, addMinutesToTime } from '@/lib/journey'
import type { TrainPriority, TrainFrequency } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Distance-based expected duration (min) for a section+priority; null when
 * the section's endpoints lack coordinates. */
function expectedFor(
  distances: Map<string, number>,
  sectionCode: string | undefined,
  priority: string,
): number | null {
  const km = sectionCode ? distances.get(sectionCode) : undefined
  if (!km) return null
  return round5(durationMinutes(km, priority))
}

const PRIORITIES: { value: TrainPriority; label: string }[] = [
  { value: 'express', label: 'Express' },
  { value: 'mail', label: 'Mail' },
  { value: 'passenger', label: 'Passenger' },
  { value: 'freight', label: 'Freight' },
]
const FREQUENCIES: { value: TrainFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'weekdays', label: 'Weekdays only' },
  { value: 'weekends', label: 'Weekends only' },
  { value: 'specific', label: 'Specific days' },
]

interface SuggestResult {
  departure: string
  arrival: string
  rationale: string
  provider: string
}

/** Overlap warnings computed live as the admin edits the form (5.1). */
function useConflictPrecheck(sectionId: string, dep: string, arr: string, editingId?: string) {
  const { trains, blocks, sections } = useRailData()
  return useMemo(() => {
    if (!sectionId || !dep || !arr) return []
    const toMin = (t: string) => {
      const [h, m] = t.split(':').map(Number)
      return h * 60 + (m || 0)
    }
    const a = toMin(dep)
    const b = toMin(arr) > toMin(dep) ? toMin(arr) : toMin(arr) + 1440
    const sec = sections.find((s) => s.id === sectionId)
    const out: string[] = []
    for (const t of trains) {
      if (t.section_id !== sectionId || t.id === editingId) continue
      const s = toMin(t.start_time)
      const e0 = toMin(t.end_time)
      const e = e0 >= s ? e0 : e0 + 1440
      if (a < e && b > s) out.push(`Overlaps train ${t.train_number} ${t.name} (${t.start_time.slice(0, 5)}–${t.end_time.slice(0, 5)})`)
    }
    for (const bl of blocks) {
      if (bl.section_id !== sectionId) continue
      const s = new Date(bl.start_time)
      const e = new Date(bl.end_time)
      // blocks are timestamps — compare against "today's" occurrence of the window in IST hours
      const sMin = (s.getUTCHours() + 24 - 5) % 24 * 60 + s.getUTCMinutes()
      const eMin = (e.getUTCHours() + 24 - 5) % 24 * 60 + e.getUTCMinutes()
      if (a < eMin && b > sMin) out.push(`Overlaps block "${bl.title}" (${bl.status})`)
    }
    return out.slice(0, 4)
  }, [sectionId, dep, arr, trains, blocks, sections, editingId])
}

export function ScheduleView() {
  const { sections, trains, blocks, assets, stations, refresh } = useRailData()

  // rail distance (km) per section from endpoint station coordinates
  const distances = useMemo(() => {
    const byCode = new Map(stations.map((s) => [s.code, s]))
    const out = new Map<string, number>()
    for (const sec of sections) {
      const a = sec.from_station ? byCode.get(sec.from_station) : null
      const b = sec.to_station ? byCode.get(sec.to_station) : null
      if (!a || !b) continue
      out.set(sec.code, railDistanceKm(a, b))
    }
    return out
  }, [sections, stations])
  const [tab, setTab] = useState<'service' | 'maintenance' | 'plan'>('service')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'service', label: 'Train Service', icon: TrainFront },
            { id: 'maintenance', label: 'Maintenance Session', icon: Wrench },
            { id: 'plan', label: 'AI Plan', icon: Sparkles },
          ] as const
        ).map((t) => (
          <Button key={t.id} size="sm" variant={tab === t.id ? 'default' : 'outline'} onClick={() => setTab(t.id)}>
            <t.icon className="size-4" /> {t.label}
          </Button>
        ))}
      </div>

      {tab === 'service' && <TrainServiceTab sections={sections} trains={trains} assets={assets} blocks={blocks} distances={distances} refresh={refresh} />}
      {tab === 'maintenance' && <MaintenanceTab sections={sections} refresh={refresh} />}
      {tab === 'plan' && <PlanTab sections={sections} trains={trains} blocks={blocks} refresh={refresh} />}
    </div>
  )
}

/* ------------------------------ Train Service ----------------------------- */

function TrainServiceTab({
  sections,
  trains,
  assets,
  blocks,
  distances,
  refresh,
}: {
  sections: { id: string; code: string; name: string; from_station?: string | null; to_station?: string | null }[]
  trains: { id: string; section_id: string; train_number: string; name: string; start_time: string; end_time: string; priority?: string; frequency?: string; trips_per_day?: number; status: string }[]
  assets: { id: string; asset_code: string; name: string; asset_type: string; train_id?: string | null }[]
  blocks: { section_id: string; title: string; status: string; start_time: string; end_time: string }[]
  distances: Map<string, number>
  refresh: () => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const edit = trains.find((t) => t.id === editingId) ?? null
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,430px)_1fr]">
      <Card className="h-fit">
        <CardContent className="p-5">
          <TrainServiceForm
            key={editingId ?? 'new'}
            sections={sections}
            trains={trains}
            assets={assets}
            blocks={blocks}
            distances={distances}
            editing={edit}
            onDone={() => {
              setEditingId(null)
              refresh()
            }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Number</th>
                  <th className="px-3 py-3 font-medium">Name</th>
                  <th className="px-3 py-3 font-medium">Section</th>
                  <th className="px-3 py-3 font-medium">Priority</th>
                  <th className="px-3 py-3 font-medium">Frequency</th>
                  <th className="px-4 py-3 font-medium">Window</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {trains.map((t) => {
                  const sec = sections.find((s) => s.id === t.section_id)
                  const trips = t.trips_per_day ?? 1
                  return (
                    <tr
                      key={t.id}
                      className={cn('cursor-pointer hover:bg-muted/40', editingId === t.id && 'bg-primary/5')}
                      onClick={() => setEditingId(t.id)}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs">
                        {t.train_number}
                        {trips > 1 && <span className="ml-1.5 text-[10px] text-muted-foreground">trip {String(t.train_number).endsWith(`-${trips}`) ? trips : '…'}</span>}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2.5 font-medium">{t.name}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{sec?.code ?? '—'}</td>
                      <td className="px-3 py-2.5 text-xs capitalize">{t.priority ?? 'express'}</td>
                      <td className="px-3 py-2.5 text-xs capitalize">{t.frequency ?? 'daily'}{trips > 1 ? ` · ${trips}×/day` : ''}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function TrainServiceForm({
  sections,
  trains,
  assets,
  blocks,
  distances,
  editing,
  onDone,
}: {
  sections: { id: string; code: string; name: string; from_station?: string | null; to_station?: string | null }[]
  trains: { id: string; section_id: string; train_number: string; name: string; start_time: string; end_time: string; priority?: string; frequency?: string; trips_per_day?: number }[]
  assets: { id: string; asset_code: string; name: string; asset_type: string; train_id?: string | null }[]
  blocks: { section_id: string; title: string; status: string; start_time: string; end_time: string }[]
  distances: Map<string, number>
  editing: { id: string; section_id: string; train_number: string; name: string; start_time: string; end_time: string; priority?: string; frequency?: string; trips_per_day?: number } | null
  onDone: () => void
}) {
  const [sectionId, setSectionId] = useState(editing?.section_id ?? sections[0]?.id ?? '')
  const [priority, setPriority] = useState<TrainPriority>((editing?.priority as TrainPriority) ?? 'express')
  const [frequency, setFrequency] = useState<TrainFrequency>((editing?.frequency as TrainFrequency) ?? 'daily')
  const [trips, setTrips] = useState(editing?.trips_per_day ?? 1)
  const [dep, setDep] = useState(editing?.start_time.slice(0, 5) ?? '06:00')
  const [arr, setArr] = useState(editing?.end_time.slice(0, 5) ?? '15:00')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggest, setSuggest] = useState<SuggestResult | null>(null)
  const [suggesting, setSuggesting] = useState(false)

  const warnings = useConflictPrecheck(sectionId, dep, arr, editing?.id)
  const section = sections.find((s) => s.id === sectionId)
  // vehicle-type assets with no linked train can be promoted by this form
  const unlinkedVehicles = assets.filter((a) => a.asset_type === 'vehicle' && !a.train_id)

  // distance-based expected duration; arrival auto-follows departure so the
  // journey time always matches distance ÷ priority speed (±10 min tolerance)
  const expected = expectedFor(distances, section?.code, priority)
  const expectedKm = section ? distances.get(section.code) : undefined
  useEffect(() => {
    if (expected != null) setArr(addMinutesToTime(dep, expected))
  }, [dep, expected])

  async function askAi() {
    if (!section) return
    setSuggesting(true)
    setSuggest(null)
    try {
      const secTrains = trains
        .filter((t) => t.section_id === sectionId)
        .slice(0, 30)
        .map((t) => ({ number: t.train_number, start: t.start_time.slice(0, 5), end: t.end_time.slice(0, 5), priority: t.priority }))
      const secBlocks = blocks
        .filter((b) => b.section_id === sectionId)
        .slice(0, 10)
        .map((b) => ({ title: b.title, status: b.status, start: new Date(b.start_time).toISOString(), end: new Date(b.end_time).toISOString() }))
      const res = await fetch('/api/railai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionCode: section.code,
          priority,
          frequency,
          distanceKm: expectedKm,
          trains: secTrains,
          blocks: secBlocks,
        }),
      })
      const json = await res.json()
      setSuggest(json)
      if (json.departure) {
        setDep(json.departure)
        if (json.arrival) setArr(json.arrival)
      }
    } finally {
      setSuggesting(false)
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const number = String(fd.get('number') || '').trim()
    const name = String(fd.get('name') || '').trim()
    if (!number || !name || !sectionId) return
    setSaving(true)
    setError(null)
    if (editing) {
      const { updateTrain } = await import('@/lib/api')
      const { error } = await updateTrain(editing.id, {
        section_id: sectionId,
        train_number: number,
        name,
        start_time: `${dep}:00`,
        end_time: `${arr}:00`,
        priority,
        frequency,
        trips_per_day: trips,
      })
      setSaving(false)
      if (error) setError(error.message)
      else onDone()
      return
    }
    const { error, count } = await insertTrainMultiTrip({
      section_id: sectionId,
      train_number: number,
      name,
      start_time: `${dep}:00`,
      end_time: `${arr}:00`,
      priority,
      frequency,
      trips_per_day: trips,
    })
    if (count > 1) {
      // Toast via existing pattern: the parent list refetches live anyway.
      setError(null)
    }
    setSaving(false)
    if (error) setError(error.message)
    else onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <h3 className="text-sm font-semibold">{editing ? `Edit ${editing.train_number}` : 'New train service'}</h3>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ts-number">Train number</Label>
        <Input id="ts-number" name="number" defaultValue={editing?.train_number} required placeholder="e.g. 12951" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ts-name">Service name</Label>
        <Input id="ts-name" name="name" defaultValue={editing?.name} required placeholder="e.g. Mumbai Rajdhani" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ts-section">Route / section</Label>
        <Select id="ts-section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ts-priority">Priority</Label>
          <Select id="ts-priority" value={priority} onChange={(e) => setPriority(e.target.value as TrainPriority)}>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ts-freq">Passenger frequency</Label>
          <Select id="ts-freq" value={frequency} onChange={(e) => setFrequency(e.target.value as TrainFrequency)}>
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ts-trips">Trips per day</Label>
        <Select id="ts-trips" value={String(trips)} onChange={(e) => setTrips(Number(e.target.value))} disabled={!!editing}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? 'trip' : 'trips'} per day
            </option>
          ))}
        </Select>
        {trips > 1 && !editing && (
          <p className="text-xs text-muted-foreground">
            Creates {trips} timetable entries: first departs {dep || '—'}, same duration, then evenly staggered across the day (numbered {`${'…'}-2, -3${'…'}`} in the list).
          </p>
        )}
        {editing && editing.trips_per_day != null && editing.trips_per_day > 1 && (
          <p className="text-xs text-muted-foreground">
            This service runs {editing.trips_per_day} trips/day ({editing.trips_per_day - 1} sibling entries share its number). Editing here changes this trip only.
          </p>
        )}
      </div>
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <Label>Departure / arrival</Label>
          <Button type="button" size="sm" variant="outline" disabled={suggesting || !section} onClick={askAi}>
            {suggesting ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} AI time
          </Button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Input type="time" value={dep} onChange={(e) => setDep(e.target.value)} aria-label="Departure time" required />
          <Input
            type="time"
            value={arr}
            onChange={(e) => setArr(e.target.value)}
            aria-label="Arrival time (auto from distance)"
            title={expected != null ? `Auto-calculated: ${expectedKm?.toFixed(0)} km ÷ ${priority} speed ≈ ${expected} min (edit to override)` : 'Pick endpoint stations with coordinates to auto-calculate'}
            required
          />
        </div>
        {expected != null && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            ≈ {expectedKm?.toFixed(0)} km · expected duration <span className="font-mono">{expected} min</span> at {priority} speed — arrival auto-set from departure (±10 min), editable.
          </p>
        )}
        {suggest && (
          <p className="mt-2 text-xs text-muted-foreground">
            <Badge variant="info" className="mr-1.5">
              {suggest.provider === 'groq' ? 'AI suggested' : suggest.provider === 'heuristic' ? 'Auto slot' : suggest.provider}
            </Badge>
            {suggest.rationale}
          </p>
        )}
      </div>
      {warnings.length > 0 && (
        <div className="rounded-lg border border-pending/50 bg-pending/10 p-2.5 text-xs text-pending-foreground">
          {warnings.map((w) => (
            <p key={w}>⚠ {w}</p>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-conflict">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />} {editing ? 'Save changes' : 'Schedule service'}
        </Button>
      </div>
      {unlinkedVehicles.length > 0 && !editing && (
        <p className="text-xs text-muted-foreground">
          {unlinkedVehicles.length} registered vehicle asset(s) without a service — their trains can be created from the Asset Registry (calendar icon).
        </p>
      )}
    </form>
  )
}

/* --------------------------- Maintenance Session -------------------------- */

function MaintenanceTab({ sections, refresh }: { sections: { id: string; code: string; name: string }[]; refresh: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? '')
  const [start, setStart] = useState('22:00')
  const [end, setEnd] = useState('02:00')
  const warnings = useConflictPrecheck(sectionId, start, end)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const title = String(fd.get('title') || '').trim()
    const category = String(fd.get('category') || 'maintenance')
    const urgency = String(fd.get('urgency') || 'medium') as 'low' | 'medium' | 'high'
    const durationH = Number(fd.get('duration') || 4)
    if (!title || !sectionId) return
    setSaving(true)
    setError(null)
    const today = new Date()
    const s = new Date(`${today.toISOString().slice(0, 10)}T${start}:00+05:30`)
    const e2 = new Date(s.getTime() + durationH * 3600_000)
    const { error: err } = await insertBlock({
      section_id: sectionId,
      title,
      block_type: category,
      start_time: s.toISOString(),
      end_time: e2.toISOString(),
      urgency,
      requested_by: 'Schedule (admin)',
    })
    setSaving(false)
    if (err) setError(err.message)
    else {
      setDone(true)
      refresh()
      setTimeout(() => setDone(false), 4000)
    }
  }

  return (
    <Card className="mx-auto max-w-xl">
      <CardContent className="p-5">
        <form onSubmit={submit} className="space-y-3">
          <h3 className="text-sm font-semibold">New maintenance session (block request)</h3>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ms-title">Reason / title</Label>
            <Input id="ms-title" name="title" required placeholder="e.g. Rail grinding" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ms-section">Section</Label>
            <Select id="ms-section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ms-cat">Category</Label>
              <Select id="ms-cat" name="category" defaultValue="maintenance">
                <option value="maintenance">maintenance</option>
                <option value="inspection">inspection</option>
                <option value="manual">manual</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ms-urg">Urgency</Label>
              <Select id="ms-urg" name="urgency" defaultValue="medium">
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ms-dur">Duration (h)</Label>
              <Input id="ms-dur" name="duration" type="number" min={1} max={12} defaultValue={4} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ms-start">Start</Label>
              <Input id="ms-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ms-end">End (or duration)</Label>
              <Input id="ms-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          {warnings.length > 0 && (
            <div className="rounded-lg border border-pending/50 bg-pending/10 p-2.5 text-xs text-pending-foreground">
              {warnings.map((w) => (
                <p key={w}>⚠ {w}</p>
              ))}
            </div>
          )}
          {error && <p className="text-xs text-conflict">{error}</p>}
          {done && <p className="text-xs text-approved">Block request created — visible on Block Planning and the timeline.</p>}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving && <Loader2 className="animate-spin" />} Create block request
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

/* --------------------------------- AI Plan -------------------------------- */

interface PlanTrain {
  train_number: string
  name: string
  section_code: string
  priority: string
  frequency: string
  departure: string
  arrival: string
}
interface PlanBlock {
  title: string
  section_code: string
  start: string
  end: string
  urgency: string
}
interface PlanHistoryEntry {
  at: string
  provider: string
  summary: string
  trains: number
  blocks: number
  outcome: 'approved' | 'discarded'
}
const HISTORY_KEY = 'railmind-plan-history'

function PlanTab({
  sections,
  trains,
  blocks,
  refresh,
}: {
  sections: { id: string; code: string; name: string }[]
  trains: { train_number: string; name: string; section_id: string; start_time: string; end_time: string; priority?: string; frequency?: string; status: string }[]
  blocks: { title: string; section_id: string; start_time: string; end_time: string; status: string; urgency: string }[]
  refresh: () => void
}) {
  const sectionByCode = useMemo(() => new Map(sections.map((s) => [s.code, s])), [sections])
  const sectionById = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections])
  const [plan, setPlan] = useState<{ summary: string; trains: PlanTrain[]; blocks: PlanBlock[]; provider: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState<string | null>(null)
  // which part of the schedule the AI should plan
  const [planType, setPlanType] = useState<'both' | 'trains' | 'blocks'>('both')
  // row-level editing of the proposed plan before approval
  const [editTrainIdx, setEditTrainIdx] = useState<number | null>(null)
  const [editBlockIdx, setEditBlockIdx] = useState<number | null>(null)
  const [history, setHistory] = useState<PlanHistoryEntry[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
    } catch {
      return []
    }
  })

  function loadHistory(h: PlanHistoryEntry[]) {
    setHistory(h)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-20)))
  }

  function patchPlanTrain(i: number, patch: Partial<PlanTrain>) {
    setPlan((p) => (p ? { ...p, trains: p.trains.map((t, j) => (j === i ? { ...t, ...patch } : t)) } : p))
  }
  function patchPlanBlock(i: number, patch: Partial<PlanBlock>) {
    setPlan((p) => (p ? { ...p, blocks: p.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) } : p))
  }
  function removePlanTrain(i: number) {
    setPlan((p) => (p ? { ...p, trains: p.trains.filter((_, j) => j !== i) } : p))
  }
  function removePlanBlock(i: number) {
    setPlan((p) => (p ? { ...p, blocks: p.blocks.filter((_, j) => j !== i) } : p))
  }

  // impact preview (5.4): trains + blocks before vs after applying the plan
  const impact = useMemo(() => {
    if (!plan) return null
    const newTrains = plan.trains.length
    const newBlocks = plan.blocks.length
    const conflictBefore = blocks.filter((b) => b.status === 'conflict').length
    const activeBlocksBefore = blocks.filter((b) => b.status === 'approved').length
    const availability = (before: number) => Math.max(0, Math.min(100, 100 - (before / Math.max(1, trains.length)) * 4))
    return {
      trainsBefore: trains.length,
      trainsAfter: trains.length + newTrains,
      blocksBefore: activeBlocksBefore,
      blocksAfter: activeBlocksBefore + newBlocks,
      conflictsBefore: conflictBefore,
      conflictsAfter: Math.max(0, conflictBefore - plan.blocks.length),
      availabilityBefore: availability(activeBlocksBefore).toFixed(1),
      availabilityAfter: availability(activeBlocksBefore + newBlocks).toFixed(1),
    }
  }, [plan, trains, blocks])

  async function generate() {
    setLoading(true)
    setError(null)
    setApplied(null)
    setEditTrainIdx(null)
    setEditBlockIdx(null)
    try {
      const res = await fetch('/api/railai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planType,
          sections: sections.slice(0, 60).map((s) => ({ code: s.code, name: s.name })),
          trains: trains.slice(0, 100).map((t) => ({
            number: t.train_number,
            name: t.name,
            section: sectionById.get(t.section_id)?.code ?? '',
            start: t.start_time.slice(0, 5),
            end: t.end_time.slice(0, 5),
            priority: t.priority,
            frequency: t.frequency,
            status: t.status,
          })),
          blocks: blocks.slice(0, 30).map((b) => ({
            title: b.title,
            section: sectionById.get(b.section_id)?.code ?? '',
            start: new Date(b.start_time).toISOString(),
            end: new Date(b.end_time).toISOString(),
            status: b.status,
            urgency: b.urgency,
          })),
        }),
      })
      const json = await res.json()
      if (json.error) setError(json.error)
      else setPlan(json)
    } catch {
      setError('Could not reach the planning service.')
    } finally {
      setLoading(false)
    }
  }

  async function approve() {
    if (!plan) return
    const sectionOf = (code: string) => sectionByCode.get(code)?.id
    let okTrains = 0
    for (const pt of plan.trains) {
      const sectionId = sectionOf(pt.section_code)
      if (!sectionId) continue
      const { error } = await insertTrain({
        section_id: sectionId,
        train_number: pt.train_number,
        name: pt.name,
        start_time: `${pt.departure}:00`,
        end_time: `${pt.arrival}:00`,
        priority: pt.priority as TrainPriority,
        frequency: pt.frequency as TrainFrequency,
      })
      if (!error) okTrains++
    }
    let okBlocks = 0
    for (const pb of plan.blocks) {
      const sectionId = sectionOf(pb.section_code)
      if (!sectionId) continue
      const today = new Date().toISOString().slice(0, 10)
      const { error } = await insertBlock({
        section_id: sectionId,
        title: pb.title,
        block_type: 'maintenance',
        start_time: new Date(`${today}T${pb.start}:00+05:30`).toISOString(),
        end_time: new Date(`${today}T${pb.end}:00+05:30`).toISOString(),
        urgency: pb.urgency as 'low' | 'medium' | 'high',
        requested_by: 'AI Plan (approved)',
      })
      if (!error) okBlocks++
    }
    loadHistory([...history, { at: new Date().toISOString(), provider: plan.provider, summary: plan.summary, trains: plan.trains.length, blocks: plan.blocks.length, outcome: 'approved' }])
    setApplied(`${okTrains} train service(s) and ${okBlocks} block request(s) created — now live everywhere via realtime sync.`)
    setPlan(null)
    refresh()
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h3 className="text-sm font-semibold">AI Schedule Plan Generator</h3>
            <p className="text-xs text-muted-foreground">
              Analyzes current services, blocks and conflicts, then proposes new services + maintenance windows. Nothing is applied until you approve.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={planType}
              onChange={(e) => setPlanType(e.target.value as 'both' | 'trains' | 'blocks')}
              className="h-8 w-56 text-xs"
              aria-label="Plan type"
            >
              <option value="both">Train schedule + Maintenance</option>
              <option value="trains">Train schedule only</option>
              <option value="blocks">Maintenance schedule only</option>
            </Select>
            <Button onClick={generate} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <Sparkles className="size-4" />} Generate plan
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-conflict">{error}</p>}
      {applied && (
        <Card className="border-approved/40">
          <CardContent className="p-4 text-sm text-approved">{applied}</CardContent>
        </Card>
      )}

      {plan && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info">{plan.provider === 'groq' ? 'AI reasoning' : 'Heuristic plan'}</Badge>
                <h4 className="text-sm font-semibold">AI summary</h4>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{plan.summary}</p>
              {impact && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                  <div className="rounded-lg border border-border p-2">
                    <p className="text-muted-foreground">Trains</p>
                    <p className="font-mono">{impact.trainsBefore} → {impact.trainsAfter}</p>
                  </div>
                  <div className="rounded-lg border border-border p-2">
                    <p className="text-muted-foreground">Approved blocks</p>
                    <p className="font-mono">{impact.blocksBefore} → {impact.blocksAfter}</p>
                  </div>
                  <div className="rounded-lg border border-border p-2">
                    <p className="text-muted-foreground">Conflicts</p>
                    <p className="font-mono">{impact.conflictsBefore} → {impact.conflictsAfter}</p>
                  </div>
                  <div className="rounded-lg border border-border p-2">
                    <p className="text-muted-foreground">Asset availability</p>
                    <p className="font-mono">{impact.availabilityBefore}% → {impact.availabilityAfter}%</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardContent className="p-0">
                <p className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Proposed train services · click a row to edit
                </p>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    {plan.trains.map((t, i) =>
                      editTrainIdx === i ? (
                        <tr key={`${t.train_number}-${t.section_code}`} className="bg-primary/5">
                          <td colSpan={6} className="px-4 py-3">
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                value={t.train_number}
                                onChange={(e) => patchPlanTrain(i, { train_number: e.target.value })}
                                aria-label="Train number"
                                className="font-mono text-xs"
                              />
                              <Input
                                value={t.name}
                                onChange={(e) => patchPlanTrain(i, { name: e.target.value })}
                                aria-label="Service name"
                                className="text-xs"
                              />
                              <Select
                                value={t.section_code}
                                onChange={(e) => patchPlanTrain(i, { section_code: e.target.value })}
                                aria-label="Section"
                                className="text-xs"
                              >
                                {sections.map((s) => (
                                  <option key={s.id} value={s.code}>
                                    {s.code} — {s.name}
                                  </option>
                                ))}
                              </Select>
                              <Select
                                value={t.priority}
                                onChange={(e) => patchPlanTrain(i, { priority: e.target.value })}
                                aria-label="Priority"
                                className="text-xs"
                              >
                                {PRIORITIES.map((p) => (
                                  <option key={p.value} value={p.value}>{p.label}</option>
                                ))}
                              </Select>
                              <Select
                                value={t.frequency}
                                onChange={(e) => patchPlanTrain(i, { frequency: e.target.value })}
                                aria-label="Frequency"
                                className="text-xs"
                              >
                                {FREQUENCIES.map((f) => (
                                  <option key={f.value} value={f.value}>{f.label}</option>
                                ))}
                              </Select>
                              <div className="flex items-center gap-1">
                                <Input
                                  type="time"
                                  value={t.departure}
                                  onChange={(e) => patchPlanTrain(i, { departure: e.target.value })}
                                  aria-label="Departure"
                                  className="font-mono text-xs"
                                />
                                <Input
                                  type="time"
                                  value={t.arrival}
                                  onChange={(e) => patchPlanTrain(i, { arrival: e.target.value })}
                                  aria-label="Arrival"
                                  className="font-mono text-xs"
                                />
                              </div>
                            </div>
                            <div className="mt-2 flex justify-end">
                              <Button size="sm" variant="outline" onClick={() => setEditTrainIdx(null)}>
                                Done
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr
                          key={`${t.train_number}-${t.section_code}`}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => {
                            setEditTrainIdx(i)
                            setEditBlockIdx(null)
                          }}
                        >
                          <td className="px-4 py-2.5 font-mono text-xs">{t.train_number}</td>
                          <td className="max-w-[140px] truncate px-3 py-2.5 font-medium">{t.name}</td>
                          <td className="px-3 py-2.5 text-xs">{t.section_code}</td>
                          <td className="px-3 py-2.5 text-xs capitalize">{t.priority}</td>
                          <td className="px-3 py-2.5 text-xs capitalize">{t.frequency}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs">
                            {t.departure}–{t.arrival}
                            <button
                              type="button"
                              className="ml-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-conflict"
                              aria-label={`Remove ${t.train_number} from plan`}
                              onClick={(e) => {
                                e.stopPropagation()
                                removePlanTrain(i)
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                      ),
                    )}
                    {plan.trains.length === 0 && (
                      <tr>
                        <td className="px-4 py-6 text-center text-xs text-muted-foreground" colSpan={6}>
                          No new services proposed
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-0">
                <p className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Proposed maintenance windows · click a row to edit
                </p>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    {plan.blocks.map((b, i) =>
                      editBlockIdx === i ? (
                        <tr key={`${b.title}-${b.section_code}`} className="bg-primary/5">
                          <td colSpan={4} className="px-4 py-3">
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                value={b.title}
                                onChange={(e) => patchPlanBlock(i, { title: e.target.value })}
                                aria-label="Block title"
                                className="col-span-2 text-xs"
                              />
                              <Select
                                value={b.section_code}
                                onChange={(e) => patchPlanBlock(i, { section_code: e.target.value })}
                                aria-label="Section"
                                className="text-xs"
                              >
                                {sections.map((s) => (
                                  <option key={s.id} value={s.code}>
                                    {s.code} — {s.name}
                                  </option>
                                ))}
                              </Select>
                              <Select
                                value={b.urgency}
                                onChange={(e) => patchPlanBlock(i, { urgency: e.target.value })}
                                aria-label="Urgency"
                                className="text-xs"
                              >
                                <option value="low">low</option>
                                <option value="medium">medium</option>
                                <option value="high">high</option>
                              </Select>
                              <div className="col-span-2 flex items-center gap-1">
                                <Input
                                  type="time"
                                  value={b.start}
                                  onChange={(e) => patchPlanBlock(i, { start: e.target.value })}
                                  aria-label="Block start"
                                  className="font-mono text-xs"
                                />
                                <Input
                                  type="time"
                                  value={b.end}
                                  onChange={(e) => patchPlanBlock(i, { end: e.target.value })}
                                  aria-label="Block end"
                                  className="font-mono text-xs"
                                />
                              </div>
                            </div>
                            <div className="mt-2 flex justify-end">
                              <Button size="sm" variant="outline" onClick={() => setEditBlockIdx(null)}>
                                Done
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr
                          key={`${b.title}-${b.section_code}`}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => {
                            setEditBlockIdx(i)
                            setEditTrainIdx(null)
                          }}
                        >
                          <td className="max-w-[160px] truncate px-4 py-2.5 font-medium">{b.title}</td>
                          <td className="px-3 py-2.5 text-xs">{b.section_code}</td>
                          <td className="px-3 py-2.5 font-mono text-xs">{b.start}–{b.end}</td>
                          <td className="px-4 py-2.5 text-right text-xs capitalize">
                            {b.urgency}
                            <button
                              type="button"
                              className="ml-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-conflict"
                              aria-label={`Remove ${b.title} from plan`}
                              onClick={(e) => {
                                e.stopPropagation()
                                removePlanBlock(i)
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                      ),
                    )}
                    {plan.blocks.length === 0 && (
                      <tr>
                        <td className="px-4 py-6 text-center text-xs text-muted-foreground" colSpan={4}>
                          No maintenance windows proposed
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                loadHistory([...history, { at: new Date().toISOString(), provider: plan.provider, summary: plan.summary, trains: plan.trains.length, blocks: plan.blocks.length, outcome: 'discarded' }])
                setPlan(null)
              }}
            >
              <X className="size-4" /> Discard
            </Button>
            <Button onClick={approve}>
              <Check className="size-4" /> Approve &amp; Implement
            </Button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <p className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <History className="size-3.5" /> Plan history
            </p>
            <div className="divide-y divide-border">
              {history
                .slice()
                .reverse()
                .map((h, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs">
                    <Badge variant={h.outcome === 'approved' ? 'success' : 'neutral'}>{h.outcome}</Badge>
                    <span className="text-muted-foreground">{new Date(h.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <span>{h.trains} trains · {h.blocks} blocks</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{h.summary}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
