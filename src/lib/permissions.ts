import type { Project, Role } from '@/api/types'

// Who may do what (spec §4.3). The mock API refuses with 403 by these rules, the way the backend will, and the UI
// hides what a person can't use.

export type Action =
  | 'rates.view' | 'cost.view' | 'project.create' | 'project.edit' | 'phase.manage' | 'task.manage' | 'task.updateOwnStatus'
  | 'time.logOwn' | 'collab.post' | 'dashboard.view' | 'timeCost.view' | 'database.manage'

export type PermissionContext = {
  userId: string
  role: Role
  /** The project the action is about, when there is one. */
  project?: Pick<Project, 'managerId' | 'memberIds' | 'teamIds'>
  userTeamIds?: string[]
  taskAssigneeId?: string | null
}

/** Whoever a project names as its manager has PM rights on it. With no project in view, the pm role stands in. */
const manages = (ctx: PermissionContext) => (ctx.project ? ctx.project.managerId === ctx.userId : ctx.role === 'pm')

const isOn = (ctx: PermissionContext) =>
  !ctx.project ||
  ctx.project.managerId === ctx.userId ||
  ctx.project.memberIds.includes(ctx.userId) ||
  ctx.project.teamIds.some((id) => ctx.userTeamIds?.includes(id))

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
      return ctx.role === 'sales' || manages(ctx)
  }
}
