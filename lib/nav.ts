import {
  LayoutDashboard,
  CalendarClock,
  TriangleAlert,
  BarChart3,
  Users,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/lib/mock-data'

export type ViewId =
  | 'dashboard'
  | 'planning'
  | 'report'
  | 'analytics'
  | 'admin'
  | 'settings'

export interface NavItem {
  id: ViewId
  label: string
  icon: LucideIcon
  roles: Role[]
}

const ALL: Role[] = ['Admin', 'Section Controller', 'Maintenance Engineer', 'Viewer']

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ALL },
  {
    id: 'planning',
    label: 'Block Planning',
    icon: CalendarClock,
    roles: ['Admin', 'Section Controller', 'Maintenance Engineer'],
  },
  { id: 'report', label: 'Report Issue', icon: TriangleAlert, roles: ALL },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, roles: ['Admin', 'Viewer'] },
  { id: 'admin', label: 'User Management', icon: Users, roles: ['Admin'] },
  { id: 'settings', label: 'Settings', icon: Settings, roles: ALL },
]

export function canAccess(view: ViewId, role: Role): boolean {
  const item = NAV_ITEMS.find((n) => n.id === view)
  return item ? item.roles.includes(role) : false
}
