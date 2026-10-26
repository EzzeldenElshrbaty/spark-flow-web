import type { Project, Role } from '@/api/types'

// Who may do what (spec §4.3). The mock API refuses with 403 by these rules, the way the backend will, and the UI
// hides what a person can't use.

export type Action =
  | 'rates.view' | 'cost.view' | 'project.create' | 'project.edit' | 'phase.manage' | 'task.manage' | 'task.updateOwnStatus'
  | 'time.logOwn' | 'collab.post' | 'dashboard.view' | 'timeCost.view' | 'database.manage'

export type ProjectRef = Pick<Project, 'managerId' | 'memberIds' | 'teamIds'>

export type PermissionContext = {
  userId: string
  role: Role
  /** The project the action is about, when there is one. */
  project?: ProjectRef
  userTeamIds?: string[]
  taskAssigneeId?: string | null
  /** Whether the person manages at least one project (a member can be named a project's manager). */
  managesAny?: boolean
}

/** Actions that are always about one project: PM rights are per project, so these need it. */
export type ProjectScoped = 'project.edit' | 'phase.manage' | 'task.manage' | 'task.updateOwnStatus'

/** Whoever a project names as its manager has PM rights on it. */
const manages = (ctx: PermissionContext) => (ctx.project ? ctx.project.managerId === ctx.userId : false)

const isOn = (ctx: PermissionContext) =>
  !ctx.project ||
  ctx.project.managerId === ctx.userId ||
  ctx.project.memberIds.includes(ctx.userId) ||
  ctx.project.teamIds.some((id) => ctx.userTeamIds?.includes(id))

export function can(action: Exclude<Action, ProjectScoped>, ctx: PermissionContext): boolean
export function can(action: ProjectScoped, ctx: PermissionContext & { project: ProjectRef }): boolean
export function can(action: Action, ctx: PermissionContext): boolean {
  if (ctx.role === 'admin') return true
  switch (action) {
    case 'rates.view':
    case 'cost.view':
    case 'timeCost.view':
    case 'database.manage':
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
