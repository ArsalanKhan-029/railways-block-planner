'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { Role } from '@/lib/mock-data'

/** Roles that ship with the system and cannot be deleted. */
export const DEFAULT_ROLES: Role[] = ['Admin', 'Section Controller', 'Maintenance Engineer']

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
  roles: Role[]
  isDefault: (role: Role) => boolean
  addRole: (name: string) => { ok: boolean; error?: string }
  removeRole: (name: string) => void
}

const RolesContext = createContext<RolesContextValue | null>(null)

export function RolesProvider({ children }: { children: React.ReactNode }) {
  const [roles, setRoles] = useState<Role[]>(DEFAULT_ROLES)

  const isDefault = useCallback((role: Role) => DEFAULT_ROLES.includes(role), [])

  const addRole = useCallback(
    (name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return { ok: false, error: 'Enter a role name.' }
      if (roles.some((r) => r.toLowerCase() === trimmed.toLowerCase())) {
        return { ok: false, error: 'That role already exists.' }
      }
      setRoles((prev) => [...prev, trimmed])
      return { ok: true }
    },
    [roles],
  )

  const removeRole = useCallback(
    (name: string) => {
      if (DEFAULT_ROLES.includes(name)) return
      setRoles((prev) => prev.filter((r) => r !== name))
    },
    [],
  )

  const value = useMemo(
    () => ({ roles, isDefault, addRole, removeRole }),
    [roles, isDefault, addRole, removeRole],
  )

  return <RolesContext.Provider value={value}>{children}</RolesContext.Provider>
}

export function useRoles(): RolesContextValue {
  const ctx = useContext(RolesContext)
  if (!ctx) throw new Error('useRoles must be used within a RolesProvider')
  return ctx
}
