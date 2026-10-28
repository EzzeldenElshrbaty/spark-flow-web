import { describe, expect, it } from 'vitest'
import type { Role } from '@/api/types'
import { accessOf, can, type Action, type PermissionContext, type ProjectRef, type ProjectScoped } from './permissions'

const project = { managerId: 'u-pm', memberIds: ['u-pm', 'u-m'], teamIds: ['t-qa'] }
const other = { managerId: 'u-x', memberIds: ['u-x'], teamIds: [] }
// For loops over mixed actions: every call passes a project, so any action is allowed to type-check.
const canWith = (action: Action, ctx: PermissionContext & { project: ProjectRef }) => can(action as ProjectScoped, ctx)
const as = <E extends Partial<PermissionContext> = {}>(role: Role, userId = `u-${role}`, extra: E = {} as E): PermissionContext & E => ({ role, userId, ...extra })

describe('can (spec §4.3)', () => {
  it('admin can do everything', () => {
    const all: Action[] = ['rates.view', 'cost.view', 'project.create', 'project.edit', 'phase.manage', 'task.manage', 'task.updateOwnStatus', 'time.logOwn', 'collab.post', 'dashboard.view', 'timeCost.view', 'database.manage']
    for (const action of all) expect(canWith(action, { ...as('admin', 'u-a'), project: other }), action).toBe(true)
  })

  it('nothing on an archived project can be changed, even by Admins', () => {
    const archived = { ...project, archivedAt: '2026-10-01T00:00:00.000Z' }
    for (const action of ['project.edit', 'phase.manage', 'task.manage', 'task.updateOwnStatus', 'time.logOn', 'collab.post'] as const)
      for (const who of [as('admin', 'u-a'), as('pm', 'u-pm')]) expect(canWith(action, { ...who, project: archived, taskAssigneeId: 'u-pm' }), `${who.role} ${action}`).toBe(false)
    expect(can('project.archive', as('admin', 'u-a'))).toBe(true)
  })

  it('project.archive is Admin only', () => {
    expect(can('project.archive', as('admin', 'u-a'))).toBe(true)
    for (const role of ['sales', 'pm', 'member'] as const) expect(can('project.archive', as(role, 'u-pm')), role).toBe(false)
  })

  it('only admin sees rates, cost, the Time & cost page and the database', () => {
    for (const role of ['sales', 'pm', 'member'] as const)
      for (const action of ['rates.view', 'cost.view', 'timeCost.view', 'database.manage'] as const)
        expect(canWith(action, { ...as(role, 'u-pm'), project }), `${role} ${action}`).toBe(false)
  })

  it('sales creates and edits projects but does not manage phases or tasks', () => {
    expect(can('project.create', as('sales'))).toBe(true)
    expect(can('project.edit', as('sales', 'u-s', { project: other }))).toBe(true)
    expect(can('phase.manage', as('sales', 'u-s', { project: other }))).toBe(false)
    expect(can('task.manage', as('sales', 'u-s', { project: other }))).toBe(false)
    expect(can('dashboard.view', as('sales'))).toBe(true)
  })

  it('a PM manages phases, tasks and edits only projects they manage', () => {
    expect(can('project.create', as('pm', 'u-pm'))).toBe(false)
    for (const action of ['project.edit', 'phase.manage', 'task.manage', 'dashboard.view'] as const) {
      expect(canWith(action, { ...as('pm', 'u-pm'), project }), `${action} own`).toBe(true)
      expect(canWith(action, { ...as('pm', 'u-pm'), project: other }), `${action} other`).toBe(false)
    }
  })

  it('whoever a project names as manager gets PM rights on it, even with the member role', () => {
    expect(can('task.manage', as('member', 'u-pm', { project }))).toBe(true)
  })

  it('a member updates the status of their own task only', () => {
    expect(can('task.updateOwnStatus', as('member', 'u-m', { project, taskAssigneeId: 'u-m' }))).toBe(true)
    expect(can('task.updateOwnStatus', as('member', 'u-m', { project, taskAssigneeId: 'u-x' }))).toBe(false)
    expect(can('task.manage', as('member', 'u-m', { project }))).toBe(false)
  })

  it('a member posts on projects they are on (directly or through a team), and in general chat', () => {
    expect(can('collab.post', as('member', 'u-m', { project }))).toBe(true)
    expect(can('collab.post', as('member', 'u-q', { project, userTeamIds: ['t-qa'] }))).toBe(true)
    expect(can('collab.post', as('member', 'u-m', { project: other }))).toBe(false)
    expect(can('collab.post', as('member', 'u-m'))).toBe(true)
  })

  it('everyone logs their own time', () => {
    for (const role of ['admin', 'sales', 'pm', 'member'] as const) expect(can('time.logOwn', as(role))).toBe(true)
  })

  it('project-scoped actions require a project (type-level)', () => {
    const withoutProject: PermissionContext = { userId: 'u-pm', role: 'pm' }
    // @ts-expect-error a PM's rights are per project: without one, task.manage must not compile
    expect(can('task.manage', withoutProject)).toBe(false) // and at run time it is refused
    expect(can('task.manage', as('pm', 'u-pm', { project }))).toBe(true)
  })

  it('a member who manages a project can view the dashboard', () => {
    expect(can('dashboard.view', as('member', 'u-7', { managesAny: true }))).toBe(true)
    expect(can('dashboard.view', as('member', 'u-7', { managesAny: false }))).toBe(false)
    expect(can('dashboard.view', as('pm', 'u-pm', { managesAny: false }))).toBe(false)
  })

  it('member cannot open database or the dashboard', () => {
    expect(can('database.manage', as('member'))).toBe(false)
    expect(can('dashboard.view', as('member'))).toBe(false)
  })
})

describe('accessOf', () => {
  it('waits while the account loads instead of refusing', () => {
    expect(accessOf(true, false)).toBe('loading') // the placeholder persona is a member: never show its refusal
    expect(accessOf(false, true)).toBe('allowed')
    expect(accessOf(false, false)).toBe('denied')
  })
})

describe('time.logOn', () => {
  const project = { managerId: 'pm', memberIds: ['m'], teamIds: ['t1'] }
  it('time.logOn needs the project: admin, manager, member or team, not anyone else', () => {
    expect(can('time.logOn', { userId: 'a', role: 'admin', project })).toBe(true)
    expect(can('time.logOn', { userId: 'pm', role: 'pm', project })).toBe(true)
    expect(can('time.logOn', { userId: 'm', role: 'member', project })).toBe(true)
    expect(can('time.logOn', { userId: 'x', role: 'member', project, userTeamIds: ['t1'] })).toBe(true)
    expect(can('time.logOn', { userId: 's', role: 'sales', project })).toBe(false)
    expect(can('time.logOn', { userId: 'o', role: 'member', project })).toBe(false)
    expect(can('time.logOn', { userId: 'p2', role: 'pm', project })).toBe(false)
  })
})

describe('channel.manage', () => {
  it('members, or Admins on public channels', () => {
    const pub = { isPrivate: false, memberIds: ['u-m'] }
    const priv = { isPrivate: true, memberIds: ['u-m'] }
    expect(can('channel.manage', { ...as('member', 'u-m'), channel: priv })).toBe(true)
    expect(can('channel.manage', { ...as('member', 'u-x'), channel: pub })).toBe(false)
    expect(can('channel.manage', { ...as('admin', 'u-a'), channel: pub })).toBe(true)
    expect(can('channel.manage', { ...as('admin', 'u-a'), channel: priv })).toBe(false)
  })
})


describe('who can post in a channel (spec §9, 6.10 Settings)', () => {
  it('only Admins choose it; at Only admins only they post, at Everyone everyone who may', () => {
    const open = { isPrivate: false, memberIds: ['u-m'], whoCanPost: 'everyone' as const }
    const closed = { ...open, whoCanPost: 'admins' as const }
    expect(can('channel.restrictPosting', { ...as('admin'), channel: open })).toBe(true)
    for (const role of ['pm', 'sales', 'member'] as const) expect(can('channel.restrictPosting', { ...as(role), channel: open })).toBe(false)
    expect(can('channel.post', { ...as('member', 'u-m'), channel: open })).toBe(true)
    expect(can('channel.post', { ...as('member', 'u-m'), channel: closed })).toBe(false)
    expect(can('channel.post', { ...as('pm'), channel: closed })).toBe(false)
    expect(can('channel.post', { ...as('admin'), channel: closed })).toBe(true)
  })
})

describe('email invites and default channels (spec 6.10, slice 5)', () => {
  it('only Admins invite by email and choose default channels', () => {
    const channel = { isPrivate: false, memberIds: ['u-m'] }
    for (const action of ['channel.inviteByEmail', 'channel.setDefault'] as const) {
      expect(can(action, { ...as('admin'), channel })).toBe(true)
      for (const role of ['pm', 'sales', 'member'] as const) expect(can(action, { ...as(role, 'u-m'), channel }), `${action} ${role}`).toBe(false)
    }
  })

  it('whoever sent an invitation, or an Admin, revokes it', () => {
    expect(can('invitation.revoke', { ...as('member', 'u-m'), invitedBy: 'u-m' })).toBe(true)
    expect(can('invitation.revoke', { ...as('pm', 'u-p'), invitedBy: 'u-m' })).toBe(false)
    expect(can('invitation.revoke', { ...as('admin', 'u-a'), invitedBy: 'u-m' })).toBe(true)
  })
})

describe('a file (spec §9: delete file is uploader or admin)', () => {
  it('whoever uploaded it, or an Admin, changes or deletes it', () => {
    expect(can('file.manage', { ...as('member', 'u-m'), uploadedBy: 'u-m' })).toBe(true)
    expect(can('file.manage', { ...as('pm', 'u-p'), uploadedBy: 'u-m' })).toBe(false)
    expect(can('file.manage', { ...as('admin', 'u-a'), uploadedBy: 'u-m' })).toBe(true)
  })
})
