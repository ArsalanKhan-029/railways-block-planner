/** Database row types mirroring the Supabase `public` schema. */

export type TrainStatus = 'scheduled' | 'delayed' | 'completed'
export type BlockStatus = 'approved' | 'pending' | 'conflict' | 'rejected'
export type Urgency = 'low' | 'medium' | 'high'
export type ComplaintStatus = 'new' | 'linked' | 'resolved'
export type ComplaintSeverity = 'low' | 'medium' | 'high'
/** Role value on the users table: built-in snake_case ids or custom role names. */
export type UserRole = 'admin' | 'section_controller' | 'maintenance_engineer' | 'viewer' | (string & {})
export type UserStatus = 'active' | 'pending' | 'revoked'

export interface SectionRow {
  id: string
  name: string
  code: string
  /** Station codes this section runs between (real IR codes, e.g. NDLS-JP). */
  from_station?: string | null
  to_station?: string | null
  created_at: string
}

/** Stop times parsed from the real schedule dataset. */
export interface TrainRoute {
  /** ordered station codes */
  c: string[]
  /** arrival times (HH:MM:SS or null) */
  a: (string | null)[]
  /** departure times */
  d: (string | null)[]
  /** day index of journey (1 = day 1) */
  day: number[]
}

/** Demo Mode flag: row hidden from non-map views while demo mode is enabled. */
interface DemoFlag {
  demo_hidden?: boolean | null
}

/** Service priority class + running frequency for train scheduling. */
export type TrainPriority = 'express' | 'mail' | 'passenger' | 'freight'
export type TrainFrequency = 'daily' | 'weekly' | 'weekdays' | 'weekends' | 'specific'

export interface TrainRow extends DemoFlag {
  id: string
  section_id: string
  train_number: string
  name: string
  /** HH:MM:SS in IST */
  start_time: string
  end_time: string
  train_type: string
  activity: string
  status: TrainStatus
  priority?: TrainPriority
  frequency?: TrainFrequency
  /** Ordered station-code route with real schedule times (jsonb). */
  route?: TrainRoute | null
  distance_km?: number | null
  created_at: string
}

/** A railway station plotted on the network map. */
export interface StationRow {
  code: string
  name: string
  zone: string
  /** 'hub' (zonal/metro) | 'junction' (labeled) | 'station' (mapped) */
  tier: 'hub' | 'junction' | 'station' | string
  latitude: number
  longitude: number
}

export interface BlockRow extends DemoFlag {
  id: string
  section_id: string
  title: string
  block_type: string
  start_time: string
  end_time: string
  status: BlockStatus
  requested_by: string
  urgency: Urgency
  note: string | null
  created_at: string
}

export interface ComplaintRow extends DemoFlag {
  id: string
  section_id: string | null
  category: string
  description: string
  severity: ComplaintSeverity
  photo_url: string | null
  latitude: number | null
  longitude: number | null
  status: ComplaintStatus
  reported_by: string
  created_at: string
}

export type AssetStatus = 'operational' | 'degraded' | 'maintenance' | 'offline'

export interface RoleRow {
  id: string
  name: string
  is_default: boolean
  created_at: string
}

export interface AssetRow extends DemoFlag {
  id: string
  section_id: string | null
  asset_code: string
  name: string
  asset_type: string
  status: AssetStatus
  health_score: number
  last_serviced_at: string | null
  /** Physical asset currently powering this train. */
  train_id?: string | null
  home_code?: string | null
  created_at: string
}

export interface UserRow {
  id: string
  name: string
  email: string
  role: string // built-in snake_case ids or custom role names
  assigned_sections: string[]
  /** Driver: train_number of the assigned train (null otherwise). */
  assigned_train?: string | null
  status: UserStatus
  /** Linked Supabase Auth account (null = no login issued yet). */
  auth_user_id?: string | null
  created_at: string
}

/** A notification routed to one user (bell + toasts). */
export interface NotificationRow {
  id: string
  user_id: string
  title: string
  body: string
  kind: 'conflict' | 'block' | 'info' | string
  severity: string | null
  block_id: string | null
  section_code: string | null
  train_number: string | null
  created_at: string
  read_at: string | null
}
