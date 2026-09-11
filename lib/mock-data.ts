/**
 * A role is a plain string so admins can define new roles at runtime.
 * The built-in roles are listed in `DEFAULT_ROLES` (see lib/roles.tsx).
 */
export type Role = string

export type BarType = 'train' | 'approved' | 'pending' | 'conflict'

export interface TimelineBar {
  id: string
  sectionId: string
  type: BarType
  label: string
  /** start hour in 24h decimal, e.g. 2.5 = 2:30 AM */
  start: number
  /** end hour in 24h decimal */
  end: number
  hasConflict?: boolean
  detail: {
    kind: 'Train' | 'Maintenance Block'
    trainNo?: string
    trainType?: 'Express' | 'Freight' | 'Passenger' | 'Superfast'
    activity?: string
    requestedBy?: string
    urgency?: 'Low' | 'Medium' | 'High'
    status?: string
    note?: string
  }
}

export interface RailSection {
  id: string
  name: string
  code: string
}

export interface BlockRequest {
  id: string
  ref: string
  sectionId: string
  section: string
  activity: string
  durationHrs: number
  urgency: 'Low' | 'Medium' | 'High'
  requestedBy: string
  requestedAt: string
}

export interface Complaint {
  id: string
  category: 'Track Defect' | 'Signal Fault' | 'Safety Hazard' | 'Block Overrun' | 'Other'
  section: string
  location: string
  severity: 'Low' | 'Medium' | 'High'
  status: 'New' | 'Linked to Block' | 'Resolved'
  date: string
  description: string
}

export interface ManagedUser {
  id: string
  name: string
  email: string
  role: Role
  sections: string[]
  status: 'Active' | 'Pending' | 'Revoked'
}

export interface AuditEntry {
  id: string
  timestamp: string
  user: string
  action: string
  note: string
}

export const SECTIONS: RailSection[] = [
  { id: 'mp', name: 'Mumbai–Pune Section', code: 'MMR-PUNE' },
  { id: 'da', name: 'Delhi–Agra Section', code: 'NDLS-AGC' },
  { id: 'hb', name: 'Howrah–Bardhaman Section', code: 'HWH-BWN' },
  { id: 'cb', name: 'Chennai–Bengaluru Section', code: 'MAS-SBC' },
  { id: 'ak', name: 'Ahmedabad–Vadodara Section', code: 'ADI-BRC' },
  { id: 'lk', name: 'Lucknow–Kanpur Section', code: 'LKO-CNB' },
]

export const KPIS = {
  assetAvailability: 94.2,
  assetAvailabilityDelta: 1.8,
  activeBlocks: 12,
  activeBlocksDelta: 3,
  pendingRequests: 7,
  pendingRequestsDelta: -2,
  conflictAlerts: 3,
  conflictAlertsDelta: 1,
}

export const TIMELINE_BARS: TimelineBar[] = [
  // Mumbai–Pune
  { id: 'b1', sectionId: 'mp', type: 'train', label: '12123 Deccan Queen', start: 5.5, end: 8.5, detail: { kind: 'Train', trainNo: '12123', trainType: 'Superfast', activity: 'Passenger service' } },
  { id: 'b2', sectionId: 'mp', type: 'approved', label: 'Rail grinding', start: 2, end: 4, detail: { kind: 'Maintenance Block', activity: 'Rail grinding', status: 'Approved', requestedBy: 'R. Deshmukh', note: 'Minimal impact, only 1 freight train affected.' } },
  { id: 'b3', sectionId: 'mp', type: 'train', label: '11007 Deccan Exp', start: 16, end: 19.5, detail: { kind: 'Train', trainNo: '11007', trainType: 'Express', activity: 'Passenger service' } },

  // Delhi–Agra
  { id: 'b4', sectionId: 'da', type: 'train', label: '12002 Shatabdi', start: 6, end: 8, detail: { kind: 'Train', trainNo: '12002', trainType: 'Superfast', activity: 'Passenger service' } },
  { id: 'b5', sectionId: 'da', type: 'pending', label: 'OHE inspection', start: 7, end: 9.5, hasConflict: true, detail: { kind: 'Maintenance Block', activity: 'OHE inspection', status: 'Pending', urgency: 'High', requestedBy: 'S. Nair', note: 'Overlaps with 12002 Shatabdi window.' } },
  { id: 'b6', sectionId: 'da', type: 'train', label: '12002 Shatabdi (ret)', start: 20, end: 22, detail: { kind: 'Train', trainNo: '12002', trainType: 'Superfast', activity: 'Return service' } },

  // Howrah–Bardhaman
  { id: 'b7', sectionId: 'hb', type: 'approved', label: 'Ballast cleaning', start: 1, end: 4.5, detail: { kind: 'Maintenance Block', activity: 'Ballast cleaning', status: 'Approved', requestedBy: 'A. Ghosh' } },
  { id: 'b8', sectionId: 'hb', type: 'train', label: '13011 Intercity', start: 9, end: 11.5, detail: { kind: 'Train', trainNo: '13011', trainType: 'Express', activity: 'Passenger service' } },
  { id: 'b9', sectionId: 'hb', type: 'train', label: 'GDS Freight', start: 13, end: 16, detail: { kind: 'Train', trainNo: 'FR-4402', trainType: 'Freight', activity: 'Goods movement' } },

  // Chennai–Bengaluru
  { id: 'b10', sectionId: 'cb', type: 'train', label: '12007 Shatabdi', start: 6, end: 11, detail: { kind: 'Train', trainNo: '12007', trainType: 'Superfast', activity: 'Passenger service' } },
  { id: 'b11', sectionId: 'cb', type: 'pending', label: 'Bridge girder check', start: 12, end: 15, detail: { kind: 'Maintenance Block', activity: 'Bridge girder inspection', status: 'Pending', urgency: 'Medium', requestedBy: 'K. Raman' } },
  { id: 'b12', sectionId: 'cb', type: 'conflict', label: 'Signal cable work', start: 10, end: 12.5, hasConflict: true, detail: { kind: 'Maintenance Block', activity: 'Signal cable replacement', status: 'Conflict', urgency: 'High', requestedBy: 'K. Raman', note: 'Overlaps 12007 Shatabdi tail + pending girder check.' } },

  // Ahmedabad–Vadodara
  { id: 'b13', sectionId: 'ak', type: 'train', label: '12009 Shatabdi', start: 5, end: 7, detail: { kind: 'Train', trainNo: '12009', trainType: 'Superfast', activity: 'Passenger service' } },
  { id: 'b14', sectionId: 'ak', type: 'approved', label: 'Point machine svc', start: 2, end: 3.5, detail: { kind: 'Maintenance Block', activity: 'Point machine servicing', status: 'Approved', requestedBy: 'M. Patel' } },
  { id: 'b15', sectionId: 'ak', type: 'train', label: 'FR-8810 Freight', start: 22, end: 24, detail: { kind: 'Train', trainNo: 'FR-8810', trainType: 'Freight', activity: 'Goods movement' } },

  // Lucknow–Kanpur
  { id: 'b16', sectionId: 'lk', type: 'pending', label: 'Track tamping', start: 3, end: 6, detail: { kind: 'Maintenance Block', activity: 'Track tamping', status: 'Pending', urgency: 'Low', requestedBy: 'V. Sharma' } },
  { id: 'b17', sectionId: 'lk', type: 'train', label: '12004 Swarna Shatabdi', start: 15.5, end: 18, detail: { kind: 'Train', trainNo: '12004', trainType: 'Superfast', activity: 'Passenger service' } },
]

export const BLOCK_REQUESTS: BlockRequest[] = [
  { id: 'r1', ref: 'BR-2041', sectionId: 'da', section: 'Delhi–Agra Section', activity: 'OHE inspection', durationHrs: 2.5, urgency: 'High', requestedBy: 'S. Nair', requestedAt: '2h ago' },
  { id: 'r2', ref: 'BR-2042', sectionId: 'cb', section: 'Chennai–Bengaluru Section', activity: 'Bridge girder inspection', durationHrs: 3, urgency: 'Medium', requestedBy: 'K. Raman', requestedAt: '4h ago' },
  { id: 'r3', ref: 'BR-2043', sectionId: 'lk', section: 'Lucknow–Kanpur Section', activity: 'Track tamping', durationHrs: 3, urgency: 'Low', requestedBy: 'V. Sharma', requestedAt: '6h ago' },
  { id: 'r4', ref: 'BR-2044', sectionId: 'cb', section: 'Chennai–Bengaluru Section', activity: 'Signal cable replacement', durationHrs: 2.5, urgency: 'High', requestedBy: 'K. Raman', requestedAt: '7h ago' },
  { id: 'r5', ref: 'BR-2045', sectionId: 'mp', section: 'Mumbai–Pune Section', activity: 'Culvert repair', durationHrs: 4, urgency: 'Medium', requestedBy: 'R. Deshmukh', requestedAt: '9h ago' },
  { id: 'r6', ref: 'BR-2046', sectionId: 'hb', section: 'Howrah–Bardhaman Section', activity: 'Level crossing gate svc', durationHrs: 1.5, urgency: 'Low', requestedBy: 'A. Ghosh', requestedAt: '11h ago' },
  { id: 'r7', ref: 'BR-2047', sectionId: 'ak', section: 'Ahmedabad–Vadodara Section', activity: 'Weld renewal', durationHrs: 2, urgency: 'Medium', requestedBy: 'M. Patel', requestedAt: '13h ago' },
]

export const AI_EXPLANATIONS = [
  { block: 'BR-2041 · OHE inspection', decision: 'Rescheduled to 2:00–4:30 AM', reason: 'Original 7:00 AM window overlapped Shatabdi 12002. Moving to the pre-dawn maintenance window avoids all passenger services with zero punctuality cost.', impact: 'positive' as const },
  { block: 'BR-2044 · Signal cable replacement', decision: 'Approved 10:30 AM–1:00 PM', reason: 'Only 1 freight train (FR-4402) affected; rerouted via loop line. Punctuality weight kept the girder check un-delayed.', impact: 'positive' as const },
  { block: 'BR-2042 · Bridge girder inspection', decision: 'Held for controller review', reason: 'High maintenance-throughput demand this shift creates a resource clash with the signal crew. Flagged as a trade-off between throughput and cost.', impact: 'warning' as const },
]

export const COMPLAINTS: Complaint[] = [
  { id: 'c1', category: 'Track Defect', section: 'Mumbai–Pune Section', location: '18.5204° N, 73.8567° E', severity: 'High', status: 'Linked to Block', date: '11 Sep 2026', description: 'Visible rail head crack near km post 142.' },
  { id: 'c2', category: 'Signal Fault', section: 'Delhi–Agra Section', location: '27.1767° N, 78.0081° E', severity: 'Medium', status: 'New', date: '11 Sep 2026', description: 'Home signal aspect flickering at outer.' },
  { id: 'c3', category: 'Safety Hazard', section: 'Chennai–Bengaluru Section', location: '12.9716° N, 77.5946° E', severity: 'High', status: 'New', date: '10 Sep 2026', description: 'Cattle guard damaged, animals entering track.' },
  { id: 'c4', category: 'Block Overrun', section: 'Howrah–Bardhaman Section', location: '22.5726° N, 88.3639° E', severity: 'Low', status: 'Resolved', date: '09 Sep 2026', description: 'Ballast cleaning block exceeded by 25 min.' },
  { id: 'c5', category: 'Other', section: 'Lucknow–Kanpur Section', location: '26.8467° N, 80.9462° E', severity: 'Medium', status: 'Resolved', date: '08 Sep 2026', description: 'Platform lighting outage at Unnao.' },
]

export const USERS: ManagedUser[] = [
  { id: 'u1', name: 'Arjun Mehta', email: 'arjun.mehta@ir.gov.in', role: 'Admin', sections: ['Mumbai–Pune Section', 'Delhi–Agra Section'], status: 'Active' },
  { id: 'u2', name: 'Sunita Nair', email: 's.nair@ir.gov.in', role: 'Section Controller', sections: ['Delhi–Agra Section'], status: 'Active' },
  { id: 'u3', name: 'Kartik Raman', email: 'k.raman@ir.gov.in', role: 'Maintenance Engineer', sections: ['Chennai–Bengaluru Section'], status: 'Active' },
  { id: 'u4', name: 'Vikram Sharma', email: 'v.sharma@ir.gov.in', role: 'Maintenance Engineer', sections: ['Lucknow–Kanpur Section'], status: 'Pending' },
  { id: 'u5', name: 'Priya Ghosh', email: 'p.ghosh@ir.gov.in', role: 'Section Controller', sections: ['Howrah–Bardhaman Section'], status: 'Active' },
  { id: 'u6', name: 'Manoj Patel', email: 'm.patel@ir.gov.in', role: 'Section Controller', sections: ['Ahmedabad–Vadodara Section'], status: 'Revoked' },
]

export const AUDIT_LOG: AuditEntry[] = [
  { id: 'a1', timestamp: '11 Sep 2026, 09:42', user: 'Arjun Mehta', action: 'Overrode Block BR-2041', note: 'Manual approval — urgent OHE fault reported by field staff.' },
  { id: 'a2', timestamp: '11 Sep 2026, 08:15', user: 'Sunita Nair', action: 'Rejected Block BR-2038', note: 'Clashes with Rajdhani path; requested reschedule.' },
  { id: 'a3', timestamp: '11 Sep 2026, 07:03', user: 'System (AI Planner)', action: 'Generated optimal plan', note: 'Punctuality 60 / Throughput 30 / Cost 10.' },
  { id: 'a4', timestamp: '10 Sep 2026, 22:48', user: 'Arjun Mehta', action: 'Changed role: V. Sharma', note: 'Section Controller → Maintenance Engineer.' },
  { id: 'a5', timestamp: '10 Sep 2026, 19:20', user: 'Kartik Raman', action: 'Submitted Block BR-2044', note: 'Signal cable replacement, marked high urgency.' },
]

export const AVAILABILITY_TREND = [
  { day: 'Mon', availability: 91.2, target: 92 },
  { day: 'Tue', availability: 92.8, target: 92 },
  { day: 'Wed', availability: 90.5, target: 92 },
  { day: 'Thu', availability: 93.4, target: 92 },
  { day: 'Fri', availability: 94.2, target: 92 },
  { day: 'Sat', availability: 95.1, target: 92 },
  { day: 'Sun', availability: 94.7, target: 92 },
]

export const UTILIZATION_BY_SECTION = [
  { section: 'Mumbai–Pune', utilization: 82 },
  { section: 'Delhi–Agra', utilization: 74 },
  { section: 'Howrah–Bardh.', utilization: 88 },
  { section: 'Chennai–Beng.', utilization: 69 },
  { section: 'Ahmedabad–Vad.', utilization: 91 },
  { section: 'Lucknow–Kanpur', utilization: 77 },
]

export const OVERRUN_FREQUENCY = [
  { week: 'W1', overruns: 6 },
  { week: 'W2', overruns: 4 },
  { week: 'W3', overruns: 5 },
  { week: 'W4', overruns: 2 },
  { week: 'W5', overruns: 3 },
  { week: 'W6', overruns: 1 },
]

export const COMPLAINTS_BY_CATEGORY = [
  { category: 'Track', count: 14 },
  { category: 'Signal', count: 9 },
  { category: 'Safety', count: 6 },
  { category: 'Overrun', count: 4 },
  { category: 'Other', count: 7 },
]

export const SECTION_COMPARISON = [
  { section: 'Mumbai–Pune Section', availability: 94.1, blocks: 38, overruns: 3, rating: 'Good' },
  { section: 'Delhi–Agra Section', availability: 90.6, blocks: 42, overruns: 6, rating: 'Fair' },
  { section: 'Howrah–Bardhaman Section', availability: 96.2, blocks: 31, overruns: 1, rating: 'Excellent' },
  { section: 'Chennai–Bengaluru Section', availability: 88.9, blocks: 47, overruns: 8, rating: 'Needs Attention' },
  { section: 'Ahmedabad–Vadodara Section', availability: 95.4, blocks: 29, overruns: 2, rating: 'Excellent' },
  { section: 'Lucknow–Kanpur Section', availability: 91.8, blocks: 35, overruns: 4, rating: 'Good' },
]
