'use client'

import { useMemo, useState } from 'react'
import {
  Sparkles,
  Loader2,
  CircleAlert,
  CircleCheck,
  TriangleAlert,
  ChevronRight,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { GanttTimeline, TimelineLegend } from '@/components/gantt-timeline'
import { BarDrawer } from '@/components/views/dashboard-view'
import { AI_EXPLANATIONS, type TimelineBar } from '@/lib/mock-data'
import { toBlockRequests, toTimelineBars } from '@/lib/mappers'
import { istDayStartUtcMs, insertBlock, updateBlockStatus } from '@/lib/api'
import { useRailData } from '@/lib/use-rail-data'
import { useAuth, profileToRole } from '@/lib/auth'
import { cn } from '@/lib/utils'

type Priority = { key: string; label: string; value: number }

const URGENCY_VARIANT = { High: 'danger', Medium: 'warning', Low: 'neutral' } as const

/** ISO timestamp in IST for today at the given decimal hour. */
function istTodayTimestamp(hour: number): string {
  const dayStart = istDayStartUtcMs()
  const ms = dayStart + hour * 3_600_000
  return new Date(ms).toISOString()
}

function NewRequestForm({ onDone }: { onDone: () => void }) {
  const { sections } = useRailData()
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const title = String(fd.get('title') || '').trim()
    const sectionId = String(fd.get('section') || '')
    const start = String(fd.get('start') || '02:00')
    const hrs = Number(fd.get('duration') || 2)
    const urgency = String(fd.get('urgency') || 'medium') as 'low' | 'medium' | 'high'
    if (!title || !sectionId) return

    const [sh, sm] = start.split(':').map(Number)
    const startHour = sh + (sm || 0) / 60

    setSaving(true)
    const { error } = await insertBlock({
      section_id: sectionId,
      title,
      block_type: 'maintenance',
      start_time: istTodayTimestamp(startHour),
      end_time: istTodayTimestamp(startHour + hrs),
      urgency,
    })
    setSaving(false)
    if (!error) onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nb-title">Activity</Label>
        <Input id="nb-title" name="title" placeholder="e.g. Rail grinding" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nb-section">Section</Label>
        <Select id="nb-section" name="section" required>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nb-start">Start time</Label>
          <Input id="nb-start" name="start" type="time" defaultValue="02:00" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nb-duration">Duration (h)</Label>
          <Input id="nb-duration" name="duration" type="number" min="0.5" step="0.5" defaultValue={2} required />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nb-urgency">Urgency</Label>
        <Select id="nb-urgency" name="urgency" defaultValue="medium">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </Select>
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" className="flex-1" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          Save request
        </Button>
      </div>
    </form>
  )
}

export function BlockPlanningView({
  focusBlockId,
  onConsumeFocus,
}: {
  /** Deep-linked conflict block (from Network View / search) — highlighted here. */
  focusBlockId?: string | null
  onConsumeFocus?: () => void
} = {}) {
  const { sections, trains, blocks, refresh, loading } = useRailData()
  const { identity } = useAuth()
  const role = profileToRole(identity?.role)
  const [selected, setSelected] = useState<TimelineBar | null>(null)
  const [selectedReq, setSelectedReq] = useState<string | null>(null)
  /** Request click → timeline bar pulse (step-4 visual link). */
  const [highlightBlockId, setHighlightBlockId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [planned, setPlanned] = useState(false)
  const [creating, setCreating] = useState(false)
  const [priorities, setPriorities] = useState<Priority[]>([
    { key: 'punctuality', label: 'Punctuality', value: 60 },
    { key: 'throughput', label: 'Maintenance Throughput', value: 30 },
    { key: 'cost', label: 'Cost', value: 10 },
  ])

  // Conflict Center deep-link: surface the focused block even when it is not
  // in the pending list (e.g. a conflict flagged from the Network View).
  const focusBlock = useMemo(
    () => blocks.find((b) => b.id === focusBlockId) ?? null,
    [blocks, focusBlockId],
  )

  const requests = useMemo(() => toBlockRequests(blocks, sections), [blocks, sections])
  const bars = useMemo(
    () => toTimelineBars(trains, blocks, istDayStartUtcMs()),
    [trains, blocks],
  )
  const effectiveSelected = selectedReq ?? requests[0]?.id ?? null
  const conflictReq = requests.find((r) => r.activity === 'Signal cable replacement')
  // Approve/Reject authority — Admin and Section Controller only. Maintenance
  // Engineers raise and flag requests but cannot grant or deny them.
  const canDecide = role === 'Admin' || role === 'Section Controller'

  function runPlan() {
    setRunning(true)
    setPlanned(false)
    setTimeout(() => {
      setRunning(false)
      setPlanned(true)
    }, 2200)
  }

  async function setReqStatus(id: string, status: 'approved' | 'rejected' | 'conflict') {
    const { error } = await updateBlockStatus(id, status)
    if (!error) {
      if (status === 'conflict') {
        const { notifyConflict } = await import('@/lib/api')
        void notifyConflict(id)
      }
      refresh()
    }
  }

  return (
    <div className="space-y-6">
      {focusBlock && (
        <Card className="border-conflict/50">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <TriangleAlert className="size-5 shrink-0 text-conflict" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-conflict">Conflict · {focusBlock.title}</p>
              <p className="text-xs text-muted-foreground">
                {sections.find((s) => s.id === focusBlock.section_id)?.name ?? 'Unknown section'} · raised by {focusBlock.requested_by} · urgency {focusBlock.urgency}
              </p>
            </div>
            <Button
              size="sm"
              disabled={running}
              onClick={async () => {
                await updateBlockStatus(focusBlock.id, 'approved')
                onConsumeFocus?.()
                refresh()
              }}
            >
              Resolve — approve
            </Button>
            <Button size="sm" variant="outline" onClick={onConsumeFocus}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">
        {/* Left: pending requests */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Pending Block Requests</h2>
                <Badge variant="warning">{loading ? '…' : requests.length}</Badge>
              </div>
              <div className="space-y-2">
                {requests.map((req) => (
                  <button
                    key={req.id}
                    type="button"
                    onClick={() => {
                      setSelectedReq(req.id)
                      // flash the matching bar on the Conflict Center timeline
                      setHighlightBlockId(null)
                      requestAnimationFrame(() => {
                        setHighlightBlockId(req.id)
                        document
                          .querySelector('[data-conflict-timeline]')
                          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        setTimeout(() => setHighlightBlockId(null), 3200)
                      })
                    }}
                    className={cn(
                      'w-full rounded-lg border p-3 text-left transition-colors',
                      effectiveSelected === req.id
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-border hover:bg-muted/50',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{req.ref}</span>
                      <Badge variant={URGENCY_VARIANT[req.urgency]}>{req.urgency}</Badge>
                    </div>
                    <p className="mt-1.5 text-sm font-medium leading-tight">{req.activity}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{req.section}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{req.durationHrs}h · {req.requestedBy}</span>
                      <span>{req.requestedAt}</span>
                    </div>
                  </button>
                ))}
                {requests.length === 0 && !loading && (
                  <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                    No pending requests — all clear.
                  </p>
                )}
              </div>

              {effectiveSelected && (
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3">
                  {/* Approve/Reject authority: Admin + Section Controller only.
                      Maintenance Engineers raise/flag but do not approve. */}
                  {canDecide && (
                    <Button
                      size="sm"
                      className="h-8 px-2 text-xs"
                      disabled={running}
                      onClick={() => setReqStatus(effectiveSelected, 'approved')}
                    >
                      Approve
                    </Button>
                  )}
                  {canDecide && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2 text-xs"
                      disabled={running}
                      onClick={() => setReqStatus(effectiveSelected, 'rejected')}
                    >
                      Reject
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className={canDecide ? 'h-8 px-2 text-xs' : 'col-span-3 h-8 px-2 text-xs'}
                    disabled={running}
                    onClick={() => setReqStatus(effectiveSelected, 'conflict')}
                  >
                    Flag
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <button
                type="button"
                onClick={() => setCreating((v) => !v)}
                className="flex w-full items-center justify-between text-left"
              >
                <div>
                  <h2 className="text-sm font-semibold">New Block Request</h2>
                  <p className="text-xs text-muted-foreground">Raise a maintenance window</p>
                </div>
                <ChevronRight className={cn('size-4 text-muted-foreground transition-transform', creating && 'rotate-90')} />
              </button>
              {creating && (
                <div className="mt-4 border-t border-border pt-4">
                  <NewRequestForm
                    onDone={() => {
                      setCreating(false)
                      refresh()
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: timeline + controls */}
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Conflict Center — Interactive Plan</h2>
                  <p className="text-sm text-muted-foreground">
                    Requests visualised against live train paths
                  </p>
                </div>
                <Button onClick={runPlan} disabled={running}>
                  {running ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  {running ? 'Optimising…' : 'Generate Optimal Plan'}
                </Button>
              </div>

              {running && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <Loader2 className="size-4 animate-spin" />
                    AI planner running…
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
                    <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Evaluating 1,204 candidate schedules against punctuality, throughput and cost weights.
                  </p>
                </div>
              )}

              {planned && !running && (
                <div className="flex items-center gap-2 rounded-lg border border-approved/30 bg-approved/10 p-3 text-sm text-approved">
                  <CircleCheck className="size-4" />
                  Optimal plan generated — 5 blocks scheduled, 1 held for review, 0 punctuality breaches.
                </div>
              )}

              <div data-conflict-timeline>
                <GanttTimeline
                  bars={bars}
                  onSelect={setSelected}
                  sectionRows={sections.map((s) => ({ id: s.id, name: s.name, code: s.code }))}
                  highlightBarId={highlightBlockId}
                />
              </div>
              <div className="border-t border-border pt-4">
                <TimelineLegend />
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Optimization priorities */}
            <Card>
              <CardContent className="space-y-4 p-5">
                <div>
                  <h2 className="text-sm font-semibold">Optimisation Priorities</h2>
                  <p className="text-sm text-muted-foreground">
                    Weight the trade-offs the planner should favour
                  </p>
                </div>
                {priorities.map((p, idx) => (
                  <div key={p.key} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{p.label}</span>
                      <span className="font-mono text-xs text-muted-foreground">{p.value}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={p.value}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        setPriorities((prev) =>
                          prev.map((q, i) => (i === idx ? { ...q, value: v } : q)),
                        )
                      }}
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                      style={{
                        background: `linear-gradient(to right, var(--primary) ${p.value}%, var(--muted) ${p.value}%)`,
                      }}
                    />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Re-run the planner to apply updated weights.
                </p>
              </CardContent>
            </Card>

            {/* Conflict comparison card */}
            <Card className="border-conflict/30">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-conflict/10 text-conflict">
                    <TriangleAlert className="size-4" />
                  </span>
                  <h2 className="text-sm font-semibold">Conflict Trade-off</h2>
                  <Badge variant="danger" className="ml-auto">
                    {conflictReq?.ref ?? '—'}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {conflictReq
                    ? `${conflictReq.activity} overlaps train 12007 Shatabdi and a pending girder check.`
                    : 'No active conflicts to review right now.'}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs font-medium text-muted-foreground">If approved now</p>
                    <p className="mt-1 text-sm font-semibold text-conflict">1 train delayed 18m</p>
                    <p className="text-xs text-muted-foreground">Cost saved ₹42k</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs font-medium text-muted-foreground">If deferred 3h</p>
                    <p className="mt-1 text-sm font-semibold text-approved">0 trains delayed</p>
                    <p className="text-xs text-muted-foreground">Extra crew ₹18k</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="w-full">
                  Resolve conflict
                  <ChevronRight />
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* AI explanation */}
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Sparkles className="size-4" />
                </span>
                <h2 className="text-sm font-semibold">AI Explanation</h2>
                <span className="text-xs text-muted-foreground">Plain-language scheduling rationale</span>
              </div>
              <div className="space-y-3">
                {AI_EXPLANATIONS.map((ex) => (
                  <div
                    key={ex.block}
                    className="flex gap-3 rounded-lg border border-border p-3.5"
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full',
                        ex.impact === 'positive'
                          ? 'bg-approved/15 text-approved'
                          : 'bg-pending/25 text-pending-foreground',
                      )}
                    >
                      {ex.impact === 'positive' ? (
                        <CircleCheck className="size-3.5" />
                      ) : (
                        <CircleAlert className="size-3.5" />
                      )}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{ex.block}</p>
                        <Badge variant={ex.impact === 'positive' ? 'success' : 'warning'}>
                          {ex.decision}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{ex.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <BarDrawer bar={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
