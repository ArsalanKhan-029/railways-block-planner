'use client'

import { useState } from 'react'
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
import { KPIS, TIMELINE_BARS, type TimelineBar } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const KPI_CARDS = [
  {
    label: 'Asset Availability',
    value: `${KPIS.assetAvailability}%`,
    delta: KPIS.assetAvailabilityDelta,
    positive: true,
    icon: Activity,
    tone: 'text-approved',
    bg: 'bg-approved/10',
  },
  {
    label: 'Active Blocks Today',
    value: KPIS.activeBlocks,
    delta: KPIS.activeBlocksDelta,
    positive: true,
    icon: CalendarClock,
    tone: 'text-train',
    bg: 'bg-train/10',
  },
  {
    label: 'Pending Requests',
    value: KPIS.pendingRequests,
    delta: KPIS.pendingRequestsDelta,
    positive: false,
    icon: Clock,
    tone: 'text-pending-foreground',
    bg: 'bg-pending/25',
  },
  {
    label: 'Conflict Alerts',
    value: KPIS.conflictAlerts,
    delta: KPIS.conflictAlertsDelta,
    positive: false,
    icon: AlertTriangle,
    tone: 'text-conflict',
    bg: 'bg-conflict/10',
  },
]

export function DashboardView() {
  const [selected, setSelected] = useState<TimelineBar | null>(null)
  const [range, setRange] = useState<'24h' | 'week'>('24h')

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPI_CARDS.map((kpi) => {
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
                <p className="mt-4 text-2xl font-semibold tracking-tight">{kpi.value}</p>
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

          <GanttTimeline bars={TIMELINE_BARS} onSelect={setSelected} />
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
