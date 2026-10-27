import type { Project, Role } from '@/api/types'

// Who may do what (spec §4.3). The mock API refuses with 403 by these rules, the way the backend will, and the UI
// hides what a person can't use.

export type Action =
  | 'rates.view' | 'cost.view' | 'project.create' | 'project.edit' | 'phase.manage' | 'task.manage' | 'task.updateOwnStatus'
  | 'time.logOwn' | 'time.logOn' | 'collab.post' | 'dashboard.view' | 'timeCost.view' | 'database.manage' | 'project.archive' | 'channel.manage'

export type ProjectRef = Pick<Project, 'managerId' | 'memberIds' | 'teamIds'> & { archivedAt?: string | null }

export type PermissionContext = {
  userId: string
  role: Role
  /** The project the action is about, when there is one. */
  project?: ProjectRef
  userTeamIds?: string[]
  /** For channel.manage: the channel's privacy and members. */
  channel?: { isPrivate: boolean; memberIds: string[] }
  taskAssigneeId?: string | null
  /** Whether the person manages at least one project (a member can be named a project's manager). */
  managesAny?: boolean
}

/** Actions that are always about one project: PM rights are per project, so these need it. */
export type ProjectScoped = 'project.edit' | 'phase.manage' | 'task.manage' | 'task.updateOwnStatus' | 'time.logOn'

/** Whoever a project names as its manager has PM rights on it. */
const manages = (ctx: PermissionContext) => (ctx.project ? ctx.project.managerId === ctx.userId : false)

const isOn = (ctx: PermissionContext) =>
  !ctx.project ||
  ctx.project.managerId === ctx.userId ||
  ctx.project.memberIds.includes(ctx.userId) ||
  ctx.project.teamIds.some((id) => ctx.userTeamIds?.includes(id))

/** What changes a project or posts in it: none of it is allowed while the project is archived. */
const FROZEN = new Set<Action>(['project.edit', 'phase.manage', 'task.manage', 'task.updateOwnStatus', 'time.logOn', 'collab.post'])

export function can(action: Exclude<Action, ProjectScoped>, ctx: PermissionContext): boolean
export function can(action: ProjectScoped, ctx: PermissionContext & { project: ProjectRef }): boolean
export function can(action: Action, ctx: PermissionContext): boolean {
  // An archived project is frozen for everyone, Admins too, until it's restored (that is 'project.archive').
  if (ctx.project?.archivedAt && FROZEN.has(action)) return false
  // A channel's members manage it; Admins too, but only public ones: a private channel stays its members'.
  if (action === 'channel.manage') return Boolean(ctx.channel && (ctx.channel.memberIds.includes(ctx.userId) || (ctx.role === 'admin' && !ctx.channel.isPrivate)))
  if (ctx.role === 'admin') return true
  switch (action) {
    case 'rates.view':
    case 'cost.view':
    case 'timeCost.view':
    case 'database.manage':
    // Archiving takes a project out of every list and freezes it: Admins only.
    case 'project.archive':
      return false
    case 'project.create':
      return ctx.role === 'sales'
    case 'project.edit':
      return ctx.role === 'sales' || manages(ctx)
    case 'phase.manage':
    case 'task.manage':
      return manages(ctx)
    case 'task.updateOwnStatus':
      return manages(ctx) || (ctx.taskAssigneeId != null && ctx.taskAssigneeId === ctx.userId)
    case 'time.logOwn':
      return true
    // Logging time on a project: the people on it (manager, members, its teams); Admins anywhere.
    case 'time.logOn':
      return manages(ctx) || (Boolean(ctx.project) && isOn(ctx))
    case 'collab.post':
      return ctx.role === 'sales' || manages(ctx) || isOn(ctx)
    case 'dashboard.view':
      // About one project: manages that one. Otherwise: manages any (the pm role stands in when unknown).
      return ctx.role === 'sales' || (ctx.project ? manages(ctx) : (ctx.managesAny ?? ctx.role === 'pm'))
  }
}

export type Access = 'loading' | 'allowed' | 'denied'

/** What a gated page shows: nothing is refused until the account has loaded, so an admin never sees a refusal flash. */
export function accessOf(loading: boolean, allowed: boolean): Access {
  return loading ? 'loading' : allowed ? 'allowed' : 'denied'
}
