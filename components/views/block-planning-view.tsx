'use client'

import { useState } from 'react'
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
import { GanttTimeline, TimelineLegend } from '@/components/gantt-timeline'
import { BarDrawer } from '@/components/views/dashboard-view'
import {
  BLOCK_REQUESTS,
  TIMELINE_BARS,
  AI_EXPLANATIONS,
  type TimelineBar,
} from '@/lib/mock-data'
import { cn } from '@/lib/utils'

type Priority = { key: string; label: string; value: number }

const URGENCY_VARIANT = { High: 'danger', Medium: 'warning', Low: 'neutral' } as const

export function BlockPlanningView() {
  const [selected, setSelected] = useState<TimelineBar | null>(null)
  const [selectedReq, setSelectedReq] = useState<string>(BLOCK_REQUESTS[0].id)
  const [running, setRunning] = useState(false)
  const [planned, setPlanned] = useState(false)
  const [priorities, setPriorities] = useState<Priority[]>([
    { key: 'punctuality', label: 'Punctuality', value: 60 },
    { key: 'throughput', label: 'Maintenance Throughput', value: 30 },
    { key: 'cost', label: 'Cost', value: 10 },
  ])

  function runPlan() {
    setRunning(true)
    setPlanned(false)
    setTimeout(() => {
      setRunning(false)
      setPlanned(true)
    }, 2200)
  }

  const conflictReq = BLOCK_REQUESTS.find((r) => r.ref === 'BR-2044')

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">
        {/* Left: pending requests */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Pending Block Requests</h2>
                <Badge variant="warning">{BLOCK_REQUESTS.length}</Badge>
              </div>
              <div className="space-y-2">
                {BLOCK_REQUESTS.map((req) => (
                  <button
                    key={req.id}
                    type="button"
                    onClick={() => setSelectedReq(req.id)}
                    className={cn(
                      'w-full rounded-lg border p-3 text-left transition-colors',
                      selectedReq === req.id
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
              </div>
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

              <GanttTimeline bars={TIMELINE_BARS} onSelect={setSelected} />
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
                    {conflictReq?.ref}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {conflictReq?.activity} overlaps train 12007 Shatabdi and a pending girder check.
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
