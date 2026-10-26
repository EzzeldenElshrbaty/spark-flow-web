// Side menu of Spark Flow. Add each section here as its feature is built; `roles` limits who sees an item.
import { House, Settings, type LucideIcon } from 'lucide-react'
import type { Role } from './lib/roles'

export type NavItem = {
  path: string
  label: string
  permission: string
  icon?: LucideIcon
  roles?: Role[]
  description?: string
  children?: NavItem[]
}

export type NavGroup = { label: string; items: NavItem[] }

export const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ path: '/', label: 'Home', permission: 'dashboard.view', icon: House, description: "Today's work at a glance." }],
  },
]

export const settingsItem: NavItem = {
  path: '/settings',
  label: 'Settings',
  permission: 'settings.manage',
  icon: Settings,
  roles: ['Management'],
  description: 'Users, roles and the rules Spark Flow works by.',
}

export const allNavItems: NavItem[] = [...navGroups.flatMap((group) => group.items), settingsItem]

export function canSee(item: NavItem, role: Role) {
  return !item.roles || item.roles.includes(role)
}

// Items pinned to the mobile bottom bar; everything else lives under "More".
export const mobilePrimaryPaths = ['/']
