'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { SECTIONS, type TimelineBar } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

export interface TimelineSectionRow {
  id: string
  name: string
  code: string
}

const BAR_STYLES: Record<TimelineBar['type'], string> = {
  train: 'bg-train text-train-foreground',
  approved: 'bg-approved text-approved-foreground',
  pending: 'bg-pending text-pending-foreground',
  conflict: 'bg-conflict text-conflict-foreground',
}

const HOURS = Array.from({ length: 25 }, (_, i) => i)

/** Compress "15901 BENGALURU - NEW TINSUKIA Weekly Exp" → "15901 Bengaluru–Tinsukia Exp". */
export function shortTrainLabel(label: string): string {
  const m = label.match(/^(\S+)\s+(.+)$/)
  if (!m) return label
  const num = m[1]
  let name = m[2]
  // drop filler words
  name = name.replace(/\b(Weekly|Biweekly|Triweekly|Tri-?weekly|\(Weekly\)|SF|Expres|Express|Superfast|Fast|Passenger|Special|Slip)\b/g, (w, _o, s) => (w === 'SF' || w === 'Exp' ? w : ''))
  name = name.replace(/\s{2,}/g, ' ').replace(/\s*-\s*/g, '–').trim()
  // Title-case shouting ALL-CAPS names
  if (name === name.toUpperCase() && /[A-Z]{4,}/.test(name)) {
    name = name
      .toLowerCase()
      .split(' ')
      .map((w) => (w.length > 3 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()))
      .join(' ')
  }
  // squeeze long city pairs: "Bengaluru–Tinsukia"
  const parts = name.split(/[–-]/)
  if (parts.length >= 2 && name.length > 22) {
    const a = parts[0].trim().split(' ')[0]
    const b = parts[1].trim().split(' ')[0]
    const tail = parts.slice(2).join(' ').trim()
    name = [a, b, tail].filter(Boolean).join('–')
  }
  return `${num} ${name}`.trim()
}

/** Full label minus the number for tooltips. */
function fullLabel(label: string): string {
  return label
}

/** Pack bars into non-overlapping lanes (greedy, left-to-right). */
function packLanes(bars: TimelineBar[]): TimelineBar[][] {
  const sorted = [...bars].sort((a, b) => a.start - b.start || a.end - b.end)
  const laneEnds: number[] = []
  const lanes: TimelineBar[][] = []
  for (const bar of sorted) {
    let placed = false
    for (let i = 0; i < laneEnds.length; i++) {
      if (bar.start >= laneEnds[i]) {
        lanes[i].push(bar)
        laneEnds[i] = bar.end
        placed = true
        break
      }
    }
    if (!placed) {
      lanes.push([bar])
      laneEnds.push(bar.end)
    }
  }
  return lanes
}

const LANE_H = 24 // px per sub-lane

export function GanttTimeline({
  bars,
  onSelect,
  sectionIds,
  sectionRows,
  highlightBarId,
}: {
  bars: TimelineBar[]
  onSelect?: (bar: TimelineBar) => void
  sectionIds?: string[]
  /** Supabase-backed section rows — when provided they replace the mock list. */
  sectionRows?: TimelineSectionRow[]
  /** Deep-linked bar (request click) — scrolls into view and pulses. */
  highlightBarId?: string | null
}) {
  const sections = sectionRows ?? SECTIONS
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const rows = useMemo(() => {
    return sections.map((section) => {
      const rowBars = bars.filter((b) => b.sectionId === section.id)
      const lanes = packLanes(rowBars)
      return { section, lanes, count: rowBars.length }
    })
  }, [sections, bars])

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]">
        {/* Hour axis */}
        <div className="flex border-b border-border pb-2">
          <div className="w-44 shrink-0" />
          <div className="relative flex-1">
            <div className="flex">
              {HOURS.slice(0, 24).map((h) => (
                <div
                  key={h}
                  className="flex-1 text-center text-[10px] font-medium text-muted-foreground"
                >
                  {h === 0 ? '00' : String(h).padStart(2, '0')}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-border">
          {rows.map(({ section, lanes, count }) => {
            const isExpanded = expanded.has(section.id)
            const visibleLanes = isExpanded ? lanes : lanes.slice(0, 2)
            const hiddenCount = Math.max(0, lanes.length - 2)
            const rowHeight = visibleLanes.length * LANE_H + 16
            return (
              <div key={section.id} className="flex items-stretch">
                <div className="flex w-44 shrink-0 flex-col justify-center py-3 pr-3">
                  <p className="text-sm font-medium leading-tight">{section.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {section.code}
                    {count > 0 && <span className="ml-1 opacity-60">· {count} items</span>}
                  </p>
                </div>
                <div
                  className="relative my-2 flex-1 rounded-md bg-muted/40"
                  style={{ minHeight: Math.max(rowHeight, 28) }}
                >
                  {/* hour gridlines */}
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="absolute inset-y-0 w-px bg-border/60"
                      style={{ left: `${(h / 24) * 100}%` }}
                    />
                  ))}

                  {/* stacked lanes */}
                  {visibleLanes.map((lane, li) => (
                    <div
                      key={li}
                      className="absolute inset-x-0"
                      style={{ top: 8 + li * LANE_H, height: LANE_H - 4 }}
                    >
                      {lane.map((bar) => {
                        const left = (bar.start / 24) * 100
                        const width = ((bar.end - bar.start) / 24) * 100
                        const tooNarrow = width < 9
                        const display = bar.type === 'train' ? shortTrainLabel(bar.label) : bar.label
                        const highlighted = highlightBarId != null && bar.id === `block-${highlightBarId}`
                        return (
                          <button
                            key={bar.id}
                            type="button"
                            onClick={() => onSelect?.(bar)}
                            title={`${fullLabel(bar.label)}${bar.detail.status ? ` · ${bar.detail.status}` : ''}${bar.detail.requestedBy ? ` · by ${bar.detail.requestedBy}` : ''}`}
                            style={{ left: `${left}%`, width: `${width}%` }}
                            className={cn(
                              'group absolute inset-y-0 flex items-center gap-1 overflow-hidden rounded px-2 text-[11px] font-medium shadow-sm transition-transform hover:z-10 hover:scale-[1.02] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              BAR_STYLES[bar.type],
                              highlighted && 'ring-2 ring-conflict ring-offset-1 ring-offset-background animate-pulse',
                            )}
                          >
                            {bar.hasConflict && <AlertTriangle className="size-3 shrink-0" />}
                            {tooNarrow ? (
                              <span className="sr-only">{fullLabel(bar.label)}</span>
                            ) : (
                              <span className="truncate">{display}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ))}

                  {/* +N more chip */}
                  {hiddenCount > 0 && !isExpanded && (
                    <button
                      type="button"
                      onClick={() => setExpanded((prev) => new Set(prev).add(section.id))}
                      className="absolute inset-x-0 flex items-center justify-center text-[10px] font-medium text-muted-foreground hover:text-foreground"
                      style={{ top: 8 + visibleLanes.length * LANE_H, height: LANE_H - 8 }}
                    >
                      +{hiddenCount} more lane{hiddenCount === 1 ? '' : 's'} — click to expand
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function TimelineLegend() {
  const items: { label: string; type: TimelineBar['type'] }[] = [
    { label: 'Train service', type: 'train' },
    { label: 'Approved block', type: 'approved' },
    { label: 'Pending request', type: 'pending' },
    { label: 'Conflict', type: 'conflict' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {items.map((i) => (
        <div key={i.type} className="flex items-center gap-1.5">
          <span className={cn('size-3 rounded-sm', BAR_STYLES[i.type])} />
          <span className="text-xs text-muted-foreground">{i.label}</span>
        </div>
      ))}
    </div>
  )
}
