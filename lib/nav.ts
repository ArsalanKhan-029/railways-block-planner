import {
  LayoutDashboard,
  CalendarClock,
  TriangleAlert,
  BarChart3,
  Users,
  Settings,
  Boxes,
  Waypoints,
  Database,
  TrainFront,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/lib/mock-data'

export type ViewId =
  | 'dashboard'
  | 'planning'
  | 'network'
  | 'assets'
  | 'report'
  | 'analytics'
  | 'admin'
  | 'data'
  | 'driver'
  | 'settings'

export interface NavItem {
  id: ViewId
  label: string
  icon: LucideIcon
  roles: Role[]
}

const ALL: Role[] = ['Admin', 'Section Controller', 'Maintenance Engineer', 'Driver', 'Viewer']
const OPS: Role[] = ['Admin', 'Section Controller', 'Maintenance Engineer']

export const NAV_ITEMS: NavItem[] = [
  // Drivers get their own focused console instead of the ops dashboard.
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['Admin', 'Section Controller', 'Maintenance Engineer', 'Viewer'] },
  {
    id: 'planning',
    label: 'Block Planning',
    icon: CalendarClock,
    roles: OPS,
  },
  { id: 'network', label: 'Network View', icon: Waypoints, roles: ALL },
  { id: 'assets', label: 'Asset Registry', icon: Boxes, roles: ALL },
  { id: 'report', label: 'Report Issue', icon: TriangleAlert, roles: ALL },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, roles: ['Admin', 'Viewer'] },
  { id: 'admin', label: 'User Management', icon: Users, roles: ['Admin'] },
  { id: 'data', label: 'Data Console', icon: Database, roles: ['Admin'] },
  { id: 'driver', label: 'My Train', icon: TrainFront, roles: ['Driver'] },
  { id: 'settings', label: 'Settings', icon: Settings, roles: ALL },
]

const BUILT_IN: Role[] = [...ALL]

export function canAccess(view: ViewId, role: Role): boolean {
  // Custom (admin-created) roles get the shared read/report surfaces —
  // same access as Viewer — until fine-grained permissions ship.
  if (!BUILT_IN.includes(role)) {
    const item = NAV_ITEMS.find((n) => n.id === view)
    return !!item && item.roles.length === ALL.length
  }
  const item = NAV_ITEMS.find((n) => n.id === view)
  return item ? item.roles.includes(role) : false
}
