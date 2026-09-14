'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, X, SendHorizonal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppShell } from '@/lib/app-shell'
import { useRailData } from '@/lib/use-rail-data'
import { useAuth } from '@/lib/auth'
import type { RailSnapshot } from '@/app/api/railai/route'
import { cn } from '@/lib/utils'

/**
 * RailAI — persistent floating assistant (bottom-right) available on every
 * page. Sends the chat transcript plus a compact snapshot of live app data
 * to /api/railai (Groq → Gemini → offline), so answers reflect what the user
 * is actually looking at.
 */

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

const WELCOME =
  "Hi, I'm RailAI — ask me anything about the network: running trains, pending block requests, conflicts, sections or assets."

function timeHM(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function buildSnapshot(
  view: string,
  data: {
    sections: { id: string; name: string; code: string }[]
    trains: { train_number: string; name: string; status: string; route?: unknown }[]
    blocks: { title: string; section_id: string | null; status: string; urgency: string; start_time: string; end_time: string }[]
    complaints: { category: string; section_id: string | null; severity: string; status: string }[]
    assets: { status: string }[]
  },
): RailSnapshot {
  const secById = new Map(data.sections.map((s) => [s.id, s]))
  const nowMs = Date.now()

  const conflicts = data.blocks.filter((b) => b.status === 'conflict')
  const pending = data.blocks.filter((b) => b.status === 'pending')

  return {
    view,
    clock: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    conflictCount: conflicts.length,
    pendingCount: pending.length,
    sections: data.sections.slice(0, 60).map((s) => ({
      code: s.code,
      name: s.name,
      health: conflicts.some((b) => b.section_id === s.id)
        ? 'conflict'
        : pending.some((b) => b.section_id === s.id)
          ? 'pending'
          : 'normal',
      conflicts: conflicts.filter((b) => b.section_id === s.id).length,
      pending: pending.filter((b) => b.section_id === s.id).length,
    })),
    trains: data.trains.slice(0, 90).map((t) => ({
      number: t.train_number,
      name: t.name,
      status: t.status,
      route: Array.isArray(t.route)
        ? (t.route as { code?: string }[]).slice(0, 6).map((r) => r.code).filter(Boolean).join('→') +
          ((t.route as unknown[]).length > 6 ? '…' : '')
        : '—',
    })),
    blocks: data.blocks.slice(0, 40).map((b) => ({
      title: b.title,
      section: secById.get(b.section_id ?? '')?.name ?? '—',
      status: b.status,
      urgency: b.urgency,
      start: timeHM(b.start_time),
      end: timeHM(b.end_time),
    })),
    complaints: data.complaints.slice(0, 30).map((c) => ({
      category: c.category,
      section: secById.get(c.section_id ?? '')?.name ?? '—',
      severity: c.severity,
      status: c.status,
    })),
    assetCounts: data.assets.reduce<Record<string, number>>((acc, a) => {
      acc[a.status] = (acc[a.status] ?? 0) + 1
      return acc
    }, {}),
  }
}

export function RailAIWidget() {
  const { view } = useAppShell()
  const { accessToken } = useAuth()
  const data = useRailData()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([{ role: 'assistant', content: WELCOME }])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Keep the last snapshot fresh without re-rendering the widget on every tick
  const snapshot = useMemo(() => buildSnapshot(view, data), [view, data])
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, open])

  const accessTokenRef = useRef<string | null>(null)
  accessTokenRef.current = accessToken

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || busy) return
    const next: Msg[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const res = await fetch('/api/railai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-14),
          snapshot: snapshotRef.current,
          view: snapshotRef.current.view,
          accessToken: accessTokenRef.current ?? undefined,
        }),
      })
      const json = (await res.json()) as { reply?: string; error?: string }
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: json.reply ?? json.error ?? 'Sorry — I could not answer that just now.',
        },
      ])
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'Network error reaching RailAI. Please try again.' },
      ])
    } finally {
      setBusy(false)
    }
  }, [input, busy, messages])

  return (
    <>
      {/* Floating launcher */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'fixed bottom-5 right-5 z-[90] flex size-12 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105',
          open ? 'bg-muted text-foreground' : 'bg-primary text-primary-foreground',
        )}
        aria-label={open ? 'Close RailAI assistant' : 'Open RailAI assistant'}
        aria-expanded={open}
      >
        {open ? <X className="size-5" /> : <Sparkles className="size-5" />}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-[90] flex h-[480px] w-[360px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">RailAI</p>
              <p className="truncate text-[11px] text-muted-foreground">Context: {view}</p>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.map((m, i) => (
              <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug',
                    m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl bg-muted px-3 py-2">
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:0ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border p-2.5">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
                rows={1}
                placeholder="Ask about trains, conflicts, blocks…"
                className="max-h-24 min-h-[38px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
                aria-label="Message RailAI"
              />
              <Button size="icon" className="size-[38px] shrink-0" onClick={() => void send()} disabled={busy || !input.trim()} aria-label="Send">
                <SendHorizonal className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
