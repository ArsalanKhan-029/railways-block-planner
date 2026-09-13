import type {
  BlockRequest,
  Complaint,
  ManagedUser,
  TimelineBar,
} from '@/lib/mock-data'
import type {
  BlockRow,
  ComplaintRow,
  SectionRow,
  TrainRow,
  UserRow,
} from '@/lib/types'
import { timestampToIstHours, timeToHours, istDayStartUtcMs } from '@/lib/api'

const BLOCK_STATUS_DISPLAY: Record<BlockRow['status'], string> = {
  approved: 'Approved',
  pending: 'Pending',
  conflict: 'Conflict',
  rejected: 'Rejected',
}

/** Train + block rows → timeline bars for a given IST day (defaults to today). */
export function toTimelineBars(
  trains: TrainRow[],
  blocks: BlockRow[],
  dayStartUtcMs: number = istDayStartUtcMs(),
): TimelineBar[] {
  const dayEndUtcMs = dayStartUtcMs + 24 * 60 * 60 * 1000

  const trainBars: TimelineBar[] = trains.map((t) => ({
    id: `train-${t.id}`,
    sectionId: t.section_id,
    type: 'train' as const,
    label: `${t.train_number} ${t.name}`,
    start: timeToHours(t.start_time),
    end: Math.max(timeToHours(t.end_time), timeToHours(t.start_time) + 0.25),
    detail: {
      kind: 'Train' as const,
      trainNo: t.train_number,
      trainType: t.train_type as TimelineBar['detail']['trainType'],
      activity: t.activity,
    },
  }))

  const blockBars: TimelineBar[] = blocks
    .filter((b) => {
      const startMs = new Date(b.start_time).getTime()
      const endMs = new Date(b.end_time).getTime()
      return startMs < dayEndUtcMs && endMs > dayStartUtcMs
    })
    .map((b) => {
      const rawStart = timestampToIstHours(b.start_time, dayStartUtcMs)
      const rawEnd = timestampToIstHours(b.end_time, dayStartUtcMs)
      // Clamp to the 24h window so cross-midnight blocks stay visible
      const start = Math.max(0, Math.min(24, rawStart))
      const end = Math.max(0.25, Math.min(24, rawEnd))
      return {
        id: `block-${b.id}`,
        sectionId: b.section_id,
        type: (b.status === 'approved'
          ? 'approved'
          : b.status === 'pending'
            ? 'pending'
            : 'conflict') as TimelineBar['type'],
        label: b.title,
        start,
        end,
        hasConflict: b.status === 'conflict',
        detail: {
          kind: 'Maintenance Block' as const,
          activity: b.title,
          status: BLOCK_STATUS_DISPLAY[b.status],
          urgency: (b.urgency.charAt(0).toUpperCase() + b.urgency.slice(1)) as TimelineBar['detail']['urgency'],
          requestedBy: b.requested_by,
          note: b.note ?? undefined,
        },
      }
    })

  return [...trainBars, ...blockBars]
}

const BLOCK_REF_PREFIX = 'BR-'

/** Pending blocks → the left-hand request list on the planning page. */
export function toBlockRequests(blocks: BlockRow[], sections: SectionRow[]): BlockRequest[] {
  const sectionById = new Map(sections.map((s) => [s.id, s]))
  const seq = new Map<string, number>()
  return blocks
    .filter((b) => b.status === 'pending')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((b, i) => {
      // Stable display refs derived from creation order (BR-2041, BR-2042, …)
      if (!seq.has(b.id)) seq.set(b.id, 2041 + i)
      const durationHrs =
        (new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / 3_600_000
      const ageHrs = Math.max(
        1,
        Math.round((Date.now() - new Date(b.created_at).getTime()) / 3_600_000),
      )
      return {
        id: b.id,
        ref: `${BLOCK_REF_PREFIX}${seq.get(b.id)}`,
        sectionId: b.section_id,
        section: sectionById.get(b.section_id)?.name ?? 'Unknown Section',
        activity: b.title,
        durationHrs: Math.round(durationHrs * 10) / 10,
        urgency: (b.urgency.charAt(0).toUpperCase() + b.urgency.slice(1)) as BlockRequest['urgency'],
        requestedBy: b.requested_by,
        requestedAt: `${ageHrs}h ago`,
      }
    })
}

const COMPLAINT_CATEGORY_ORDER = [
  'Track Defect',
  'Signal Fault',
  'Safety Hazard',
  'Block Overrun',
  'Other',
] as const

/** Complaint rows → the table shape on the report page. */
export function toComplaints(
  rows: ComplaintRow[],
  sections: SectionRow[],
): Complaint[] {
  const sectionById = new Map(sections.map((s) => [s.id, s]))
  return rows.map((r) => {
    const matched = COMPLAINT_CATEGORY_ORDER.find(
      (c) => c.toLowerCase() === r.category.toLowerCase(),
    )
    const lat = r.latitude != null ? `${Math.abs(r.latitude).toFixed(4)}° ${r.latitude >= 0 ? 'N' : 'S'}` : null
    const lon = r.longitude != null ? `${Math.abs(r.longitude).toFixed(4)}° ${r.longitude >= 0 ? 'E' : 'W'}` : null
    const location = [lat, lon].filter(Boolean).join(', ') || 'Location not captured'
    return {
      id: r.id,
      category: (matched ?? 'Other') as Complaint['category'],
      sectionId: r.section_id ?? undefined,
      section: r.section_id
        ? sectionById.get(r.section_id)?.name ?? 'Unassigned'
        : 'Unassigned',
      location,
      severity: (r.severity.charAt(0).toUpperCase() + r.severity.slice(1)) as Complaint['severity'],
      status: (r.status === 'new'
        ? 'New'
        : r.status === 'linked'
          ? 'Linked to Block'
          : 'Resolved') as Complaint['status'],
      date: new Date(r.created_at).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      description: r.description,
      photoUrl: r.photo_url ?? undefined,
    }
  })
}

/** User rows → the admin table shape. */
export function toManagedUsers(rows: UserRow[], sections: SectionRow[]): ManagedUser[] {
  const sectionById = new Map(sections.map((s) => [s.id, s]))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: ROLE_DISPLAY[r.role] ?? r.role,
    sections: r.assigned_sections
      .map((id) => sectionById.get(id)?.name)
      .filter((n): n is string => !!n),
    sectionIds: r.assigned_sections,
    status: (r.status.charAt(0).toUpperCase() + r.status.slice(1)) as ManagedUser['status'],
  }))
}

export const ROLE_DISPLAY: Record<string, string> = {
  admin: 'Admin',
  section_controller: 'Section Controller',
  maintenance_engineer: 'Maintenance Engineer',
  viewer: 'Viewer',
}

export const ROLE_TO_DB: Record<string, string> = {
  Admin: 'admin',
  'Section Controller': 'section_controller',
  'Maintenance Engineer': 'maintenance_engineer',
  Viewer: 'viewer',
}
