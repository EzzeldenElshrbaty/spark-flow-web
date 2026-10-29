// Side menu of Spark Flow. Add each section here as its feature is built; `permission` (the can() table) limits who sees an item.
import { IconClock, IconHome, IconLayoutDashboard, IconLayoutKanban, IconListCheck, IconSettings, IconUsers, type TablerIcon } from '@tabler/icons-react'
import { paths } from '@/lib/paths'
import { can, type Action, type ProjectScoped } from '@/lib/permissions'
import type { Role } from '@/lib/roles'

export type NavItem = {
  path: string
  label: string
  /** Who sees it, from the one permission table. Absent: everyone. */
  permission?: Exclude<Action, ProjectScoped>
  icon?: TablerIcon
  description?: string
  children?: NavItem[]
  /** Where it goes in a workspace; pages inside a workspace need its slug. */
  link?: (workspaceSlug: string) => string
}

export type NavGroup = { label: string; items: NavItem[] }

/**
 * Spark Flow's pages, by group, as search offers them (the sidebar adds the workspace's channels, DMs and projects).
 * The sidebar keeps its own list of these pages for now (it checks dashboard access per project it manages).
 */
export const navGroups: NavGroup[] = [
  {
    label: 'Work',
    items: [
      { path: 'home', label: 'Home', icon: IconHome, description: 'Your day: check-in, timer and mentions', link: paths.home },
      { path: 'projects', label: 'Projects', icon: IconLayoutKanban, description: 'Every project in the workspace', link: paths.projects },
      { path: 'tasks', label: 'My tasks', icon: IconListCheck, description: 'Your open tasks, overdue first', link: paths.tasks },
      { path: 'teams', label: 'Teams', icon: IconUsers, description: 'Teams and who is in them', link: paths.teams },
    ],
  },
  {
    label: 'Manage',
    items: [
      { path: 'dashboard', label: 'Dashboard', icon: IconLayoutDashboard, permission: 'dashboard.view', description: 'Projects, hours and who is checked in', link: paths.dashboard },
      { path: 'time', label: 'Time & cost', icon: IconClock, permission: 'timeCost.view', description: 'Hours and cost by project, person and week', link: paths.timeCost },
    ],
  },
]

/** `path` is only a key here: Settings lives inside a workspace, so its link is paths.settings(workspaceSlug). */
export const settingsItem: NavItem = {
  path: '/settings',
  label: 'Settings',
  permission: 'database.manage', // Settings only holds the Database and Rates pages so far
  icon: IconSettings,
  description: 'Demo data and hourly costs.',
  link: paths.settings,
  children: [
    { path: 'rates', label: 'Rates', permission: 'rates.view', link: paths.rates },
    { path: 'database', label: 'Database', permission: 'database.manage', link: paths.database },
  ],
}

export const allNavItems: NavItem[] = [...navGroups.flatMap((group) => group.items), settingsItem]

export function canSee(item: NavItem, role: Role) {
  return !item.permission || can(item.permission, { userId: '', role })
}
