'use client'

import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { istDayStartUtcMs } from '@/lib/api'
import { useRailData } from '@/lib/use-rail-data'

const RATING_VARIANT: Record<string, 'success' | 'info' | 'warning' | 'danger'> = {
  Excellent: 'success',
  Good: 'info',
  Fair: 'warning',
  'Needs Attention': 'danger',
}

const axisProps = {
  tick: { fontSize: 11, fill: 'var(--muted-foreground)' },
  tickLine: false,
  axisLine: false,
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: p.color || p.fill }} />
          {p.name}: <span className="font-medium text-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

const DAY_MS = 24 * 60 * 60 * 1000
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function ratingFor(availability: number): string {
  if (availability >= 95) return 'Excellent'
  if (availability >= 93) return 'Good'
  if (availability >= 91) return 'Fair'
  return 'Needs Attention'
}

export function AnalyticsView() {
  const { sections, trains, blocks, complaints, loading } = useRailData()

  const analytics = useMemo(() => {
    const today = istDayStartUtcMs()

    // Availability trend: % of section-hours free of blocks, per day (last 7 IST days)
    const availabilityTrend = Array.from({ length: 7 }, (_, i) => {
      const dayStart = today - (6 - i) * DAY_MS
      const d = new Date(dayStart + 5.5 * 3_600_000)
      let blockedHours = 0
      for (const b of blocks) {
        const s = Math.max(new Date(b.start_time).getTime(), dayStart)
        const e = Math.min(new Date(b.end_time).getTime(), dayStart + DAY_MS)
        if (e > s) blockedHours += (e - s) / 3_600_000
      }
      const capacityHours = 24 * Math.max(1, sections.length)
      const availability =
        Math.round((100 - (blockedHours / capacityHours) * 100) * 10) / 10
      return {
        day: DAY_LABELS[d.getUTCDay()],
        availability,
        target: 92,
      }
    })

    // Utilisation: share of granted block time per section that falls on today
    const utilizationBySection = sections.map((s) => {
      const sectionBlocks = blocks.filter((b) => b.section_id === s.id)
      const totalHrs = sectionBlocks.reduce(
        (acc, b) => acc + (new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / 3_600_000,
        0,
      )
      // % of the day's 24h window occupied by granted (approved) work, scaled
      const approvedHrs = sectionBlocks
        .filter((b) => b.status === 'approved')
        .reduce(
          (acc, b) => acc + (new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / 3_600_000,
          0,
        )
      const utilization = totalHrs > 0 ? Math.round((approvedHrs / totalHrs) * 100) : 0
      return { section: s.name.replace(' Section', '').replace('–', '–'), utilization }
    })

    // Overrun frequency: blocks running past their end_time bucketed per week —
    // derived from conflict + rejected signals as a proxy per week of history
    const overrunFrequency = Array.from({ length: 6 }, (_, i) => {
      const weekStart = today - (5 - i) * 7 * DAY_MS
      const weekEnd = weekStart + 7 * DAY_MS
      const overruns = blocks.filter((b) => {
        const t = new Date(b.created_at).getTime()
        return t >= weekStart && t < weekEnd && (b.status === 'conflict' || b.status === 'rejected')
      }).length
      return { week: `W${i + 1}`, overruns }
    })

    // Complaint volume by category
    const categoryBuckets: Record<string, number> = {
      Track: 0,
      Signal: 0,
      Safety: 0,
      Overrun: 0,
      Other: 0,
    }
    for (const c of complaints) {
      if (c.category.startsWith('Track')) categoryBuckets.Track++
      else if (c.category.startsWith('Signal')) categoryBuckets.Signal++
      else if (c.category.startsWith('Safety')) categoryBuckets.Safety++
      else if (c.category.startsWith('Block')) categoryBuckets.Overrun++
      else categoryBuckets.Other++
    }
    const complaintsByCategory = Object.entries(categoryBuckets).map(([category, count]) => ({
      category,
      count,
    }))

    // Section-wise comparison from live counts
    const sectionComparison = sections.map((s) => {
      const sectionBlocks = blocks.filter((b) => b.section_id === s.id)
      let blockedHours = 0
      for (const b of sectionBlocks) {
        const st = Math.max(new Date(b.start_time).getTime(), today)
        const e = Math.min(new Date(b.end_time).getTime(), today + DAY_MS)
        if (e > st) blockedHours += (e - st) / 3_600_000
      }
      const availability =
        Math.round((100 - (blockedHours / 24) * 100) * 10) / 10
      const overruns = complaints.filter(
        (c) => c.section_id === s.id && c.category === 'Block Overrun',
      ).length
      return {
        section: s.name,
        availability,
        blocks: sectionBlocks.length,
        overruns,
        rating: ratingFor(availability),
      }
    })

    return {
      availabilityTrend,
      utilizationBySection,
      overrunFrequency,
      complaintsByCategory,
      sectionComparison,
      trainCount: trains.length,
    }
  }, [sections, trains, blocks, complaints])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Availability trend */}
        <Card>
          <CardHeader>
            <CardTitle>Asset Availability Trend</CardTitle>
            <CardDescription>Daily availability vs 92% target</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={analytics.availabilityTrend} margin={{ left: -20, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="availFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" {...axisProps} />
                <YAxis domain={[88, 96]} {...axisProps} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="availability"
                  name="Availability %"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#availFill)"
                />
                <Line
                  type="monotone"
                  dataKey="target"
                  name="Target"
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Utilization by section */}
        <Card>
          <CardHeader>
            <CardTitle>Block Utilisation by Section</CardTitle>
            <CardDescription>% of granted block time actually used</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={analytics.utilizationBySection} margin={{ left: -20, right: 8, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="section" {...axisProps} interval={0} angle={-12} textAnchor="end" height={48} />
                <YAxis {...axisProps} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--muted)' }} />
                <Bar dataKey="utilization" name="Utilisation %" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Overrun frequency */}
        <Card>
          <CardHeader>
            <CardTitle>Block Overrun Frequency</CardTitle>
            <CardDescription>
              Flagged blocks per week{loading ? '' : ` · ${analytics.trainCount} services tracked`}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={analytics.overrunFrequency} margin={{ left: -20, right: 8, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="week" {...axisProps} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="overruns"
                  name="Overruns"
                  stroke="var(--chart-5)"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: 'var(--chart-5)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Complaints by category */}
        <Card>
          <CardHeader>
            <CardTitle>Complaint Volume by Category</CardTitle>
            <CardDescription>Reports logged in the database</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={analytics.complaintsByCategory}
                layout="vertical"
                margin={{ left: 12, right: 12, top: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" {...axisProps} allowDecimals={false} />
                <YAxis type="category" dataKey="category" width={64} {...axisProps} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--muted)' }} />
                <Bar dataKey="count" name="Complaints" fill="var(--chart-3)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Section comparison table */}
      <Card>
        <CardHeader>
          <CardTitle>Section-wise Comparison</CardTitle>
          <CardDescription>Availability, throughput and reliability across sections</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0 pt-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-y border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Section</th>
                  <th className="px-3 py-3 font-medium">Availability</th>
                  <th className="px-3 py-3 font-medium">Blocks</th>
                  <th className="px-3 py-3 font-medium">Overruns</th>
                  <th className="px-5 py-3 font-medium">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {analytics.sectionComparison.map((s) => (
                  <tr key={s.section} className="hover:bg-muted/40">
                    <td className="px-5 py-3 font-medium">{s.section}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${s.availability}%` }}
                          />
                        </div>
                        <span className="tabular-nums">{s.availability}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{s.blocks}</td>
                    <td className="px-3 py-3 tabular-nums">{s.overruns}</td>
                    <td className="px-5 py-3">
                      <Badge variant={RATING_VARIANT[s.rating]}>{s.rating}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
