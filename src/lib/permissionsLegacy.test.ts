import { describe, expect, it } from 'vitest'
import { BUILT_IN_ROLES, can, type Action, type PermissionContext, type ProjectScoped } from './permissions'

// Slice 1 (roles become records): on the day roles turn editable, nobody's rights may change. This keeps the table as
// it was before (four fixed roles, spec §4.3, commit 9bd2fdc) and checks the new grants-based can() gives the same
// answer for every action, built-in role and kind of case.

type LegacyRole = 'admin' | 'sales' | 'pm' | 'member'
type LegacyContext = Omit<PermissionContext, 'grants'> & { role: LegacyRole }
type Ref = NonNullable<PermissionContext['project']>

const FROZEN = new Set<string>(['project.edit', 'phase.manage', 'task.manage', 'task.updateOwnStatus', 'time.logOn', 'collab.post'])
const manages = (ctx: LegacyContext) => (ctx.project ? ctx.project.managerId === ctx.userId : false)
const isOn = (ctx: LegacyContext) =>
  !ctx.project ||
  ctx.project.managerId === ctx.userId ||
  ctx.project.memberIds.includes(ctx.userId) ||
  ctx.project.teamIds.some((id) => ctx.userTeamIds?.includes(id))

/** The rule table as it was, word for word but for its types. */
function legacyCan(action: Action, ctx: LegacyContext): boolean {
  if (ctx.project?.archivedAt && FROZEN.has(action)) return false
  if (action === 'channel.manage') return Boolean(ctx.channel && (ctx.channel.memberIds.includes(ctx.userId) || (ctx.role === 'admin' && !ctx.channel.isPrivate)))
  if (action === 'channel.archive') return ctx.role === 'admin' && legacyCan('channel.manage', ctx)
  if (action === 'message.edit') return ctx.authorId === ctx.userId
  if (ctx.role === 'admin') return true
  switch (action) {
    case 'rates.view':
    case 'cost.view':
    case 'timeCost.view':
    case 'database.manage':
    case 'project.archive':
    case 'channel.restrictPosting':
    case 'channel.inviteByEmail':
    case 'channel.setDefault':
      return false
    case 'invitation.revoke':
      return ctx.invitedBy === ctx.userId
    case 'file.manage':
      return ctx.uploadedBy === ctx.userId
    case 'message.delete':
      return ctx.authorId === ctx.userId
    case 'channel.post':
      return ctx.channel?.whoCanPost !== 'admins'
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
    case 'time.logOn':
      return manages(ctx) || (Boolean(ctx.project) && isOn(ctx))
    case 'collab.post':
      return ctx.role === 'sales' || manages(ctx) || isOn(ctx)
    case 'dashboard.view':
      return ctx.role === 'sales' || (ctx.project ? manages(ctx) : (ctx.managesAny ?? ctx.role === 'pm'))
  }
  return false
}

const LEGACY_ACTIONS: Action[] = [
  'rates.view', 'cost.view', 'project.create', 'project.edit', 'phase.manage', 'task.manage', 'task.updateOwnStatus', 'time.logOwn',
  'time.logOn', 'collab.post', 'dashboard.view', 'timeCost.view', 'database.manage', 'project.archive', 'channel.manage',
  'channel.restrictPosting', 'channel.post', 'channel.inviteByEmail', 'channel.setDefault', 'invitation.revoke', 'file.manage',
  'channel.archive', 'message.edit', 'message.delete',
]

const me = 'u-me'
const base: Ref[] = [
  { managerId: me, memberIds: [], teamIds: [] },
  { managerId: 'u-x', memberIds: [me], teamIds: [] },
  { managerId: 'u-x', memberIds: [], teamIds: ['t-1'] },
  { managerId: 'u-x', memberIds: ['u-x'], teamIds: [] },
]
const projects: (Ref | undefined)[] = [undefined, ...base, ...base.map((p) => ({ ...p, archivedAt: '2026-10-01T00:00:00.000Z' }))]
const channels: PermissionContext['channel'][] = [undefined]
for (const isPrivate of [false, true])
  for (const memberIds of [[me], ['u-x']])
    for (const whoCanPost of ['everyone', 'admins'] as const) channels.push({ isPrivate, memberIds, whoCanPost })

describe('grants-based can() gives the old table’s answers for the built-in roles (slice 1)', () => {
  it('every action, role and case', () => {
    const differ: string[] = []
    let cases = 0
    for (const role of BUILT_IN_ROLES)
      for (const project of projects)
        for (const channel of channels)
          for (const taskAssigneeId of [null, me, 'u-x'])
            for (const owner of [me, 'u-x'])
              for (const managesAny of [true, false])
                for (const action of LEGACY_ACTIONS) {
                  const shared = { userId: me, project, channel, taskAssigneeId, invitedBy: owner, uploadedBy: owner, authorId: owner, managesAny, userTeamIds: ['t-1'] }
                  const before = legacyCan(action, { ...shared, role: role.id as LegacyRole })
                  const after = can(action as Exclude<Action, ProjectScoped>, { ...shared, grants: role.grants })
                  cases++
                  if (before !== after) differ.push(`${role.id} ${action} ${JSON.stringify(shared)}: was ${before}, now ${after}`)
                }
    expect(cases).toBe(93_312)
    expect(differ.slice(0, 5)).toEqual([])
  })

  it('the one change: while it isn’t known yet whether someone manages a project, the PM role no longer stands in', () => {
    const pm = BUILT_IN_ROLES.find((r) => r.id === 'pm')!
    expect(legacyCan('dashboard.view', { userId: me, role: 'pm' })).toBe(true)
    expect(can('dashboard.view', { userId: me, grants: pm.grants })).toBe(false)
  })
})
