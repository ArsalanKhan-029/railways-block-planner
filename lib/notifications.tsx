'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { supabase } from '@/lib/supabase'
import { fetchMyNotifications, markNotificationRead } from '@/lib/api'
import type { NotificationRow } from '@/lib/types'
import { Bell, TriangleAlert, TrainFront, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Routed notifications (conflict alerts etc.) for the signed-in user.
 * Loads the latest rows, subscribes to live postgres inserts targeting this
 * user, surfaces new arrivals as toasts, and powers the header bell.
 */

interface NotificationsContextValue {
  rows: NotificationRow[]
  unread: number
  /** Rows that arrived while the app is open (drives toasts). */
  toasts: NotificationRow[]
  dismissToast: (id: string) => void
  markAllRead: () => Promise<void>
  markRead: (id: string) => Promise<void>
}

const NotificationsContext = createContext<NotificationsContextValue>({
  rows: [],
  unread: 0,
  toasts: [],
  dismissToast: () => {},
  markAllRead: async () => {},
  markRead: async () => {},
})

export function NotificationsProvider({
  userId,
  children,
}: {
  userId: string
  children: React.ReactNode
}) {
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [toasts, setToasts] = useState<NotificationRow[]>([])
  const seen = useRef<Set<string>>(new Set())
  const firstLoad = useRef(true)

  const load = useCallback(async () => {
    try {
      const data = await fetchMyNotifications(userId)
      const fresh: NotificationRow[] = []
      for (const r of data) {
        if (!seen.current.has(r.id)) {
          seen.current.add(r.id)
          // Only toast arrivals after the initial load — a page refresh
          // shouldn't replay yesterday's alerts.
          if (!firstLoad.current && (Date.now() - new Date(r.created_at).getTime()) < 120_000) {
            fresh.push(r)
          }
        }
      }
      firstLoad.current = false
      setRows(data)
      if (fresh.length) setToasts((t) => [...fresh.reverse(), ...t].slice(0, 4))
    } catch {
      // table may not exist yet pre-migration — bell simply shows empty
    }
  }, [userId])

  useEffect(() => {
    setRows([])
    setToasts([])
    seen.current = new Set()
    firstLoad.current = true
    load()
    // Live inserts for this user
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe()
    // Polling fallback — realtime may be unavailable (websocket blocked, publication
    // not enabled); the bell still updates within 30s.
    const poll = setInterval(load, 30_000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
    }
  }, [userId, load])

  // Auto-dismiss toasts after 8s
  useEffect(() => {
    if (!toasts.length) return
    const timer = setTimeout(() => setToasts((t) => t.slice(0, -1)), 8000)
    return () => clearTimeout(timer)
  }, [toasts])

  const unread = useMemo(() => rows.filter((r) => !r.read_at).length, [rows])

  const dismissToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const markAllRead = useCallback(async () => {
    setRows((rs) => rs.map((r) => (r.read_at ? r : { ...r, read_at: new Date().toISOString() })))
    await Promise.all(
      rows.filter((r) => !r.read_at).map((r) => markNotificationRead(r.id)),
    )
  }, [rows])

  const markRead = useCallback(async (id: string) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, read_at: new Date().toISOString() } : r)))
    await markNotificationRead(id)
  }, [])

  const value = useMemo(
    () => ({ rows, unread, toasts, dismissToast, markAllRead, markRead }),
    [rows, unread, toasts, dismissToast, markAllRead, markRead],
  )

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

export function useNotifications() {
  return useContext(NotificationsContext)
}

const KIND_META: Record<string, { icon: typeof Bell; tone: string }> = {
  conflict: { icon: TriangleAlert, tone: 'bg-conflict/15 text-conflict' },
  block: { icon: TrainFront, tone: 'bg-primary/10 text-primary' },
}

/** Header bell with unread badge + dropdown of routed notifications. */
export function NotificationBell() {
  const { rows, unread, markAllRead, markRead } = useNotifications()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={`Notifications — ${unread} unread`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex size-2 items-center justify-center">
            <span className="absolute inline-flex size-2 animate-ping rounded-full bg-conflict/70" />
            <span className="relative inline-flex size-2 rounded-full bg-conflict" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-border bg-popover shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-sm font-medium">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Check className="size-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto p-1.5">
            {rows.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                No notifications yet — conflict alerts routed to you will appear here.
              </p>
            ) : (
              rows.map((n) => {
                const meta = KIND_META[n.kind] ?? KIND_META.block
                const Icon = meta.icon
                const high = n.severity === 'high'
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => markRead(n.id)}
                    className={cn(
                      'flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left transition-colors hover:bg-muted',
                      !n.read_at && 'bg-muted/40',
                    )}
                  >
                    <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md', meta.tone)}>
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="block truncate text-sm font-medium">{n.title}</span>
                        {high && (
                          <span className="shrink-0 rounded bg-conflict/15 px-1 py-px text-[10px] font-semibold uppercase text-conflict">
                            high
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{n.body}</span>
                      <span className="mt-1 block text-[10px] text-muted-foreground/70">
                        {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </span>
                    {!n.read_at && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-conflict" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Fixed toast stack for freshly routed alerts (top-right, above header). */
export function NotificationToasts() {
  const { toasts, dismissToast } = useNotifications()
  if (!toasts.length) return null
  return (
    <div className="pointer-events-none fixed right-4 top-16 z-[100] flex w-80 flex-col gap-2">
      {toasts.map((n) => {
        const high = n.severity === 'high'
        return (
          <div
            key={n.id}
            role="status"
            className={cn(
              'pointer-events-auto rounded-xl border bg-popover p-3 shadow-lg',
              high ? 'border-conflict/50' : 'border-border',
            )}
          >
            <div className="flex items-start gap-2.5">
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-lg',
                  high ? 'bg-conflict/15 text-conflict' : 'bg-primary/10 text-primary',
                )}
              >
                <TriangleAlert className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight">{n.title}</p>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">{n.body}</p>
                {n.train_number && (
                  <p className="mt-1 text-xs font-medium text-primary">
                    Affects your train {n.train_number}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(n.id)}
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
