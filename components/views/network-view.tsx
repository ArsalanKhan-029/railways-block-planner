'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Plus, Minus, Maximize2, Loader2, Radar, TrainFront, Wrench,
  TriangleAlert, ChevronDown, Download, Clock, Layers, Ban, Eye, EyeOff,
} from 'lucide-react'
import { useRailData } from '@/lib/use-rail-data'
import { useAuth } from '@/lib/auth'
import { useAppShell } from '@/lib/app-shell'
import { projectToUnit } from '@/lib/geo'
import { istDayStartUtcMs, timestampToIstHours, timeToHours } from '@/lib/api'
import { setSectionConflict, deleteBlock, deleteComplaint, updateComplaintStatus } from '@/lib/api'
import type { BlockRow, ComplaintRow, SectionRow, StationRow, TrainRow } from '@/lib/types'
import { ConfirmDelete } from '@/components/confirm-delete'
import { cn } from '@/lib/utils'

/**
 * Network View — real Indian Railways topology from the seeded stations table
 * (3,500+ real stations with lat/lng), sections drawn as hub-to-hub track
 * lines, live train markers positioned by real schedule times, and conflict
 * blocks rendered as dashed red BLOCKED segments (SIH visual style).
 */

const HUB_TIER_STYLE = {
  hub: { r: 7, fill: '#f59e0b', label: true },
  junction: { r: 5, fill: '#38bdf8', label: true },
  station: { r: 1.6, fill: '#22d3ee', label: false },
} as const

const LEGEND_LAYERS = [
  { id: 'stations', label: 'Mapped stations', color: '#22d3ee' },
  { id: 'junctions', label: 'Labeled junctions', color: '#38bdf8' },
  { id: 'hubs', label: 'Zonal / metro hubs', color: '#f59e0b' },
  { id: 'tracks', label: 'Railway track', color: '#64748b' },
  { id: 'trains', label: 'Running trains (glow)', color: '#a3e635' },
  { id: 'conflicts', label: 'Blocked track + label', color: '#ef4444' },
] as const

// complaint issues share the conflicts layer toggle (both are problem overlays)

type LayerId = (typeof LEGEND_LAYERS)[number]['id']

/** time HH:MM:SS -> decimal hours */
function h(time: string | null | undefined): number {
  if (!time) return NaN
  const [hh, mm] = time.split(':').map(Number)
  return hh + (mm ?? 0) / 60
}

interface TrainPos {
  train: TrainRow
  from: StationRow
  to: StationRow
  /** 0..1 between from and to */
  t: number
  /** status at scrubbed time */
  running: boolean
  scheduledDeparture: string | null
  scheduledArrival: string | null
  segmentIndex: number
  routeCodes: string[]
}

/**
 * Compute a train's position at a given IST decimal hour using its real
 * route stop times. Finds the segment between the two nearest stations the
 * train is between at that moment.
 */
function positionAt(
  tr: TrainRow,
  stationsByCode: Map<string, StationRow>,
  nowH: number,
  sectionEndpoints?: { from: StationRow | null; to: StationRow | null },
): TrainPos | null {
  const route = tr.route
  // manually scheduled trains have no per-stop route jsonb — fall back to the
  // section's two endpoint stations so they still render on the map
  if (!route || !route.c || route.c.length < 2) {
    const f = sectionEndpoints?.from
    const t2 = sectionEndpoints?.to
    if (!f || !t2) return null
    const startH = h(tr.start_time)
    const endH = h(tr.end_time)
    if (nowH < startH || nowH > endH) return null
    const span = Math.max(0.25, endH - startH)
    const t = Math.min(1, Math.max(0, (nowH - startH) / span))
    return {
      train: tr,
      from: f,
      to: t2,
      t,
      running: true,
      scheduledDeparture: tr.start_time.slice(0, 5),
      scheduledArrival: tr.end_time.slice(0, 5),
      segmentIndex: 0,
      routeCodes: [f.code, t2.code],
    }
  }
  const codes = route.c
  const arr = route.a
  const dep = route.d
  const day = route.day ?? codes.map(() => 1)

  // build absolute hour offsets (day-1)*24 + time; day 1 = today on the map
  const abs: (number | null)[] = []
  for (let i = 0; i < codes.length; i++) {
    const d = (day[i] ?? 1) - 1
    const a = arr[i] ? h(arr[i]) : null
    const dp = dep[i] ? h(dep[i]) : null
    const base = d * 24
    if (a != null) abs.push(base + a)
    else if (dp != null) abs.push(base + dp)
    else abs.push(i === 0 ? 0 : null)
  }

  // find surrounding stops
  let idx = -1
  for (let i = 0; i < abs.length - 1; i++) {
    const a0 = abs[i], a1 = abs[i + 1]
    if (a0 == null || a1 == null) continue
    if (nowH >= a0 && nowH <= a1) { idx = i; break }
  }
  if (idx < 0) {
    // before departure or after arrival on day 1 — show only within ±1h of first/last
    const first = abs.find((v) => v != null) ?? 0
    const lastAbs = abs.filter((v): v is number => v != null)
    const last = lastAbs.length ? lastAbs[lastAbs.length - 1] : 24
    if (nowH < first - 1 || nowH > last + 1) return null
    idx = nowH < first ? 0 : abs.length - 2
  }

  const fromCode = codes[idx]
  const toCode = codes[idx + 1]
  const from = stationsByCode.get(fromCode)
  const to = stationsByCode.get(toCode)
  if (!from || !to) return null

  const a0 = abs[idx] ?? 0
  const a1 = abs[idx + 1] ?? a0 + 0.5
  const t = Math.min(1, Math.max(0, (nowH - a0) / Math.max(0.05, a1 - a0)))

  return {
    train: tr,
    from, to, t,
    running: nowH >= (abs[0] ?? 0) && nowH <= (abs[abs.length - 1] ?? 24),
    scheduledDeparture: dep[idx] ?? arr[idx] ?? null,
    scheduledArrival: arr[idx + 1] ?? dep[idx + 1] ?? null,
    segmentIndex: idx,
    routeCodes: codes,
  }
}

export function NetworkView() {
  const { stations, sections, trains, blocks, complaints, assets, loading, refresh } = useRailData()
  const { theme, target, clearTarget, setView } = useAppShell()
  const { identity } = useAuth()
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [hoverTrain, setHoverTrain] = useState<TrainPos | null>(null)
  const [hoverConflict, setHoverConflict] = useState<{ block: BlockRow; section: SectionRow } | null>(null)
  const [hoverIssue, setHoverIssue] = useState<{ section: SectionRow; list: ComplaintRow[] } | null>(null)
  const [selectedIssue, setSelectedIssue] = useState<{ section: SectionRow; list: ComplaintRow[] } | null>(null)
  const [selectedTrain, setSelectedTrain] = useState<TrainRow | null>(null)
  const [selectedConflict, setSelectedConflict] = useState<{ block: BlockRow; section: SectionRow } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<BlockRow | null>(null)
  const [layers, setLayers] = useState<Set<LayerId>>(new Set(LEGEND_LAYERS.map((l) => l.id)))
  const [legendOpen, setLegendOpen] = useState(true)
  const [scrubH, setScrubH] = useState<number | null>(null) // null = live clock
  // admin route-visibility control (7B): hidden section ids persist across
  // sessions in localStorage; routes whose assets are all inactive flag
  // themselves hidden by default but stay manually overridable
  const [hiddenRoutes, setHiddenRoutes] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('railmind-hidden-routes') ?? '[]'))
    } catch {
      return new Set<string>()
    }
  })
  const [routesOpen, setRoutesOpen] = useState(false)

  function setVisibleRoutes(next: Set<string>) {
    setHiddenRoutes(next)
    localStorage.setItem('railmind-hidden-routes', JSON.stringify([...next]))
  }
  const [nowH, setNowH] = useState(() => {
    const ist = new Date(Date.now() + 5.5 * 3_600_000)
    return ist.getUTCHours() + ist.getUTCMinutes() / 60
  })
  const dragging = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 900, h: 640 })

  // live clock tick (only when not scrubbing)
  useEffect(() => {
    if (scrubH != null) return
    const id = setInterval(() => {
      const ist = new Date(Date.now() + 5.5 * 3_600_000)
      setNowH(ist.getUTCHours() + ist.getUTCMinutes() / 60)
    }, 30_000)
    return () => clearInterval(id)
  }, [scrubH])

  const activeH = scrubH ?? nowH

  const stationsByCode = useMemo(() => new Map(stations.map((s) => [s.code, s])), [stations])
  const sectionById = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections])

  // Stations stacked at (near-)identical coordinates collapse to the most
  // important one so markers/labels stay distinguishable at junction areas.
  const tierRank = { hub: 0, junction: 1, station: 2 } as const
  const dedupedStations = useMemo(() => {
    const byKey = new Map<string, StationRow>()
    for (const s of stations) {
      const key = `${s.latitude.toFixed(3)},${s.longitude.toFixed(3)}`
      const prev = byKey.get(key)
      if (!prev || (tierRank[s.tier as keyof typeof tierRank] ?? 2) < (tierRank[prev.tier as keyof typeof tierRank] ?? 2)) {
        byKey.set(key, s)
      }
    }
    return [...byKey.values()]
  }, [stations])

  // project every station once
  const projected = useMemo(() => {
    const m = new Map<string, { x: number; y: number; s: StationRow }>()
    for (const s of stations) {
      const p = projectToUnit(s.latitude, s.longitude)
      m.set(s.code, { ...p, s })
    }
    return m
  }, [stations])

  // section track lines: from-hub -> to-hub, bent through intermediate mapped
  // stations that actually lie near the straight line (perpendicular-distance
  // corridor, ordered by projection along the segment)
  const sectionPaths = useMemo(() => {
    const corridor = 0.014
    const distToSeg = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = b.x - a.x, dy = b.y - a.y
      const len2 = dx * dx + dy * dy
      let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0
      t = Math.max(0, Math.min(1, t))
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    }
    const out: { section: SectionRow; d: string; pts: { x: number; y: number }[] }[] = []
    const minorStations = stations.filter((s) => s.tier === 'station')
    for (const sec of sections) {
      const a = sec.from_station ? stationsByCode.get(sec.from_station) : null
      const b = sec.to_station ? stationsByCode.get(sec.to_station) : null
      if (!a || !b) continue
      const pa = projected.get(a.code)!
      const pb = projected.get(b.code)!
      const between = minorStations
        .map((s) => ({ p: projected.get(s.code)! }))
        .filter(({ p }) => p && distToSeg(p, pa, pb) < corridor)
        .sort((u, v) =>
          (u.p.x - pa.x) ** 2 + (u.p.y - pa.y) ** 2 - ((v.p.x - pa.x) ** 2 + (v.p.y - pa.y) ** 2),
        )
        .slice(0, 20)
        .map((x) => x.p)
      const pts = [pa, ...between, pb]
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.x * 1000).toFixed(1)},${(p.y * 1000).toFixed(1)}`).join('')
      out.push({ section: sec, d, pts })
    }
    return out
  }, [sections, stations, stationsByCode, projected])

  // assets per section + asset-inactive detection for the visibility panel
  const sectionActivity = useMemo(() => {
    const out = new Map<string, { total: number; active: number }>()
    for (const a of assets) {
      if (!a.section_id) continue
      const cur = out.get(a.section_id) ?? { total: 0, active: 0 }
      cur.total += 1
      if (a.status === 'operational' || a.status === 'degraded') cur.active += 1
      out.set(a.section_id, cur)
    }
    return out
  }, [assets])
  const hasAssets = assets.length > 0
  const isRouteAutoInactive = useCallback(
    (sectionId: string) => {
      const act = sectionActivity.get(sectionId)
      return hasAssets ? !!act && act.total > 0 && act.active === 0 : false
    },
    [sectionActivity, hasAssets],
  )
  const isVisibleRoute = useCallback(
    (sectionId: string) => {
      if (hiddenRoutes.has(sectionId)) return false
      return true
    },
    [hiddenRoutes],
  )

  // conflicts: conflict-status blocks mapped onto their section — drawn as a
  // straight dashed overlay between the section's two hub endpoints (image-2
  // "BLOCKED" schematic style) with the section path for hover hit-testing
  const conflicts = useMemo(() => {
    const out: { block: BlockRow; section: SectionRow; pathIdx: number; d: string; mid: { x: number; y: number } }[] = []
    for (const b of blocks) {
      if (b.status !== 'conflict') continue
      const sec = sectionById.get(b.section_id)
      if (!sec) continue
      const pathIdx = sectionPaths.findIndex((sp) => sp.section.id === sec.id)
      const a = sec.from_station ? projected.get(sec.from_station) : null
      const bb = sec.to_station ? projected.get(sec.to_station) : null
      if (!a || !bb) continue
      const d = `M${a.x * 1000},${a.y * 1000}L${bb.x * 1000},${bb.y * 1000}`
      const mid = { x: (a.x + bb.x) / 2, y: (a.y + bb.y) / 2 }
      out.push({ block: b, section: sec, pathIdx, d, mid })
    }
    return out
  }, [blocks, sectionById, sectionPaths, projected])

  // complaint-originated issues: open complaints grouped per section — amber
  // warning markers on the affected track, distinct from red conflict blocks
  const complaintIssues = useMemo(() => {
    const bySection = new Map<string, ComplaintRow[]>()
    for (const c of complaints) {
      if (c.status === 'resolved' || !c.section_id) continue
      const list = bySection.get(c.section_id) ?? []
      list.push(c)
      bySection.set(c.section_id, list)
    }
    const out: { section: SectionRow; list: ComplaintRow[]; mid: { x: number; y: number } }[] = []
    for (const [sectionId, list] of bySection) {
      const sec = sectionById.get(sectionId)
      const a = sec?.from_station ? projected.get(sec.from_station) : null
      const bb = sec?.to_station ? projected.get(sec.to_station) : null
      if (!sec || !a || !bb) continue
      out.push({ section: sec, list, mid: { x: (a.x + bb.x) / 2, y: (a.y + bb.y) / 2 } })
    }
    return out
  }, [complaints, sectionById, projected])

  // train positions at activeH — trains without a route jsonb fall back to
  // their section's two endpoint stations so manually scheduled services render
  const trainPositions = useMemo(() => {
    if (!trains.length || !stationsByCode.size) return []
    const out: TrainPos[] = []
    for (const tr of trains) {
      let endpoints: { from: StationRow | null; to: StationRow | null } | undefined
      if (!tr.route || !tr.route.c || tr.route.c.length < 2) {
        const sec = sectionById.get(tr.section_id)
        endpoints = {
          from: sec?.from_station ? stationsByCode.get(sec.from_station) ?? null : null,
          to: sec?.to_station ? stationsByCode.get(sec.to_station) ?? null : null,
        }
      }
      const p = positionAt(tr, stationsByCode, activeH, endpoints)
      if (p) out.push(p)
    }
    return out
  }, [trains, stationsByCode, activeH, sectionById])

  // deep-link intents from search / conflict center
  useEffect(() => {
    if (!target) return
    if (target.kind === 'train') {
      setSelectedTrain(target.train)
      clearTarget()
    } else if (target.kind === 'conflict') {
      const sec = sectionById.get(target.block.section_id)
      if (sec) setSelectedConflict({ block: target.block, section: sec })
      clearTarget()
    } else if (target.kind === 'station') {
      const p = projected.get(target.stationCode)
      if (p) {
        setZoom(4)
        setPan({ x: (0.5 - p.x) * size.w * 4, y: (0.5 - p.y) * size.h * 4 })
      }
      clearTarget()
    } else if (target.kind === 'section') {
      const sec = sections.find((s) => s.id === target.section.id)
      if (sec && sec.from_station && sec.to_station) {
        const pa = projected.get(sec.from_station)
        const pb = projected.get(sec.to_station)
        if (pa && pb) {
          const cx = (pa.x + pb.x) / 2, cy = (pa.y + pb.y) / 2
          setZoom(3)
          setPan({ x: (0.5 - cx) * size.w * 3, y: (0.5 - cy) * size.h * 3 })
        }
      }
      clearTarget()
    }
  }, [target, projected, sections, size, clearTarget])

  // container size
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      setSize({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // map viewBox covers India with a little padding; aspect 30:25
  const VB = { w: 1000, h: 833 }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18
    setZoom((z) => Math.min(24, Math.max(0.7, z * factor)))
  }
  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as Element).closest('[data-interactive]')) return
    dragging.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return
    setPan({
      x: dragging.current.px + (e.clientX - dragging.current.x),
      y: dragging.current.py + (e.clientY - dragging.current.y),
    })
  }
  function onPointerUp() {
    dragging.current = null
  }
  function resetView() {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  function toggleLayer(id: LayerId) {
    setLayers((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  // export the SVG as PNG
  async function exportPng() {
    const svg = svgRef.current
    if (!svg) return
    const xml = new XMLSerializer().serializeToString(svg)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    await new Promise<void>((res, rej) => {
      img.onload = () => res()
      img.onerror = rej
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = 2400
    canvas.height = 2000
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = theme === 'dark' ? '#0b1220' : '#f8fafc'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(url)
    const a = document.createElement('a')
    a.download = `railmind-network-${new Date().toISOString().slice(0, 10)}.png`
    a.href = canvas.toDataURL('image/png')
    a.click()
  }

  const visibleHubs = layers.has('hubs')
  const visibleJunctions = layers.has('junctions')
  const visibleStations = layers.has('stations')
  const visibleTracks = layers.has('tracks')
  const visibleTrains = layers.has('trains')
  const visibleConflicts = layers.has('conflicts')

  const conflictCount = conflicts.length
  const runningCount = trainPositions.filter((p) => p.running).length

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <Radar className="size-4 animate-pulse text-approved" />
          <span className="font-medium">{loading ? '…' : runningCount}</span>
          <span className="text-muted-foreground">trains running</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <Wrench className="size-4 text-pending-foreground" />
          <span className="font-medium">{loading ? '…' : blocks.filter((b) => b.status === 'approved' || b.status === 'conflict').length}</span>
          <span className="text-muted-foreground">active blocks</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-conflict/30 bg-conflict/10 px-3 py-2 text-sm">
          <TriangleAlert className="size-4 text-conflict" />
          <span className="font-medium text-conflict">{loading ? '…' : conflictCount}</span>
          <span className="text-muted-foreground">blocked segments</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={exportPng}>
            <Download />
            Export PNG
          </Button>
          <button type="button" onClick={() => setZoom((z) => Math.max(0.7, z / 1.3))} className="rounded-lg border border-border bg-card p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Zoom out">
            <Minus className="size-4" />
          </button>
          <span className="w-12 text-center font-mono text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(24, z * 1.3))} className="rounded-lg border border-border bg-card p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Zoom in">
            <Plus className="size-4" />
          </button>
          <button type="button" onClick={resetView} className="rounded-lg border border-border bg-card p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Reset view">
            <Maximize2 className="size-4" />
          </button>
        </div>
      </div>

      {/* Map + legend */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_240px]">
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div
              ref={wrapRef}
              className={cn('relative h-[620px] w-full cursor-grab touch-none select-none overflow-hidden bg-background', dragging.current && 'cursor-grabbing')}
              onWheel={onWheel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  <Loader2 className="mr-2 size-5 animate-spin" /> Loading network…
                </div>
              ) : (
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${VB.w} ${VB.h}`}
                  className="h-full w-full"
                  style={{ transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`, transformOrigin: 'center center' }}
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke={theme === 'dark' ? '#1e293b' : '#e2e8f0'} strokeWidth="1" />
                    </pattern>
                    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="3" result="b" />
                      <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                  </defs>
                  <rect width={VB.w} height={VB.h} fill="url(#grid)" opacity={0.5} />

                  {/* tracks */}
                  {visibleTracks && sectionPaths.filter((sp) => isVisibleRoute(sp.section.id)).map((sp) => (
                    <path key={sp.section.id} d={sp.d} fill="none" stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} strokeWidth={2} strokeOpacity={0.8} vectorEffect="non-scaling-stroke" />
                  ))}

                  {/* conflict dashed overlays — straight segment + BLOCKED label */}
                  {visibleConflicts && conflicts.map((c) => (
                    <g key={c.block.id} data-interactive onMouseEnter={() => setHoverConflict(c)} onMouseLeave={() => setHoverConflict(null)} onClick={() => setSelectedConflict(c)} className="cursor-pointer">
                      <path d={c.d} fill="none" stroke="#ef4444" strokeWidth={4} strokeDasharray="12 7" filter="url(#glow)" vectorEffect="non-scaling-stroke" />
                      <path d={c.d} fill="none" stroke="transparent" strokeWidth={16} />
                      <text
                        x={c.mid.x * 1000}
                        y={c.mid.y * 1000 - 8}
                        fontSize={13}
                        fontWeight={700}
                        textAnchor="middle"
                        fill="#ef4444"
                        className="select-none"
                        style={{ paintOrder: 'stroke', stroke: theme === 'dark' ? '#0b1220' : '#fff', strokeWidth: 4 }}
                      >
                        BLOCKED
                      </text>
                    </g>
                  ))}

                  {/* complaint issues — amber warning marker per affected section */}
                  {visibleConflicts && complaintIssues.map((ci) => (
                    <g
                      key={ci.section.id}
                      data-interactive
                      className="cursor-pointer"
                      onMouseEnter={() => setHoverIssue(ci)}
                      onMouseLeave={() => setHoverIssue(null)}
                      onClick={() => setSelectedIssue(ci)}
                    >
                      <circle cx={ci.mid.x * VB.w} cy={ci.mid.y * VB.h} r={14} fill="transparent" />
                      <g transform={`translate(${ci.mid.x * VB.w}, ${ci.mid.y * VB.h})`} className="animate-pulse">
                        <path
                          d="M0,-11 L10.5,7 L-10.5,7 Z"
                          fill="#f59e0b"
                          stroke={theme === 'dark' ? '#0b1220' : '#fff'}
                          strokeWidth={1.5}
                        />
                        <text x={0} y={5} fontSize={9} fontWeight={800} textAnchor="middle" fill="#0b1220">
                          !
                        </text>
                      </g>
                    </g>
                  ))}

                  {/* minor stations (coordinate-deduped) */}
                  {visibleStations && dedupedStations.filter((s) => s.tier === 'station').map((s) => {
                    const p = projected.get(s.code)!
                    return <circle key={s.code} cx={p.x * VB.w} cy={p.y * VB.h} r={2.6} fill="#22d3ee" fillOpacity={0.65} />
                  })}

                  {/* junctions (coordinate-deduped, edge-clamped labels) */}
                  {visibleJunctions && dedupedStations.filter((s) => s.tier === 'junction').map((s) => {
                    const p = projected.get(s.code)!
                    const nearRight = p.x * VB.w > VB.w - 60
                    const nearLeft = p.x * VB.w < 60
                    return (
                      <g key={s.code} data-interactive className="cursor-pointer">
                        <circle cx={p.x * VB.w} cy={p.y * VB.h} r={7} fill="#38bdf8" stroke={theme === 'dark' ? '#0b1220' : '#fff'} strokeWidth={1.8} />
                        {zoom >= 2.2 && (
                          <text
                            x={nearRight ? p.x * VB.w - 10 : p.x * VB.w + 10}
                            y={Math.max(14, Math.min(VB.h - 6, p.y * VB.h + 3 + (nearLeft || nearRight ? 8 : 0)))}
                            fontSize={11}
                            textAnchor={nearRight ? 'end' : 'start'}
                            fill={theme === 'dark' ? '#cbd5e1' : '#334155'}
                            className="font-mono select-none"
                          >
                            {s.code}
                          </text>
                        )}
                      </g>
                    )
                  })}

                  {/* hubs (coordinate-deduped, edge-clamped labels) */}
                  {visibleHubs && dedupedStations.filter((s) => s.tier === 'hub').map((s) => {
                    const p = projected.get(s.code)!
                    const lx = Math.max(24, Math.min(VB.w - 24, p.x * VB.w))
                    const ly = Math.max(14, p.y * VB.h - 12)
                    return (
                      <g key={s.code} data-interactive className="cursor-pointer">
                        <circle cx={p.x * VB.w} cy={p.y * VB.h} r={10} fill="#f59e0b" stroke={theme === 'dark' ? '#0b1220' : '#fff'} strokeWidth={2} />
                        <text x={lx} y={ly} fontSize={12} fontWeight={600} textAnchor="middle" fill={theme === 'dark' ? '#f1f5f9' : '#0f172a'} className="select-none">{s.code}</text>
                      </g>
                    )
                  })}

                  {/* trains */}
                  {visibleTrains && trainPositions.map((tp) => {
                    const pa = projected.get(tp.from.code)
                    const pb = projected.get(tp.to.code)
                    if (!pa || !pb) return null
                    const x = (pa.x + (pb.x - pa.x) * tp.t) * VB.w
                    const y = (pa.y + (pb.y - pa.y) * tp.t) * VB.h
                    const delayed = tp.train.status === 'delayed'
                    const color = delayed ? '#ef4444' : tp.running ? '#a3e635' : '#64748b'
                    return (
                      <g key={tp.train.id} data-interactive className="cursor-pointer" onMouseEnter={() => setHoverTrain(tp)} onMouseLeave={() => setHoverTrain(null)} onClick={() => setSelectedTrain(tp.train)}>
                        <circle cx={x} cy={y} r={14} fill={color} fillOpacity={0.22} />
                        <circle cx={x} cy={y} r={7} fill={color} stroke={theme === 'dark' ? '#0b1220' : '#fff'} strokeWidth={2} filter="url(#glow)" />
                      </g>
                    )
                  })}
                </svg>
              )}

              {/* hover tooltip: train */}
              {hoverTrain && (
                <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-lg border border-border bg-popover px-3.5 py-2 text-xs shadow-xl">
                  <p className="font-semibold">{hoverTrain.train.train_number} · {hoverTrain.train.name}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {hoverTrain.from.code} → {hoverTrain.to.code} · {(hoverTrain.t * 100).toFixed(0)}% of segment
                  </p>
                  <p className="mt-1 flex items-center gap-1.5">
                    <span className={cn('inline-block size-1.5 rounded-full', hoverTrain.train.status === 'delayed' ? 'bg-conflict' : 'bg-approved')} />
                    {hoverTrain.train.status === 'delayed' ? 'Delayed' : 'On time'}
                    {hoverTrain.scheduledArrival && <> · arr {hoverTrain.scheduledArrival.slice(0, 5)}</>}
                    {hoverTrain.scheduledDeparture && <> · dep {hoverTrain.scheduledDeparture.slice(0, 5)}</>}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">Click to open full schedule</p>
                </div>
              )}

              {/* hover tooltip: complaint issue */}
              {hoverIssue && (
                <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-lg border border-pending/50 bg-popover px-3.5 py-2 text-xs shadow-xl">
                  <p className="font-semibold text-pending-foreground">⚠ {hoverIssue.list.length} open complaint{hoverIssue.list.length > 1 ? 's' : ''} · {hoverIssue.section.name}</p>
                  {hoverIssue.list.slice(0, 3).map((c) => (
                    <p key={c.id} className="mt-0.5 text-muted-foreground">
                      {c.category} · severity {c.severity} · reported by {c.reported_by}
                    </p>
                  ))}
                  <p className="mt-1 text-[10px] text-muted-foreground">Click for details &amp; actions</p>
                </div>
              )}

              {/* hover tooltip: conflict */}
              {hoverConflict && (
                <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-lg border border-conflict/40 bg-popover px-3.5 py-2 text-xs shadow-xl">
                  <p className="font-semibold text-conflict">BLOCKED · {hoverConflict.block.title}</p>
                  <p className="mt-0.5 text-muted-foreground">{hoverConflict.section.name}</p>
                  <p className="mt-1">Severity: {hoverConflict.block.urgency} · Raised {new Date(hoverConflict.block.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">Click to open Conflict Center</p>
                </div>
              )}

              {/* corner HUD */}
              <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-lg border border-border bg-card/85 px-3 py-1.5 text-[11px] text-muted-foreground backdrop-blur">
                <TrainFront className="size-3.5 text-primary" />
                {scrubH != null ? `SIMULATED ${String(Math.floor(activeH)).padStart(2, '0')}:${String(Math.floor((activeH % 1) * 60)).padStart(2, '0')} IST` : `LIVE · ${String(Math.floor(activeH)).padStart(2, '0')}:${String(Math.floor((activeH % 1) * 60)).padStart(2, '0')} IST`}
                <span className="mx-1 text-border">|</span>
                {stations.length.toLocaleString()} stations · {sections.length} sections
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Legend + time scrubber */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <button type="button" onClick={() => setLegendOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3 text-left">
                <span className="flex items-center gap-2 text-sm font-semibold"><Layers className="size-4" /> Legend</span>
                <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', legendOpen && 'rotate-180')} />
              </button>
              {legendOpen && (
                <div className="space-y-1 border-t border-border px-4 py-3">
                  {LEGEND_LAYERS.map((l) => (
                    <label key={l.id} className="flex cursor-pointer items-center gap-2.5 rounded px-1 py-1 text-xs hover:bg-muted/50">
                      <input type="checkbox" checked={layers.has(l.id)} onChange={() => toggleLayer(l.id)} className="accent-primary" />
                      <span className="inline-block h-0.5 w-5 rounded" style={{ background: l.color }} />
                      {l.label}
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* admin: per-route visibility (persists via localStorage) */}
          {identity?.role === 'admin' && (
            <Card>
              <CardContent className="p-0">
                <button type="button" onClick={() => setRoutesOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3 text-left">
                  <span className="flex items-center gap-2 text-sm font-semibold"><Eye className="size-4" /> Routes on map</span>
                  <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', routesOpen && 'rotate-180')} />
                </button>
                {routesOpen && (
                  <div className="max-h-72 space-y-1 overflow-y-auto border-t border-border px-4 py-3">
                    {sections.map((sec) => {
                      const hidden = hiddenRoutes.has(sec.id)
                      const autoInactive = isRouteAutoInactive(sec.id)
                      return (
                        <div key={sec.id} className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50">
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-mono text-muted-foreground">{sec.code}</span>{' '}
                            {sec.name.replace(' Section', '')}
                            {autoInactive && <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">assets inactive</span>}
                          </span>
                          <Button
                            size="sm" variant={hidden ? 'outline' : 'ghost'}
                            className="h-6 px-1.5 text-[11px]"
                            aria-label={hidden ? `Restore ${sec.code} to map` : `Remove ${sec.code} from map`}
                            onClick={() => {
                              const next = new Set(hiddenRoutes)
                              if (hidden) next.delete(sec.id)
                              else next.add(sec.id)
                              setVisibleRoutes(next)
                            }}
                          >
                            {hidden ? <><EyeOff className="size-3" /> Hidden</> : <><Eye className="size-3" /> On map</>}
                          </Button>
                        </div>
                      )
                    })}
                    {hiddenRoutes.size > 0 && (
                      <button
                        type="button"
                        className="w-full rounded px-1 py-1.5 text-left text-[11px] text-primary hover:underline"
                        onClick={() => setVisibleRoutes(new Set())}
                      >
                        Restore all hidden routes ({hiddenRoutes.size})
                      </button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold"><Clock className="size-4" /> Time</span>
                <Button variant={scrubH == null ? 'default' : 'outline'} size="sm" className="h-7 px-2 text-xs" onClick={() => setScrubH(null)}>
                  Live
                </Button>
              </div>
              <input
                type="range" min={0} max={23.99} step={0.25}
                value={scrubH ?? activeH}
                onChange={(e) => setScrubH(Number(e.target.value))}
                className="w-full accent-primary"
                aria-label="Time of day"
              />
              <p className="text-center font-mono text-xs text-muted-foreground">
                {String(Math.floor(activeH)).padStart(2, '0')}:{String(Math.floor((activeH % 1) * 60)).padStart(2, '0')} IST
              </p>
            </CardContent>
          </Card>

          {/* section health */}
          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-sm font-semibold">Section health</p>
              <div className="space-y-1.5">
                {sections.slice(0, 10).map((sec) => {
                  const hasConflict = blocks.some((b) => b.section_id === sec.id && b.status === 'conflict')
                  const hasPending = blocks.some((b) => b.section_id === sec.id && b.status === 'pending')
                  const tone = hasConflict ? 'bg-conflict' : hasPending ? 'bg-pending-foreground' : 'bg-approved'
                  return (
                    <div key={sec.id} className="flex items-center gap-2 text-xs">
                      <span className={cn('size-2 rounded-full', tone)} />
                      <span className="truncate text-muted-foreground">{sec.name.replace(' Section', '')}</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Train schedule detail (click target) */}
      {selectedTrain && (
        <TrainScheduleCard train={selectedTrain} stationsByCode={stationsByCode} onClose={() => setSelectedTrain(null)} />
      )}

      {/* Conflict detail (click target) */}
      {selectedConflict && (
        <ConflictCard
          block={selectedConflict.block}
          section={selectedConflict.section}
          onClose={() => setSelectedConflict(null)}
          onResolved={() => {
            setSelectedConflict(null)
            refresh()
          }}
          onDelete={() => setConfirmDelete(selectedConflict.block)}
        />
      )}

      {selectedIssue && (
        <IssueCard
          section={selectedIssue.section}
          complaints={selectedIssue.list}
          onClose={() => setSelectedIssue(null)}
          onDone={() => {
            setSelectedIssue(null)
            refresh()
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDelete
          name={confirmDelete.title}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            await deleteBlock(confirmDelete.id)
            setConfirmDelete(null)
            setSelectedConflict(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

/** Complaint-originated issues on a section — resolve or (admin) delete. */
function IssueCard({
  section,
  complaints,
  onClose,
  onDone,
}: {
  section: SectionRow
  complaints: ComplaintRow[]
  onClose: () => void
  onDone: () => void
}) {
  const { identity } = useAuth()
  const isAdmin = identity?.role === 'admin'
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<ComplaintRow | null>(null)

  async function resolve(c: ComplaintRow) {
    setBusy(c.id)
    await updateComplaintStatus(c.id, 'resolved')
    setBusy(null)
    onDone()
  }
  async function remove(c: ComplaintRow) {
    setBusy(c.id)
    await deleteComplaint(c.id)
    setBusy(null)
    onDone()
  }

  return (
    <>
      <Card className="border-pending/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-pending/20 text-pending-foreground">
              <TriangleAlert className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-pending-foreground">
                {complaints.length} open complaint{complaints.length > 1 ? 's' : ''} · {section.name}
              </p>
              <p className="text-xs text-muted-foreground">Raised via Report Issue — resolve or manage below</p>
            </div>
            <Button size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {complaints.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                <span className="font-medium">{c.category}</span>
                <span className="text-muted-foreground">severity {c.severity}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{c.description}</span>
                <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => resolve(c)}>
                  Mark resolved
                </Button>
                {isAdmin && (
                  <Button size="sm" variant="destructive" disabled={busy === c.id} onClick={() => setConfirmDel(c)}>
                    Delete
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      {confirmDel && (
        <ConfirmDelete
          name={`${confirmDel.category} complaint`}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => remove(confirmDel)}
        />
      )}
    </>
  )
}

function TrainScheduleCard({
  train,
  stationsByCode,
  onClose,
}: {
  train: TrainRow
  stationsByCode: Map<string, StationRow>
  onClose: () => void
}) {
  const route = train.route
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <TrainFront className="size-4 text-primary" />
              {train.train_number} · {train.name}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {train.train_type} · {train.status} · {route?.c.length ?? 0} stops · {train.distance_km != null ? `${Math.round(train.distance_km)} km` : 'route data'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Station</th>
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Arr</th>
                <th className="px-3 py-2 font-medium">Dep</th>
                <th className="px-3 py-2 font-medium">Day</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {route?.c.map((code, i) => {
                const st = stationsByCode.get(code)
                return (
                  <tr key={`${code}-${i}`} className="hover:bg-muted/40">
                    <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-1.5 font-medium">{st?.name ?? code}</td>
                    <td className="px-3 py-1.5 font-mono text-muted-foreground">{code}</td>
                    <td className="px-3 py-1.5 tabular-nums">{route.a[i]?.slice(0, 5) ?? '—'}</td>
                    <td className="px-3 py-1.5 tabular-nums">{route.d[i]?.slice(0, 5) ?? '—'}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{route.day?.[i] ?? 1}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function ConflictCard({
  block,
  section,
  onClose,
  onResolved,
  onDelete,
}: {
  block: BlockRow
  section: SectionRow
  onClose: () => void
  onResolved: () => void
  onDelete: () => void
}) {
  const [busy, setBusy] = useState(false)
  const { identity } = useAuth()
  const isAdmin = identity?.role === 'admin'
  async function resolve() {
    setBusy(true)
    await setSectionConflict(section.id, false)
    setBusy(false)
    onResolved()
  }
  return (
    <Card className="border-conflict/40">
      <CardContent className="flex flex-wrap items-center gap-3 p-4">
        <span className="flex size-9 items-center justify-center rounded-lg bg-conflict/10 text-conflict">
          <Ban className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-conflict">BLOCKED · {block.title}</p>
          <p className="text-xs text-muted-foreground">
            {section.name} · raised by {block.requested_by} · urgency {block.urgency}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
        <Button size="sm" disabled={busy} onClick={resolve}>
          {busy && <Loader2 className="animate-spin" />}
          Mark resolved
        </Button>
        {isAdmin && (
          <Button size="sm" variant="destructive" onClick={onDelete}>
            Delete conflict
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
