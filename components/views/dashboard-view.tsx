'use client'

import { useMemo, useState } from 'react'
import {
  Activity,
  CalendarClock,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  TrainFront,
  Wrench,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GanttTimeline, TimelineLegend } from '@/components/gantt-timeline'
import { SideDrawer } from '@/components/side-drawer'
import type { TimelineBar } from '@/lib/mock-data'
import { toTimelineBars } from '@/lib/mappers'
import { istDayStartUtcMs } from '@/lib/api'
import { useRailData } from '@/lib/use-rail-data'
import { cn } from '@/lib/utils'

/** One week of IST-day windows ending today (oldest first). */
function last7IstDayStarts(now = new Date()): number[] {
  const today = istDayStartUtcMs(now)
  const DAY = 24 * 60 * 60 * 1000
  return Array.from({ length: 7 }, (_, i) => today - (6 - i) * DAY)
}

export function DashboardView() {
  const { sections, trains, blocks, loading, error } = useRailData()
  const [selected, setSelected] = useState<TimelineBar | null>(null)
  const [range, setRange] = useState<'24h' | 'week'>('24h')

  const dayStart = istDayStartUtcMs()

  const bars = useMemo(
    () => toTimelineBars(trains, blocks, dayStart),
    [trains, blocks, dayStart],
  )

  // KPIs derived from live rows
  const activeBlocks = blocks.filter((b) => b.status === 'approved').length
  const pendingRequests = blocks.filter((b) => b.status === 'pending').length
  const conflictAlerts = blocks.filter((b) => b.status === 'conflict').length

  // Asset availability = % of today's timeline hours not occupied by blocks
  const availability = useMemo(() => {
    const DAY_HOURS = 24
    const sectionsCount = Math.max(1, sections.length)
    let blockedHours = 0
    for (const b of blocks) {
      const startMs = new Date(b.start_time).getTime()
      const endMs = new Date(b.end_time).getTime()
      const s = Math.max(startMs, dayStart)
      const e = Math.min(endMs, dayStart + DAY_HOURS * 3_600_000)
      if (e > s) blockedHours += (e - s) / 3_600_000
    }
    const pct = 100 - (blockedHours / (DAY_HOURS * sectionsCount)) * 100
    return Math.round(pct * 10) / 10
  }, [blocks, sections.length, dayStart])

  // Weekly view: each section-day pair is a row, labelled "Section · Mon"
  const weeklyBars = useMemo(() => {
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const starts = last7IstDayStarts()
    return starts.flatMap((start, i) => {
      const d = new Date(start + 5.5 * 3_600_000)
      const suffix = `· ${dayLabels[d.getUTCDay()]}`
      return toTimelineBars(trains, blocks, start).map((bar) => ({
        ...bar,
        sectionId: `${bar.sectionId}-d${i}`,
        label: bar.type === 'train' ? bar.label : `${bar.label} ${suffix}`,
      }))
    })
  }, [trains, blocks])

  const weeklyRows = useMemo(
    () =>
      sections.flatMap((s) =>
        last7IstDayStarts().map((start, i) => {
          const d = new Date(start + 5.5 * 3_600_000)
          const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          return {
            id: `${s.id}-d${i}`,
            name: s.name,
            code: `${s.code} · ${dayLabels[d.getUTCDay()]}`,
          }
        }),
      ),
    [sections],
  )

  const kpis = [
    {
      label: 'Asset Availability',
      value: `${availability}%`,
      delta: 1.8,
      positive: true,
      icon: Activity,
      tone: 'text-approved',
      bg: 'bg-approved/10',
    },
    {
      label: 'Active Blocks Today',
      value: activeBlocks,
      delta: 3,
      positive: true,
      icon: CalendarClock,
      tone: 'text-train',
      bg: 'bg-train/10',
    },
    {
      label: 'Pending Requests',
      value: pendingRequests,
      delta: -2,
      positive: false,
      icon: Clock,
      tone: 'text-pending-foreground',
      bg: 'bg-pending/25',
    },
    {
      label: 'Conflict Alerts',
      value: conflictAlerts,
      delta: 1,
      positive: false,
      icon: AlertTriangle,
      tone: 'text-conflict',
      bg: 'bg-conflict/10',
    },
  ]

  if (error) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-conflict">
          Failed to load data from Supabase: {error}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          const up = kpi.delta >= 0
          const good = kpi.positive ? up : !up
          return (
            <Card key={kpi.label}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <span className={cn('flex size-9 items-center justify-center rounded-lg', kpi.bg, kpi.tone)}>
                    <Icon className="size-4.5" />
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 text-xs font-medium',
                      good ? 'text-approved' : 'text-conflict',
                    )}
                  >
                    {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                    {Math.abs(kpi.delta)}
                    {kpi.label === 'Asset Availability' ? '%' : ''}
                  </span>
                </div>
                <p className="mt-4 text-2xl font-semibold tracking-tight">
                  {loading ? '…' : kpi.value}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{kpi.label}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Timeline */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Section Timeline</h2>
              <p className="text-sm text-muted-foreground">
                Train services &amp; maintenance blocks — {range === '24h' ? 'today, 24-hour view' : 'this week'}
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
              {(['24h', 'week'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                    range === r
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {r === '24h' ? '24 Hour' : 'Weekly'}
                </button>
              ))}
            </div>
          </div>

          {range === '24h' ? (
            <GanttTimeline
              bars={bars}
              onSelect={setSelected}
              sectionRows={sections.map((s) => ({ id: s.id, name: s.name, code: s.code }))}
            />
          ) : (
            <GanttTimeline bars={weeklyBars} onSelect={setSelected} sectionRows={weeklyRows} />
          )}
          <div className="border-t border-border pt-4">
            <TimelineLegend />
          </div>
        </CardContent>
      </Card>

      <BarDrawer bar={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

export function BarDrawer({ bar, onClose }: { bar: TimelineBar | null; onClose: () => void }) {
  const isTrain = bar?.detail.kind === 'Train'
  const fmt = (h: number) => {
    const hr = Math.floor(h)
    const min = Math.round((h - hr) * 60)
    return `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }

  return (
    <SideDrawer
      open={!!bar}
      onClose={onClose}
      title={bar?.label ?? ''}
      description={bar?.detail.kind}
    >
      {bar && (
        <div className="space-y-5">
          <div
            className={cn(
              'flex items-center gap-3 rounded-xl border border-border p-4',
              isTrain ? 'bg-train/5' : 'bg-approved/5',
            )}
          >
            <span
              className={cn(
                'flex size-10 items-center justify-center rounded-lg',
                isTrain ? 'bg-train/15 text-train' : 'bg-approved/15 text-approved',
              )}
            >
              {isTrain ? <TrainFront className="size-5" /> : <Wrench className="size-5" />}
            </span>
            <div>
              <p className="text-sm font-medium">
                {fmt(bar.start)} – {fmt(bar.end)}
              </p>
              <p className="text-xs text-muted-foreground">
                {(bar.end - bar.start).toFixed(1)} hour window
              </p>
            </div>
            {bar.hasConflict && (
              <Badge variant="danger" className="ml-auto">
                <AlertTriangle /> Conflict
              </Badge>
            )}
          </div>

          <dl className="space-y-3">
            {bar.detail.trainNo && <Row label="Train number" value={bar.detail.trainNo} />}
            {bar.detail.trainType && <Row label="Train type" value={bar.detail.trainType} />}
            {bar.detail.activity && <Row label="Activity" value={bar.detail.activity} />}
            {bar.detail.status && (
              <Row
                label="Status"
                value={
                  <Badge
                    variant={
                      bar.detail.status === 'Approved'
                        ? 'success'
                        : bar.detail.status === 'Pending'
                          ? 'warning'
                          : bar.detail.status === 'Conflict'
                            ? 'danger'
                            : 'info'
                    }
                  >
                    {bar.detail.status}
                  </Badge>
                }
              />
            )}
            {bar.detail.urgency && <Row label="Urgency" value={bar.detail.urgency} />}
            {bar.detail.requestedBy && <Row label="Requested by" value={bar.detail.requestedBy} />}
          </dl>

          {bar.detail.note && (
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                AI note
              </p>
              <p className="text-sm leading-relaxed">{bar.detail.note}</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button className="flex-1">View in planner</Button>
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </SideDrawer>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border pb-3 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  )
}
