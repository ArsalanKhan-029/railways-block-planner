'use client'

/**
 * Data access layer — every read/write the app performs goes through Supabase.
 * All helpers return plain data ready for the existing UI components, so no
 * component layout or styling changes are needed.
 */

import { supabase } from '@/lib/supabase'
import type {
  AssetRow,
  BlockRow,
  BlockStatus,
  ComplaintRow,
  NotificationRow,
  RoleRow,
  SectionRow,
  StationRow,
  TrainRow,
  UserRow,
  UserRole,
  UserStatus,
} from '@/lib/types'

/** "06:00:00" → 6; "09:30:00" → 9.5 (decimal hours for the timeline). */
export function timeToHours(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h + (m ?? 0) / 60
}

/** timestamptz → decimal hours in IST for today's 24h timeline. */
export function timestampToIstHours(ts: string, dayStartUtcMs: number): number {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
  const ms = new Date(ts).getTime() + IST_OFFSET_MS - dayStartUtcMs
  return ms / (60 * 60 * 1000)
}

/** UTC midnight of "today" in IST, so IST dates map to a stable 24h window. */
export function istDayStartUtcMs(now = new Date()): number {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
  const istNow = new Date(now.getTime() + IST_OFFSET_MS)
  const istMidnight = Date.UTC(
    istNow.getUTCFullYear(),
    istNow.getUTCMonth(),
    istNow.getUTCDate(),
  )
  return istMidnight - IST_OFFSET_MS
}

export async function fetchSections(): Promise<SectionRow[]> {
  const { data, error } = await supabase
    .from('sections')
    .select('*')
    .order('created_at')
  if (error) throw error
  return data ?? []
}

export async function fetchTrains(): Promise<TrainRow[]> {
  const { data, error } = await supabase
    .from('trains')
    .select('*')
    .order('start_time')
  if (error) throw error
  return data ?? []
}

export async function fetchBlocks(): Promise<BlockRow[]> {
  const { data, error } = await supabase
    .from('blocks')
    .select('*')
    .order('start_time')
  if (error) throw error
  return data ?? []
}

export async function fetchComplaints(): Promise<ComplaintRow[]> {
  const { data, error } = await supabase
    .from('complaints')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchUsers(): Promise<UserRow[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at')
  if (error) throw error
  return data ?? []
}

export function updateBlockStatus(id: string, status: BlockStatus) {
  return supabase.from('blocks').update({ status }).eq('id', id)
}

export interface NewBlockInput {
  section_id: string
  title: string
  block_type: string
  start_time: string // ISO timestamp
  end_time: string // ISO timestamp
  urgency: 'low' | 'medium' | 'high'
  requested_by?: string
}

export function insertBlock(input: NewBlockInput) {
  return supabase.from('blocks').insert({
    ...input,
    status: 'pending' as const,
    requested_by: input.requested_by ?? 'Current User',
  })
}

export interface NewComplaintInput {
  section_id: string | null
  category: string
  description: string
  severity: 'low' | 'medium' | 'high'
  photo_url: string | null
  latitude: number | null
  longitude: number | null
  reported_by?: string
}

export function insertComplaint(input: NewComplaintInput) {
  return supabase
    .from('complaints')
    .insert({
      ...input,
      status: 'new' as const,
      reported_by: input.reported_by ?? 'Field Staff',
    })
    .select('id')
}

/** Uploads a complaint photo to Supabase Storage and returns its public URL. */
export async function uploadComplaintPhoto(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage
    .from('complaint-photos')
    .upload(path, file, { contentType: file.type })
  if (error) throw error
  const { data } = supabase.storage.from('complaint-photos').getPublicUrl(path)
  return data.publicUrl
}

/** Role value stored in the users table: built-in snake_case ids or custom role names. */
export function updateUserRole(id: string, role: string) {
  return supabase.from('users').update({ role }).eq('id', id)
}

// ---------------- Auth: admin-managed Supabase Auth accounts ----------------

/**
 * Resolve a login handle to the Supabase Auth email behind it.
 *  • "name"            → name@railmind.app
 *  • "name@"           → name@railmind.app  (trailing-@ handle form)
 *  • "name@domain.tld" → passed through (a real email address)
 * All three forms hit the same auth.users row, so "railadmin@" and
 * "railadmin@railmind.app" both work.
 */
export function toAuthEmail(handle: string): string {
  const trimmed = handle.trim().toLowerCase()
  const at = trimmed.lastIndexOf('@')
  if (at > 0 && at === trimmed.length - 1) {
    return `${trimmed.slice(0, at)}@railmind.app`
  }
  if (trimmed.includes('@')) return trimmed
  return `${trimmed}@railmind.app`
}

/**
 * Admin: provision a real Supabase Auth account (email + password) and link
 * it to the staff row. Runs through a SECURITY DEFINER RPC because creating
 * auth users is a privileged operation — regular users can never self-register.
 */
export async function createAuthUser(input: {
  authEmail: string
  password: string
  user_id: string
  name: string
  sections: string[]
}): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('admin_create_auth_user', {
    p_email: input.authEmail,
    p_password: input.password,
    p_user_id: input.user_id,
    p_name: input.name,
    p_sections: input.sections.length ? input.sections : null,
  })
  if (error) {
    // Postgres 42883 = function does not exist: migration not applied yet
    if ((error as { code?: string }).code === '42883') {
      return {
        ok: false,
        error:
          'Auth provisioning is not set up yet: apply supabase/migration_auth_assets.sql in the Supabase SQL Editor first.',
      }
    }
    return { ok: false, error: error.message }
  }
  return { ok: !!data }
}

/** Admin: reset an existing user's Supabase Auth password. */
export async function resetAuthPassword(
  user_id: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('admin_reset_password', {
    p_user_id: user_id,
    p_new_password: password,
  })
  if (error) {
    if ((error as { code?: string }).code === '42883') {
      return {
        ok: false,
        error:
          'Auth provisioning is not set up yet: apply supabase/migration_auth_assets.sql in the Supabase SQL Editor first.',
      }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

/** Admin: ban/unban the auth account and set the staff status to match. */
export async function setUserAccess(
  user_id: string,
  disable: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('admin_disable_user', {
    p_user_id: user_id,
    p_disable: disable,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export function updateUserStatus(id: string, status: UserStatus) {
  return supabase.from('users').update({ status }).eq('id', id)
}

export function updateUserSections(id: string, assigned_sections: string[]) {
  return supabase.from('users').update({ assigned_sections }).eq('id', id)
}

/** Driver: assign a specific train (by train_number) to a staff row. */
export function updateUserTrain(id: string, train_number: string | null) {
  return supabase.from('users').update({ assigned_train: train_number }).eq('id', id)
}

// ---------------- Routed notifications ----------------

export async function fetchMyNotifications(userId: string): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data ?? []
}

export interface NewNotification {
  user_id: string
  title: string
  body: string
  kind?: string
  severity?: string | null
  block_id?: string | null
  section_code?: string | null
  train_number?: string | null
}

export async function insertNotifications(rows: NewNotification[]): Promise<{ ok: boolean; error?: string }> {
  if (!rows.length) return { ok: true }
  const { error } = await supabase.from('notifications').insert(
    rows.map((r) => ({
      kind: 'conflict',
      ...r,
    })),
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export function markNotificationRead(id: string) {
  return supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
}

/**
 * Fan-out a raised conflict/block to everyone it concerns: admins always,
 * controllers assigned to the section, and drivers whose assigned train's
 * route passes through the affected section.
 */
export async function routeConflictNotifications(input: {
  block: BlockRow
  section: SectionRow | null
  trains: TrainRow[]
  users: UserRow[]
}): Promise<{ ok: boolean; notified: number }> {
  const { block, section, trains, users } = input
  const title = `Conflict · ${block.title}`
  const where = section ? section.name : 'Unassigned section'
  const body = `${block.title} on ${where} — urgency ${block.urgency}. Raised by ${block.requested_by}.`

  const targets = new Map<string, { user: UserRow; trainNumber: string | null }>()
  for (const u of users) {
    if (u.status !== 'active') continue
    const isAdmin = u.role === 'admin'
    const isController = u.role === 'section_controller' && section && u.assigned_sections?.includes(section.id)
    targets.set(u.id, { user: u, trainNumber: null })
    if (!isAdmin && !isController) targets.delete(u.id)
  }
  // drivers whose assigned train routes through the affected section
  if (section) {
    for (const tr of trains) {
      if (tr.section_id !== section.id) continue
      for (const u of users) {
        if (u.role === 'driver' && u.status === 'active' && u.assigned_train === tr.train_number) {
          targets.set(u.id, { user: u, trainNumber: tr.train_number })
        }
      }
    }
  }

  const rows: NewNotification[] = [...targets.values()].map(({ user, trainNumber }) => ({
    // Keyed by the auth id so the recipient's RLS (`user_id = auth.uid()`)
    // can read it — staff-row ids are not visible to the auth system.
    user_id: user.auth_user_id ?? user.id,
    title,
    body: trainNumber ? `${body} Affects your train ${trainNumber}.` : body,
    severity: block.urgency,
    block_id: block.id,
    section_code: section?.code ?? null,
    train_number: trainNumber,
  }))
  const res = await insertNotifications(rows)
  return { ok: res.ok, notified: rows.length }
}

/**
 * One-call conflict fan-out: looks up the block, its section, the trains in
 * that section and all active staff, then routes notifications. Safe to call
 * fire-and-forget from any conflict-raising surface (planning, network flag,
 * data console).
 */
export async function notifyConflict(blockId: string): Promise<void> {
  try {
    const [{ data: block }, { data: trains }, { data: users }] = await Promise.all([
      supabase.from('blocks').select('*').eq('id', blockId).maybeSingle(),
      supabase.from('trains').select('*'),
      supabase.from('users').select('id, role, status, assigned_sections, assigned_train, auth_user_id'),
    ])
    if (!block) return
    let section: SectionRow | null = null
    if (block.section_id) {
      const { data } = await supabase.from('sections').select('*').eq('id', block.section_id).maybeSingle()
      section = data as SectionRow | null
    }
    const inSection = section ? (trains ?? []).filter((t) => t.section_id === section!.id) : []
    await routeConflictNotifications({
      block: block as BlockRow,
      section,
      trains: inSection,
      users: (users ?? []) as UserRow[],
    })
  } catch (err) {
    console.error('notifyConflict failed', err)
  }
}

/**
 * Admin: create a staff record AND its Supabase Auth login in one step.
 * The person can sign in immediately with the returned credentials.
 */
export async function insertUserWithAuth(input: {
  name: string
  handle: string
  password: string
  role: string
  assigned_sections: string[]
}): Promise<{ ok: boolean; error?: string }> {
  // 1. staff row (pending until the auth account exists)
  const authEmail = toAuthEmail(input.handle)
  const { data, error: insertError } = await supabase
    .from('users')
    .insert({
      name: input.name,
      email: authEmail,
      role: input.role,
      assigned_sections: input.assigned_sections,
      status: 'pending' as const,
    })
    .select('id')
    .single()
  if (insertError) return { ok: false, error: insertError.message }

  // 2. the real auth account — on failure, remove the staff row again
  const res = await createAuthUser({
    authEmail,
    password: input.password,
    user_id: (data as { id: string }).id,
    name: input.name,
    sections: input.assigned_sections,
  })
  if (!res.ok) {
    await supabase.from('users').delete().eq('id', (data as { id: string }).id)
    return { ok: false, error: res.error ?? 'Could not create the auth account' }
  }
  return { ok: true }
}

// ---------------- Assets registry ----------------

export async function fetchAssets(): Promise<AssetRow[]> {
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .order('created_at')
  if (error) throw error
  return data ?? []
}

// ---------------- Stations (network map) ----------------

export async function fetchStations(): Promise<StationRow[]> {
  // The table holds ~3.5k rows — page through to beat PostgREST's default limit.
  const PAGE = 1000
  const all: StationRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('stations')
      .select('*')
      .order('code')
      .range(from, from + PAGE - 1)
    if (error) throw error
    all.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return all
}

// ---------------- Sections / stations / trains admin CRUD ----------------

export interface NewSectionInput {
  name: string
  code: string
  from_station?: string | null
  to_station?: string | null
}

export function insertSection(input: NewSectionInput) {
  return supabase.from('sections').insert(input)
}

export function updateSection(id: string, patch: Partial<NewSectionInput>) {
  return supabase.from('sections').update(patch).eq('id', id)
}

export function deleteSection(id: string) {
  return supabase.from('sections').delete().eq('id', id)
}

export interface NewStationInput {
  code: string
  name: string
  zone: string
  tier: string
  latitude: number
  longitude: number
}

export function insertStation(input: NewStationInput) {
  return supabase.from('stations').insert(input)
}

export function updateStation(code: string, patch: Partial<NewStationInput>) {
  return supabase.from('stations').update(patch).eq('code', code)
}

export function deleteStation(code: string) {
  return supabase.from('stations').delete().eq('code', code)
}

export interface NewTrainInput {
  section_id: string
  train_number: string
  name: string
  start_time: string
  end_time: string
  train_type?: string
  status?: TrainRow['status']
}

export function insertTrain(input: NewTrainInput) {
  return supabase.from('trains').insert({ ...input, activity: 'running' })
}

export function updateTrain(id: string, patch: Partial<NewTrainInput> & { status?: TrainRow['status'] }) {
  return supabase.from('trains').update(patch).eq('id', id)
}

export function deleteTrain(id: string) {
  return supabase.from('trains').delete().eq('id', id)
}

export function deleteBlock(id: string) {
  return supabase.from('blocks').delete().eq('id', id)
}

export function deleteComplaint(id: string) {
  return supabase.from('complaints').delete().eq('id', id)
}

/** Mark a section's track segment conflicted/blocked (Network View + admin). */
export async function setSectionConflict(
  sectionId: string,
  conflicted: boolean,
): Promise<{ error: { message: string } | null }> {
  if (conflicted) {
    // idempotent: only insert if the section has no conflict block yet
    const { data } = await supabase
      .from('blocks')
      .select('id')
      .eq('section_id', sectionId)
      .eq('status', 'conflict')
      .limit(1)
    if (data && data.length) return { error: null }
    const now = Date.now()
    const { data: created, error } = await supabase
      .from('blocks')
      .insert({
        section_id: sectionId,
        title: 'Track blocked — manual flag',
        block_type: 'maintenance',
        start_time: new Date(now - 3_600_000).toISOString(),
        end_time: new Date(now + 8 * 3_600_000).toISOString(),
        status: 'conflict' as const,
        requested_by: 'Network View (manual flag)',
        urgency: 'high' as const,
      })
      .select('id')
      .single()
    if (!error && created) await notifyConflict((created as { id: string }).id)
    return { error }
  }
  return supabase
    .from('blocks')
    .update({ status: 'approved' })
    .eq('section_id', sectionId)
    .eq('status', 'conflict')
}

export interface NewAssetInput {
  section_id: string | null
  asset_code: string
  name: string
  asset_type: string
  status: AssetRow['status']
  health_score: number
  last_serviced_at: string | null
}

export function insertAsset(input: NewAssetInput) {
  return supabase.from('assets').insert(input)
}

export function updateAsset(id: string, patch: Partial<NewAssetInput>) {
  return supabase.from('assets').update(patch).eq('id', id)
}

export function deleteAsset(id: string) {
  return supabase.from('assets').delete().eq('id', id)
}

// ---------------- Role catalog (admin-managed) ----------------

export async function fetchRoles(): Promise<RoleRow[]> {
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .order('created_at')
  if (error) throw error
  return data ?? []
}

export function insertRole(name: string) {
  return supabase.from('roles').insert({ name, is_default: false })
}

export function deleteRole(id: string) {
  return supabase.from('roles').delete().eq('id', id)
}
