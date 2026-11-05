import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
import { ALL_PERMISSIONS } from '@/lib/permissions'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

let db: MockDb
let api: Api
let hub: MockHub
let events: string[]
beforeEach(() => {
  latency.min = latency.max = 0
  hub = createMockHub(`test-roles-${Math.random()}`, null)
  events = []
  hub.subscribe((e) => events.push(e.type))
  db = createDb(createMemoryStore(), seed)
  api = createMockApi(db, hub)
})
afterEach(() => hub.close())

const status = (promise: Promise<unknown>) => promise.then(() => 200, (e: { status: number }) => e.status)
const detail = (promise: Promise<unknown>) => promise.then(() => '', (e: { detail?: string }) => e.detail)

describe('roles (slice 1, spec §4.3)', () => {
  it('lists the four built-in roles with what each may do and how many hold it', async () => {
    const roles = await api.roles.list()
    expect(roles.map((r) => [r.id, r.name, r.builtIn, r.holders])).toEqual([
      ['admin', 'Admin', true, 1],
      ['sales', 'Sales', true, 1],
      ['pm', 'Project manager', true, 2],
      ['member', 'Member', true, 5],
    ])
    expect(roles[0].grants).toEqual([...ALL_PERMISSIONS])
  })

  it('me carries every permission of every role I hold', async () => {
    expect((await api.users.me()).grants).toEqual([...ALL_PERMISSIONS])
    db.actAs('u-9') // Sales
    expect((await api.users.me()).grants).toEqual(['dashboard.all', 'projects.create', 'projects.editAll', 'projects.postAll'])
    await db.update((d) => {
      d.users.find((u) => u.id === 'u-9')!.roleIds = ['sales', 'pm']
    })
    expect((await api.users.me()).grants).toContain('checkins.managed')
  })

  it('adds a role, empty or copied from another; names are unique and at most 40 characters', async () => {
    const empty = await api.roles.create({ name: '  QA lead ' })
    expect(empty).toMatchObject({ name: 'QA lead', builtIn: false, grants: [], holders: 0 })
    const copy = await api.roles.create({ name: 'Sales lead', copyFrom: 'sales' })
    expect(copy.grants).toEqual(['dashboard.all', 'projects.create', 'projects.editAll', 'projects.postAll'])
    expect(await detail(api.roles.create({ name: 'qa LEAD' }))).toBe("There's a role called qa LEAD already.")
    expect(await status(api.roles.create({ name: 'x'.repeat(41) }))).toBe(400)
    expect(await status(api.roles.create({ name: ' ' }))).toBe(400)
    expect(await status(api.roles.create({ name: 'Ghost copy', copyFrom: 'role-gone' }))).toBe(404)
    expect(events.filter((e) => e === 'rolesChanged')).toHaveLength(2)
  })

  it('renames any role, built-in ones too', async () => {
    expect((await api.roles.rename('pm', 'Delivery manager')).name).toBe('Delivery manager')
    expect(await status(api.roles.rename('pm', 'Admin'))).toBe(400)
  })

  it('deletes only a role nobody holds, and never a built-in one', async () => {
    const role = await api.roles.create({ name: 'Temp' })
    await db.update((d) => {
      d.users.find((u) => u.id === 'u-3')!.roleIds.push(role.id)
    })
    expect(await detail(api.roles.remove(role.id))).toBe('1 person holds Temp. Give them another role first.')
    await db.update((d) => {
      d.users.find((u) => u.id === 'u-3')!.roleIds = ['member']
    })
    await api.roles.remove(role.id)
    expect((await api.roles.list()).some((r) => r.id === role.id)).toBe(false)
    expect(await detail(api.roles.remove('member'))).toBe("Member is built in, so it can't be deleted.")
  })

  it('saves every changed role at once, each change applied to the role as it is now; bad input keeps nothing', async () => {
    const roles = await api.roles.saveGrants([
      { roleId: 'member', add: ['projects.create'], remove: [] },
      { roleId: 'sales', add: [], remove: ['projects.create', 'projects.editAll', 'projects.postAll'] },
    ])
    expect(roles.find((r) => r.id === 'member')!.grants).toEqual(['checkins.managed', 'projects.create'])
    expect(roles.find((r) => r.id === 'sales')!.grants).toEqual(['dashboard.all'])
    // Another Admin's change in between (time.logAll) stays when mine only touched projects.create.
    await api.roles.saveGrants([{ roleId: 'member', add: ['time.logAll'], remove: [] }])
    expect((await api.roles.saveGrants([{ roleId: 'member', add: [], remove: ['projects.create'] }])).find((r) => r.id === 'member')!.grants).toEqual(['checkins.managed', 'time.logAll'])
    expect(await status(api.roles.saveGrants([{ roleId: 'member', add: [], remove: ['time.logAll'] }, { roleId: 'pm', add: ['fly' as never], remove: [] }]))).toBe(400)
    expect((await api.roles.list()).find((r) => r.id === 'member')!.grants).toEqual(['checkins.managed', 'time.logAll'])
    expect(await status(api.roles.saveGrants([{ roleId: 'role-gone', add: [], remove: [] }]))).toBe(404)
  })

  it('saving nothing changes nothing and tells nobody', async () => {
    events = []
    expect((await api.roles.saveGrants([])).length).toBe(4)
    expect(events).toEqual([])
  })

  it('no change may leave nobody able to change settings, users and roles', async () => {
    const takeAway = [{ roleId: 'admin', add: [], remove: ['settings.manage' as const] }]
    expect(await detail(api.roles.saveGrants(takeAway))).toBe('At least one person must be able to change settings, users and roles.')
    // Someone else holding it is enough.
    await api.roles.saveGrants([{ roleId: 'sales', add: ['settings.manage'], remove: [] }])
    await api.roles.saveGrants(takeAway)
    expect((await api.roles.list()).find((r) => r.id === 'admin')!.grants).not.toContain('settings.manage')
  })

  it('changing roles needs settings.manage: Sales gets 403, and the rights follow the roles at once', async () => {
    db.actAs('u-9')
    // Each call starts only when awaited: started together, the later 403s reject before anything listens.
    for (const call of [() => api.roles.create({ name: 'X' }), () => api.roles.rename('pm', 'Y'), () => api.roles.remove('pm'), () => api.roles.saveGrants([])])
      expect(await status(call())).toBe(403)
    expect((await api.roles.list()).length).toBe(4)
    expect(await status(api.rates.list())).toBe(403)
    db.actAs('u-1')
    await api.roles.saveGrants([{ roleId: 'sales', add: ['rates.manage'], remove: [] }])
    db.actAs('u-9')
    expect(await status(api.rates.list())).toBe(200)
  })
})
