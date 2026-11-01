import type { Project } from '@/api/types'

// Who may do what (spec §4.3, slice 1 of Admin and help). A role is a record that grants permissions from the fixed list
// below, and a person holds one or more roles, getting every permission of each. `can()` turns those grants, plus the
// rules that depend on the record itself (a project's manager, a message's author, a channel's members), into one
// answer per action. The mock API refuses with 403 by it, the way the backend will, and the UI hides what a person
// can't use.

/** The permissions a role can grant, grouped as the Roles and permissions page lists them, each with its words. */
export const PERMISSION_GROUPS = [
  {
    label: 'General',
    permissions: [
      { id: 'dashboard.all', label: 'See the dashboard for every project' },
      { id: 'checkins.all', label: 'See everyone who is checked in' },
      { id: 'checkins.managed', label: 'See who is checked in on projects they manage' },
    ],
  },
  {
    label: 'Projects and tasks',
    permissions: [
      { id: 'projects.create', label: 'Create projects' },
      { id: 'projects.editAll', label: 'Change any project’s details' },
      { id: 'projects.runAll', label: 'Run any project: phases, tasks and their status' },
      { id: 'projects.postAll', label: 'Comment, report bugs and chat on any project' },
      { id: 'projects.archive', label: 'Archive or restore projects' },
    ],
  },
  {
    label: 'Time and cost',
    permissions: [
      { id: 'time.logAll', label: 'Log time on any project' },
      { id: 'time.othersAll', label: 'See and change everyone’s time' },
      { id: 'cost.view', label: 'See project cost and the Time and cost page' },
      { id: 'rates.manage', label: 'See and change hourly costs' },
    ],
  },
  {
    label: 'Chat',
    permissions: [
      { id: 'channels.manageAll', label: 'Change and archive any public channel' },
      { id: 'channels.settings', label: 'Choose who can post and which channels new people join, and post where only admins can' },
      { id: 'channels.invite', label: 'Invite people from outside the company, and take back anyone’s invitation' },
      { id: 'messages.deleteAll', label: 'Delete anyone’s messages' },
      { id: 'files.manageAll', label: 'Change, delete and share anyone’s files' },
    ],
  },
  {
    label: 'Settings and data',
    permissions: [
      { id: 'settings.manage', label: 'Change settings, users and roles' },
      { id: 'audit.view', label: 'See the audit log' },
      { id: 'archive.manage', label: 'Manage archived records: how long they’re kept, and deleting them for good' },
      { id: 'database.manage', label: 'Export, reload or reset the demo data' },
    ],
  },
] as const

export type Permission = (typeof PERMISSION_GROUPS)[number]['permissions'][number]['id']

/** Every permission, in the page's order. */
export const ALL_PERMISSIONS: readonly Permission[] = PERMISSION_GROUPS.flatMap((group) => group.permissions.map((p) => p.id))

/**
 * The four roles Spark Flow started with (spec §4.3), seeded with exactly the rights they had when roles were fixed.
 * Their ids stay 'admin', 'sales', 'pm' and 'member'; they can be renamed and changed, but not deleted.
 */
export const BUILT_IN_ROLES: readonly { id: string; name: string; grants: readonly Permission[] }[] = [
  { id: 'admin', name: 'Admin', grants: ALL_PERMISSIONS },
  { id: 'sales', name: 'Sales', grants: ['dashboard.all', 'projects.create', 'projects.editAll', 'projects.postAll'] },
  // A project manager's rights come from managing a project (whoever a project names as manager), not from the role.
  { id: 'pm', name: 'Project manager', grants: ['checkins.managed'] },
  { id: 'member', name: 'Member', grants: ['checkins.managed'] },
]

/** Every permission of every role a person holds; roles that no longer exist give nothing. */
export function grantsOf(roleIds: readonly string[], roles: readonly { id: string; grants: readonly Permission[] }[]): Permission[] {
  const held = new Set(roleIds)
  return ALL_PERMISSIONS.filter((p) => roles.some((role) => held.has(role.id) && role.grants.includes(p)))
}

export type Action =
  | 'rates.view' | 'cost.view' | 'project.create' | 'project.edit' | 'phase.manage' | 'task.manage' | 'task.updateOwnStatus'
  | 'time.logOwn' | 'time.logOn' | 'collab.post' | 'dashboard.view' | 'timeCost.view' | 'database.manage' | 'project.archive' | 'channel.manage'
  | 'channel.restrictPosting' | 'channel.post' | 'channel.inviteByEmail' | 'channel.setDefault' | 'invitation.revoke' | 'file.manage'
  | 'channel.archive' | 'message.edit' | 'message.delete'
  // Slice 1: Settings itself, who's checked in, and other people's time.
  | 'settings.manage' | 'settings.open' | 'checkins.view' | 'time.seeTeam' | 'time.editOthers' | 'dashboard.everyProject'
  // Slice 2.
  | 'audit.view' | 'archive.manage'

export type ProjectRef = Pick<Project, 'managerId' | 'memberIds' | 'teamIds'> & { archivedAt?: string | null }

export type PermissionContext = {
  userId: string
  /** Every permission of every role the person holds (`grantsOf`). */
  grants: readonly Permission[]
  /** The project the action is about, when there is one. */
  project?: ProjectRef
  userTeamIds?: string[]
  /** For channel.manage: the channel's privacy and members; for channel.post, who may post in it. */
  channel?: { isPrivate: boolean; memberIds: string[]; whoCanPost?: 'everyone' | 'admins' }
  taskAssigneeId?: string | null
  /** For invitation.revoke: who sent the invitation. */
  invitedBy?: string
  /** For file.manage: who uploaded the file. */
  uploadedBy?: string
  /** For message.edit and message.delete: who wrote the message or reply. */
  authorId?: string
  /** Whether the person manages at least one project (a member can be named a project's manager). */
  managesAny?: boolean
}

/** Actions that are always about one project: PM rights are per project, so these need it. */
export type ProjectScoped = 'project.edit' | 'phase.manage' | 'task.manage' | 'task.updateOwnStatus' | 'time.logOn' | 'time.seeTeam'

/** Whoever a project names as its manager has PM rights on it. */
const manages = (ctx: PermissionContext) => (ctx.project ? ctx.project.managerId === ctx.userId : false)

const isOn = (ctx: PermissionContext) =>
  !ctx.project ||
  ctx.project.managerId === ctx.userId ||
  ctx.project.memberIds.includes(ctx.userId) ||
  ctx.project.teamIds.some((id) => ctx.userTeamIds?.includes(id))

const has = (ctx: PermissionContext, permission: Permission) => ctx.grants.includes(permission)

/** What changes a project or posts in it: none of it is allowed while the project is archived. */
const FROZEN = new Set<Action>(['project.edit', 'phase.manage', 'task.manage', 'task.updateOwnStatus', 'time.logOn', 'collab.post'])

export function can(action: Exclude<Action, ProjectScoped>, ctx: PermissionContext): boolean
export function can(action: ProjectScoped, ctx: PermissionContext & { project: ProjectRef }): boolean
export function can(action: Action, ctx: PermissionContext): boolean {
  // An archived project is frozen for everyone, whatever their roles, until it's restored (that is 'project.archive').
  if (ctx.project?.archivedAt && FROZEN.has(action)) return false
  switch (action) {
    // A channel's members manage it; so may whoever can manage any channel, but only public ones: a private channel
    // stays its members'.
    case 'channel.manage':
      return Boolean(ctx.channel && (ctx.channel.memberIds.includes(ctx.userId) || (has(ctx, 'channels.manageAll') && !ctx.channel.isPrivate)))
    // Archiving a channel (spec 6.1): only where the person may manage it.
    case 'channel.archive':
      return has(ctx, 'channels.manageAll') && can('channel.manage', ctx)
    // Editing a message is its author's alone (spec §9), whatever their roles.
    case 'message.edit':
      return ctx.authorId === ctx.userId
    case 'message.delete':
      return ctx.authorId === ctx.userId || has(ctx, 'messages.deleteAll')
    case 'file.manage':
      return ctx.uploadedBy === ctx.userId || has(ctx, 'files.manageAll')
    case 'invitation.revoke':
      return ctx.invitedBy === ctx.userId || has(ctx, 'channels.invite')
    case 'channel.inviteByEmail':
      return has(ctx, 'channels.invite')
    case 'channel.restrictPosting':
    case 'channel.setDefault':
      return has(ctx, 'channels.settings')
    // A channel set to Only admins takes new posts only from whoever may choose that.
    case 'channel.post':
      return ctx.channel?.whoCanPost !== 'admins' || has(ctx, 'channels.settings')
    case 'rates.view':
      return has(ctx, 'rates.manage')
    case 'cost.view':
    case 'timeCost.view':
      return has(ctx, 'cost.view')
    case 'database.manage':
      return has(ctx, 'database.manage')
    case 'project.archive':
      return has(ctx, 'projects.archive')
    case 'project.create':
      return has(ctx, 'projects.create')
    case 'project.edit':
      return has(ctx, 'projects.editAll') || manages(ctx)
    case 'phase.manage':
    case 'task.manage':
      return has(ctx, 'projects.runAll') || manages(ctx)
    case 'task.updateOwnStatus':
      return has(ctx, 'projects.runAll') || manages(ctx) || (ctx.taskAssigneeId != null && ctx.taskAssigneeId === ctx.userId)
    case 'time.logOwn':
      return true
    // Logging time on a project: the people on it (manager, members, its teams), or anyone allowed on every project.
    case 'time.logOn':
      return has(ctx, 'time.logAll') || manages(ctx) || (Boolean(ctx.project) && isOn(ctx))
    // Everyone's time on a project: its manager, or whoever may see everyone's.
    case 'time.seeTeam':
      return has(ctx, 'time.othersAll') || manages(ctx)
    case 'time.editOthers':
      return has(ctx, 'time.othersAll')
    case 'collab.post':
      return has(ctx, 'projects.postAll') || manages(ctx) || isOn(ctx)
    // About one project: manages that one. Otherwise: manages any (refused while that isn't known yet).
    case 'dashboard.view':
      return has(ctx, 'dashboard.all') || (ctx.project ? manages(ctx) : (ctx.managesAny ?? false))
    // The dashboard covers every project, not only the ones the person manages.
    case 'dashboard.everyProject':
      return has(ctx, 'dashboard.all')
    case 'checkins.view':
      return has(ctx, 'checkins.all') || has(ctx, 'checkins.managed')
    case 'settings.manage':
      return has(ctx, 'settings.manage')
    // Settings opens for anyone with something to change there.
    case 'settings.open':
      return has(ctx, 'settings.manage') || has(ctx, 'rates.manage') || has(ctx, 'database.manage') || has(ctx, 'audit.view') || has(ctx, 'archive.manage')
    case 'audit.view':
      return has(ctx, 'audit.view')
    case 'archive.manage':
      return has(ctx, 'archive.manage')
  }
}

export type Access = 'loading' | 'allowed' | 'denied'

/** What a gated page shows: nothing is refused until the account has loaded, so an admin never sees a refusal flash. */
export function accessOf(loading: boolean, allowed: boolean): Access {
  return loading ? 'loading' : allowed ? 'allowed' : 'denied'
}
