'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { fetchRoles, insertRole, deleteRole } from '@/lib/api'
import type { RoleRow } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import type { Role } from '@/lib/mock-data'

/** Roles that ship with the system and cannot be deleted. */
export const DEFAULT_ROLES: Role[] = ['Admin', 'Section Controller', 'Maintenance Engineer', 'Driver', 'Viewer']

const ROLE_META: Record<string, { initials: string; blurb: string }> = {
  Admin: {
    initials: 'AM',
    blurb: 'Full access — users, roles, audit log, global optimisation settings.',
  },
  'Section Controller': {
    initials: 'SC',
    blurb: 'Approve blocks, resolve conflicts, run the AI planner.',
  },
  'Maintenance Engineer': {
    initials: 'ME',
    blurb: 'Raise block requests and report field issues.',
  },
  Driver: {
    initials: 'DR',
    blurb: 'Runs an assigned train — sees its route, schedule and route alerts.',
  },
  Viewer: {
    initials: 'VW',
    blurb: 'Read-only dashboards and analytics.',
  },
}

/** Avatar initials for any role, deriving them for custom roles. */
export function roleInitials(role: string): string {
  const known = ROLE_META[role]
  if (known) return known.initials
  const words = role.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '??'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/** Short description for any role, with a fallback for custom roles. */
export function roleBlurb(role: string): string {
  return (
    ROLE_META[role]?.blurb ??
    'Custom role — access to shared dashboards and issue reporting by default.'
  )
}

interface RolesContextValue {
  /** Role names available across the app (DB-backed when the table exists). */
  roles: Role[]
  rows: RoleRow[]
  /** False when the roles table hasn't been created yet (migration pending). */
  available: boolean
  isDefault: (role: Role) => boolean
  addRole: (name: string) => Promise<{ ok: boolean; error?: string }>
  removeRole: (role: RoleRow) => Promise<{ ok: boolean; error?: string }>
}

const RolesContext = createContext<RolesContextValue>({
  roles: DEFAULT_ROLES,
  rows: [],
  available: false,
  isDefault: (r) => DEFAULT_ROLES.includes(r),
  addRole: async () => ({ ok: false, error: 'Roles table not available' }),
  removeRole: async () => ({ ok: false, error: 'Roles table not available' }),
})

export function RolesProvider({ children }: { children: React.ReactNode }) {
  const [rows, setRows] = useState<RoleRow[]>([])
  const [available, setAvailable] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchRoles()
      .then((r) => {
        if (cancelled) return
        setRows(r)
        setAvailable(true)
      })
      .catch(() => {
        if (!cancelled) setAvailable(false)
      })
    return () => {
      cancelled = true
    }
  }, [tick])

  const roles = useMemo<Role[]>(
    () => (available && rows.length ? rows.map((r) => r.name) : DEFAULT_ROLES),
    [available, rows],
  )

  const isDefault = useCallback(
    (role: Role) => {
      const row = rows.find((r) => r.name === role)
      if (row) return row.is_default
      return DEFAULT_ROLES.includes(role)
    },
    [rows],
  )

  const addRole = useCallback(
    async (name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return { ok: false, error: 'Enter a role name.' }
      if (roles.some((r) => r.toLowerCase() === trimmed.toLowerCase())) {
        return { ok: false, error: 'That role already exists.' }
      }
      const { error } = await insertRole(trimmed)
      if (error) return { ok: false, error: error.message }
      setTick((t) => t + 1)
      return { ok: true }
    },
    [roles],
  )

  const removeRole = useCallback(
    async (role: RoleRow) => {
      if (role.is_default) return { ok: false, error: 'Default roles cannot be deleted.' }
      // Move users holding this role back to Viewer so nothing dangles
      await supabase.from('users').update({ role: 'viewer' }).eq('role', role.name)
      const { error } = await deleteRole(role.id)
      if (error) return { ok: false, error: error.message }
      setTick((t) => t + 1)
      return { ok: true }
    },
    [],
  )

  const value = useMemo(
    () => ({ roles, rows, available, isDefault, addRole, removeRole }),
    [roles, rows, available, isDefault, addRole, removeRole],
  )

  return <RolesContext.Provider value={value}>{children}</RolesContext.Provider>
}

export function useRoles(): RolesContextValue {
  return useContext(RolesContext)
}
