'use client'

import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  TrainFront, TriangleAlert, Wrench, MapPin, Clock, ArrowRight, Ban, Waypoints,
} from 'lucide-react'
import { useRailData } from '@/lib/use-rail-data'
import { useAppShell } from '@/lib/app-shell'
import { timeToHours } from '@/lib/api'
import type { Identity } from '@/lib/auth'
import type { BlockRow, StationRow, TrainRow } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Driver Console — the focused view a Driver lands on after login: their
 * assigned train, its full route/schedule, and any blocks or conflicts
 * affecting the sections that train runs through.
 */

function istNowHours(): number {
  const ist = new Date(Date.now() + 5.5 * 3_600_000)
  return ist.getUTCHours() + ist.getUTCMinutes() / 60
}

export function DriverView({ identity }: { identity: Identity }) {
  const { trains, blocks, sections, stations } = useRailData()
  const { go } = useAppShell()

  const assignedNumber = identity.assignedTrain
  const myTrain: TrainRow | null = useMemo(
    () => (assignedNumber ? trains.find((t) => t.train_number === assignedNumber) ?? null : null),
    [trains, assignedNumber],
  )
  const mySection = useMemo(
    () => (myTrain ? sections.find((s) => s.id === myTrain.section_id) ?? null : null),
    [sections, myTrain],
  )
  const stationsByCode = useMemo(() => new Map(stations.map((s) => [s.code, s])), [stations])

  // blocks/conflicts affecting any section my train's route passes through
  const routeCodes = myTrain?.route?.c ?? []
  const routeSectionIds = useMemo(() => {
    const ids = new Set<string>()
    if (mySection) ids.add(mySection.id)
    for (const s of sections) {
      if (
        (s.from_station && routeCodes.includes(s.from_station)) ||
        (s.to_station && routeCodes.includes(s.to_station))
      ) {
        ids.add(s.id)
      }
    }
    return ids
  }, [sections, mySection, routeCodes])

  const affecting = useMemo(
    () =>
      blocks
        .filter((b) => routeSectionIds.has(b.section_id))
        .filter((b) => {
          const now = Date.now()
          return b.status === 'conflict' || b.status === 'pending' ||
            (b.status === 'approved' && new Date(b.start_time).getTime() <= now && new Date(b.end_time).getTime() >= now)
        })
        .sort((a, b) => (a.status === 'conflict' ? -1 : 1)),
    [blocks, routeSectionIds],
  )
  const conflicts = affecting.filter((b) => b.status === 'conflict')

  const nowH = istNowHours()
  const progress = myTrain
    ? Math.min(1, Math.max(0, (nowH - timeToHours(myTrain.start_time)) / Math.max(0.25, timeToHours(myTrain.end_time) - timeToHours(myTrain.start_time))))
    : 0
  const running = myTrain ? nowH >= timeToHours(myTrain.start_time) && nowH <= timeToHours(myTrain.end_time) : false

  const currentIdx = myTrain?.route ? Math.floor(progress * Math.max(0, myTrain.route.c.length - 1)) : 0

  if (!assignedNumber || !myTrain) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <TrainFront className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 text-base font-semibold">No train assigned yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Your administrator assigns each driver to a train from User Management. Once assigned, your
            route, schedule, and track alerts appear here.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Assigned train header */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <TrainFront className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">
              {myTrain.train_number} · {myTrain.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              {mySection?.name ?? 'Network'} · {myTrain.start_time.slice(0, 5)}–{myTrain.end_time.slice(0, 5)} IST ·{' '}
              {myTrain.distance_km != null ? `${Math.round(myTrain.distance_km)} km` : `${myTrain.route?.c.length ?? 0} stops`}
            </p>
          </div>
          <Badge variant={running ? 'success' : 'warning'} className="text-xs">
            {running ? 'On duty — running' : 'Not yet started'}
          </Badge>
        </CardContent>
      </Card>

      {/* Route progress */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Waypoints className="size-4 text-primary" /> Route progress
            </h3>
            <span className="text-xs text-muted-foreground">
              {myTrain.route?.c[currentIdx] ?? '—'} → next stop {myTrain.route?.c[currentIdx + 1] ?? '—'}
            </span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            {(progress * 100).toFixed(0)}% of today&apos;s journey · {Math.round(progress * (myTrain.route?.c.length ?? 0))} of {myTrain.route?.c.length ?? 0} stops
          </p>
        </CardContent>
      </Card>

      {/* Alerts affecting my route */}
      <Card>
        <CardContent className="p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <TriangleAlert className={cn('size-4', conflicts.length ? 'text-conflict' : 'text-approved')} />
            Track alerts on my route
            {conflicts.length > 0 && <Badge variant="danger">{conflicts.length} conflict{conflicts.length === 1 ? '' : 's'}</Badge>}
          </h3>
          <div className="mt-3 space-y-2">
            {affecting.map((b) => {
              const sec = sections.find((s) => s.id === b.section_id)
              const isConflict = b.status === 'conflict'
              return (
                <div
                  key={b.id}
                  className={cn(
                    'flex flex-wrap items-center gap-3 rounded-lg border p-3',
                    isConflict ? 'border-conflict/40 bg-conflict/5' : 'border-border bg-muted/30',
                  )}
                >
                  <span className={cn('flex size-8 items-center justify-center rounded-lg', isConflict ? 'bg-conflict/15 text-conflict' : 'bg-pending/20 text-pending-foreground')}>
                    {isConflict ? <Ban className="size-4" /> : <Wrench className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm font-medium', isConflict && 'text-conflict')}>
                      {b.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {sec?.name ?? 'Section'} · {new Date(b.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}–
                      {new Date(b.end_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {b.urgency} urgency
                      {isConflict && ' — expect diversion/hold on this stretch'}
                    </p>
                  </div>
                  <Badge variant={isConflict ? 'danger' : b.status === 'approved' ? 'success' : 'warning'}>
                    {b.status}
                  </Badge>
                </div>
              )
            })}
            {affecting.length === 0 && (
              <p className="flex items-center gap-2 rounded-lg border border-approved/30 bg-approved/5 p-3 text-sm text-approved">
                All clear — no blocks or conflicts on your route right now.
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => go({ kind: 'station', stationCode: myTrain.route?.c[Math.max(0, currentIdx)] ?? '' })}
          >
            <MapPin className="size-4" />
            Locate me on the Network View
            <ArrowRight className="size-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Full stop list (collapsed scroll) */}
      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Full schedule — {myTrain.route?.c.length ?? 0} stops</h3>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Station</th>
                  <th className="px-3 py-2 font-medium">Arr</th>
                  <th className="px-3 py-2 font-medium">Dep</th>
                  <th className="px-3 py-2 font-medium">Day</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {myTrain.route?.c.map((code, i) => {
                  const st = stationsByCode.get(code)
                  const isCurrent = i === currentIdx && running
                  return (
                    <tr key={`${code}-${i}`} className={cn('hover:bg-muted/40', isCurrent && 'bg-primary/10 font-medium')}>
                      <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-1.5">
                        {st?.name ?? code}
                        {isCurrent && <span className="ml-2 text-[10px] font-semibold uppercase text-primary">current</span>}
                      </td>
                      <td className="px-3 py-1.5 tabular-nums">{myTrain.route?.a[i]?.slice(0, 5) ?? '—'}</td>
                      <td className="px-3 py-1.5 tabular-nums">{myTrain.route?.d[i]?.slice(0, 5) ?? '—'}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{myTrain.route?.day?.[i] ?? 1}</td>
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
