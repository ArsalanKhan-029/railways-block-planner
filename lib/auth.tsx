'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { toAuthEmail } from '@/lib/api'
import type { UserRow } from '@/lib/types'

/**
 * Single sign-in path: Supabase Auth email + password.
 *  • Login handles are plain usernames (mapped to <handle>@railmind.app in
 *    lib/api.ts) or a full email address — both go through the same
 *    signInWithPassword grant.
 *  • Every account is provisioned by the administrator from User Management;
 *    there is no self sign-up anywhere in the app.
 *  • The role lives on the linked public.users row (auth_user_id → users.id),
 *    looked up live so admin role changes apply on next refresh.
 */

export interface Identity {
  userId: string // auth.users id
  /** Linked staff row id in public.users (null if the row is missing). */
  staffRowId: string | null
  name: string
  email: string
  role: string // db role value: 'admin' | 'section_controller' | ... | custom
  /** Driver: train_number this driver is assigned to (null otherwise). */
  assignedTrain: string | null
  /** Sections this staff member is assigned to (controllers/drivers). */
  assignedSections: string[]
}

/** Map a profile/db role to the UI Role string used across the app. */
export function profileToRole(role: string | undefined | null): string {
  switch (role) {
    case 'admin':
      return 'Admin'
    case 'section_controller':
      return 'Section Controller'
    case 'maintenance_engineer':
      return 'Maintenance Engineer'
    case 'driver':
      return 'Driver'
    case 'viewer':
      return 'Viewer'
    default:
      // Custom role names are stored verbatim
      return role || 'Viewer'
  }
}

interface AuthContextValue {
  identity: Identity | null
  user: User | null
  ready: boolean
  /** Current Supabase access token — lets server routes act as this user. */
  accessToken: string | null
  /** Username/email + password sign-in via Supabase Auth. */
  signIn: (handle: string, password: string) => Promise<{ ok: boolean; error?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  identity: null,
  user: null,
  ready: false,
  accessToken: null,
  signIn: async () => ({ ok: false }),
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [staffRow, setStaffRow] = useState<UserRow | null>(null)
  // Resolves once the initial getSession() check has completed — the app must
  // not render the login screen before this, or a signed-in user sees a flash
  // of the login page on every reload.
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const ready = sessionLoaded

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoaded(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Resolve the linked staff row (role, sections) for the signed-in user
  useEffect(() => {
    let cancelled = false
    const authUser: User | null = session?.user ?? null
    if (!authUser) {
      setStaffRow(null)
      return
    }
    supabase
      .from('users')
      .select('*')
      .eq('auth_user_id', authUser.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setStaffRow((data as UserRow) ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [session])

  const signIn = useCallback(async (handle: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: toAuthEmail(handle),
      password,
    })
    if (error) return { ok: false, error: error.message }
    // session fires onAuthStateChange; identity derives from it
    return { ok: true }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setStaffRow(null)
  }, [])

  const identity: Identity | null = session?.user
    ? {
        userId: session.user.id,
        staffRowId: staffRow?.id ?? null,
        name:
          staffRow?.name ??
          (session.user.user_metadata?.full_name as string) ??
          session.user.email ??
          'User',
        email: staffRow?.email ?? session.user.email ?? '',
        role: staffRow?.role ?? 'viewer',
        assignedTrain: staffRow?.assigned_train ?? null,
        assignedSections: staffRow?.assigned_sections ?? [],
      }
    : null

  return (
    <AuthContext.Provider value={{ identity, user: session?.user ?? null, ready, accessToken: session?.access_token ?? null, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
