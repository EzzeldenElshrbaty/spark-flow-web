// Side menu of Spark Flow. Add each section here as its feature is built; `permission` (the can() table) limits who sees an item.
import { Settings, type LucideIcon } from 'lucide-react'
import { can, type Action, type ProjectScoped } from '@/lib/permissions'
import type { Role } from '@/lib/roles'

export type NavItem = {
  path: string
  label: string
  /** Who sees it, from the one permission table. Absent: everyone. */
  permission?: Exclude<Action, ProjectScoped>
  icon?: LucideIcon
  description?: string
  children?: NavItem[]
}

export type NavGroup = { label: string; items: NavItem[] }

/** Spark Flow's own menu groups are built from the open workspace's channels, DMs and projects (see Sidebar). */
export const navGroups: NavGroup[] = []

/** `path` is only a key here: Settings lives inside a workspace, so its link is paths.settings(workspaceSlug). */
export const settingsItem: NavItem = {
  path: '/settings',
  label: 'Settings',
  permission: 'database.manage', // Settings only holds the Database page so far
  icon: Settings,
  description: 'Users, roles and the rules Spark Flow works by.',
}

export const allNavItems: NavItem[] = [...navGroups.flatMap((group) => group.items), settingsItem]

export function canSee(item: NavItem, role: Role) {
  return !item.permission || can(item.permission, { userId: '', role })
}
