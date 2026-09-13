'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import {
  demoFilter,
  fetchAssets,
  fetchBlocks,
  fetchComplaints,
  fetchSections,
  fetchStations,
  fetchTrains,
  fetchUsers,
} from '@/lib/api'
import type {
  AssetRow,
  BlockRow,
  ComplaintRow,
  SectionRow,
  StationRow,
  TrainRow,
  UserRow,
} from '@/lib/types'

export interface RailData {
  sections: SectionRow[]
  stations: StationRow[]
  trains: TrainRow[]
  blocks: BlockRow[]
  complaints: ComplaintRow[]
  users: UserRow[]
  assets: AssetRow[]
  assetsAvailable: boolean
  loading: boolean
  error: string | null
  refresh: () => void
  /** Demo Mode is ON: seeded rows hidden from views (Network View ignores this). */
  demoMode: boolean
}

const RailDataContext = createContext<RailData | null>(null)

/**
 * Single-source-of-truth provider. Loads every table once, shares the result
 * with every view (no per-mount refetch), and keeps it live: Postgres
 * change events on the operational tables trigger one debounced refetch, so
 * inserts/edits/deletes propagate to all views immediately without a page
 * refresh. `refresh()` still works for explicit callers (and covers the
 * stations table, which is excluded from realtime to avoid refetching 3.5k
 * rows on every write).
 */
export function RailDataProvider({ children }: { children: ReactNode }) {
  const [sections, setSections] = useState<SectionRow[]>([])
  const [stations, setStations] = useState<StationRow[]>([])
  const [trains, setTrains] = useState<TrainRow[]>([])
  const [blocks, setBlocks] = useState<BlockRow[]>([])
  const [complaints, setComplaints] = useState<ComplaintRow[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [assetsAvailable, setAssetsAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [demoMode, setDemoMode] = useState(false)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  // ----- initial + manual reload -----
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    // assets/stations are newer tables — tolerate them not existing yet
    const assetsP = fetchAssets().then(
      (a) => ({ ok: true as const, rows: a }),
      () => ({ ok: false as const, rows: [] as AssetRow[] }),
    )
    const stationsP = fetchStations().then(
      (s) => ({ ok: true as const, rows: s }),
      () => ({ ok: false as const, rows: [] as StationRow[] }),
    )
    Promise.all([
      fetchSections(),
      fetchTrains(),
      fetchBlocks(),
      fetchComplaints(),
      fetchUsers(),
      assetsP,
      stationsP,
    ])
      .then(([s, t, b, c, u, a, st]) => {
        if (cancelled) return
        const demo = localStorage.getItem('railmind-demo-mode') === 'on'
        setSections(s)
        setStations(st.rows)
        setTrains(demoFilter(t, demo))
        setBlocks(demoFilter(b, demo))
        setComplaints(demoFilter(c, demo))
        setUsers(u)
        setAssets(demoFilter(a.rows, demo))
        setAssetsAvailable(a.ok)
        setDemoMode(demo)
        setError(null)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tick])

  // ----- realtime propagation -----
  const pending = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const TABLES = ['sections', 'trains', 'blocks', 'complaints', 'assets', 'users']
    const schedule = () => {
      pending.current = true
      if (timer.current) return
      // debounce: batch bursts of events into one refetch
      timer.current = setTimeout(() => {
        timer.current = null
        if (pending.current) {
          pending.current = false
          setTick((t) => t + 1)
        }
      }, 600)
    }
    const channel = supabase
      .channel('railmind-data')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
        if (TABLES.includes(payload.table)) schedule()
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const value = useMemo(
    () => ({
      sections,
      stations,
      trains,
      blocks,
      complaints,
      users,
      assets,
      assetsAvailable,
      loading,
      error,
      refresh,
      demoMode,
    }),
    [
      sections,
      stations,
      trains,
      blocks,
      complaints,
      users,
      assets,
      assetsAvailable,
      loading,
      error,
      refresh,
      demoMode,
    ],
  )

  return <RailDataContext.Provider value={value}>{children}</RailDataContext.Provider>
}

export function useRailData(): RailData {
  const ctx = useContext(RailDataContext)
  if (!ctx) {
    throw new Error('useRailData must be used inside <RailDataProvider>')
  }
  return ctx
}
