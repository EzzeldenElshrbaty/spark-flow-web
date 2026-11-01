// Side menu of Spark Flow. Add each section here as its feature is built; `permission` (the can() table) limits who sees an item.
import { IconClock, IconHome, IconLayoutDashboard, IconLayoutKanban, IconListCheck, IconSettings, IconUsers, type TablerIcon } from '@tabler/icons-react'
import { paths } from '@/lib/paths'
import { can, type Action, type Permission, type ProjectScoped } from '@/lib/permissions'

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
  // Anyone with something to change or read there: users, roles and permissions, the audit log, others' attendance,
  // hourly costs or the demo data.
  permission: 'settings.open',
  icon: IconSettings,
  description: 'Users, roles and permissions, the audit log, attendance, archived records, hourly costs and demo data.',
  link: paths.settings,
  children: [
    { path: 'users', label: 'Users', permission: 'settings.manage', link: paths.users },
    { path: 'roles', label: 'Roles and permissions', permission: 'settings.manage', link: paths.roles },
    { path: 'audit', label: 'Audit log', permission: 'audit.view', link: paths.audit },
    { path: 'attendance', label: 'Attendance', permission: 'checkins.view', link: paths.attendance },
    { path: 'archived', label: 'Archived records', permission: 'archive.manage', link: paths.archived },
    { path: 'rates', label: 'Rates', permission: 'rates.view', link: paths.rates },
    { path: 'database', label: 'Database', permission: 'database.manage', link: paths.database },
  ],
}

export const allNavItems: NavItem[] = [...navGroups.flatMap((group) => group.items), settingsItem]

/**
 * Whether someone with these permissions sees a menu item. `managesAny`: whether they manage a project, which opens
 * the Dashboard whatever their roles (unknown while projects load).
 */
export function canSee(item: NavItem, grants: readonly Permission[], extra: { managesAny?: boolean } = {}) {
  return !item.permission || can(item.permission, { userId: '', grants, ...extra })
}
