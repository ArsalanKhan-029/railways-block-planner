'use client'

import { AlertTriangle } from 'lucide-react'
import { SECTIONS, type TimelineBar } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const BAR_STYLES: Record<TimelineBar['type'], string> = {
  train: 'bg-train text-train-foreground',
  approved: 'bg-approved text-approved-foreground',
  pending: 'bg-pending text-pending-foreground',
  conflict: 'bg-conflict text-conflict-foreground',
}

const HOURS = Array.from({ length: 25 }, (_, i) => i)

export function GanttTimeline({
  bars,
  onSelect,
  sectionIds,
}: {
  bars: TimelineBar[]
  onSelect?: (bar: TimelineBar) => void
  sectionIds?: string[]
}) {
  const sections = sectionIds
    ? SECTIONS.filter((s) => sectionIds.includes(s.id))
    : SECTIONS

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
          {sections.map((section) => {
            const rowBars = bars.filter((b) => b.sectionId === section.id)
            return (
              <div key={section.id} className="flex items-stretch">
                <div className="flex w-44 shrink-0 flex-col justify-center py-3 pr-3">
                  <p className="text-sm font-medium leading-tight">{section.name}</p>
                  <p className="text-[11px] text-muted-foreground">{section.code}</p>
                </div>
                <div className="relative my-2 h-11 flex-1 rounded-md bg-muted/40">
                  {/* hour gridlines */}
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="absolute inset-y-0 w-px bg-border/60"
                      style={{ left: `${(h / 24) * 100}%` }}
                    />
                  ))}
                  {rowBars.map((bar) => {
                    const left = (bar.start / 24) * 100
                    const width = ((bar.end - bar.start) / 24) * 100
                    return (
                      <button
                        key={bar.id}
                        type="button"
                        onClick={() => onSelect?.(bar)}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        className={cn(
                          'group absolute inset-y-1.5 flex items-center gap-1 overflow-hidden rounded px-2 text-[11px] font-medium shadow-sm transition-transform hover:z-10 hover:scale-[1.015] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          BAR_STYLES[bar.type],
                        )}
                        title={bar.label}
                      >
                        {bar.hasConflict && <AlertTriangle className="size-3 shrink-0" />}
                        <span className="truncate">{bar.label}</span>
                      </button>
                    )
                  })}
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
