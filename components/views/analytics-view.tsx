'use client'

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
import {
  AVAILABILITY_TREND,
  UTILIZATION_BY_SECTION,
  OVERRUN_FREQUENCY,
  COMPLAINTS_BY_CATEGORY,
  SECTION_COMPARISON,
} from '@/lib/mock-data'

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

export function AnalyticsView() {
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
              <AreaChart data={AVAILABILITY_TREND} margin={{ left: -20, right: 8, top: 4 }}>
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
              <BarChart data={UTILIZATION_BY_SECTION} margin={{ left: -20, right: 8, top: 4 }}>
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
            <CardDescription>Overruns per week (trending down)</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={OVERRUN_FREQUENCY} margin={{ left: -20, right: 8, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="week" {...axisProps} />
                <YAxis {...axisProps} />
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
            <CardDescription>Reports logged this quarter</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={COMPLAINTS_BY_CATEGORY}
                layout="vertical"
                margin={{ left: 12, right: 12, top: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" {...axisProps} />
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
                {SECTION_COMPARISON.map((s) => (
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
