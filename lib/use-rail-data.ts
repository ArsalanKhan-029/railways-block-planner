'use client'

import { useCallback, useEffect, useState } from 'react'
import {
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
}

/**
 * Loads every table once and lets any view trigger a refresh after a write.
 * Deliberately simple (no react-query) to keep the diff to the UI at zero.
 */
export function useRailData(): RailData {
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

  const refresh = useCallback(() => setTick((t) => t + 1), [])

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
        setSections(s)
        setStations(st.rows)
        setTrains(t)
        setBlocks(b)
        setComplaints(c)
        setUsers(u)
        setAssets(a.rows)
        setAssetsAvailable(a.ok)
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

  return {
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
  }
}
