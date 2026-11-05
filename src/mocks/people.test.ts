import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api, NewPerson } from '@/api/types'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

// Settings → Users (Admin and help, slice 3): people are company-wide records an Admin adds, edits, deactivates and
// reactivates. Deactivated people keep their work, time and messages, leave every picker and can't act.

let db: MockDb
let api: Api
let hub: MockHub
let events: string[]
beforeEach(() => {
  latency.min = latency.max = 0
  hub = createMockHub(`test-people-${Math.random()}`, null)
  events = []
  hub.subscribe((e) => events.push(e.type))
  db = createDb(createMemoryStore(), seed)
  api = createMockApi(db, hub)
})
afterEach(() => hub.close())

const status = (promise: Promise<unknown>) => promise.then(() => 200, (e: { status: number }) => e.status)
const detail = (promise: Promise<unknown>) => promise.then(() => '', (e: { detail?: string }) => e.detail)
const lastEntry = async () => (await db.read()).audit.at(-1)!
const newcomer: NewPerson = { name: '  Laila Hamdy ', email: ' Laila.Hamdy@Spark-Sys.com ', title: 'Data Analyst', roleIds: ['member'], teamIds: ['t-backend'] }

describe('the people directory (slice 3)', () => {
  it('lists everyone, active or not, with when each last did anything; only for whoever may change users', async () => {
    await api.users.viewAs('u-3')
    await expect(api.users.directory()).rejects.toMatchObject({ status: 403, detail: "You don't have access to users." })
    const sent = await api.chat.send('c-general', 'Morning all', 'client-1')
    await api.users.viewAs('u-1')
    const people = await api.users.directory()
    expect(people).toHaveLength(9)
    expect(people.find((p) => p.id === 'u-3')).toMatchObject({ name: 'Mariam Fathy', lastActiveAt: sent.createdAt })
    expect(people.every((p) => p.lastActiveAt === null || !Number.isNaN(Date.parse(p.lastActiveAt)))).toBe(true)
  })

  it('every person’s teams and every team’s people agree in the seed', async () => {
    const data = await db.read()
    for (const team of data.teams) for (const id of team.memberIds) expect(data.users.find((u) => u.id === id)!.teamIds).toContain(team.id)
    for (const user of data.users) for (const id of user.teamIds) expect(data.teams.find((t) => t.id === id)!.memberIds).toContain(user.id)
  })
})

describe('adding and editing people (slice 3)', () => {
  it('adds a person, tidied, on their teams, offline until they sign in; says so to every tab and in the log', async () => {
    const added = await api.users.create(newcomer)
    expect(added).toMatchObject({ name: 'Laila Hamdy', email: 'laila.hamdy@spark-sys.com', title: 'Data Analyst', roleIds: ['member'], teamIds: ['t-backend'], presence: 'offline' })
    expect((await db.read()).teams.find((t) => t.id === 't-backend')!.memberIds).toContain(added.id)
    expect(events).toContain('peopleChanged')
    expect(await lastEntry()).toMatchObject({
      action: 'created', group: 'settings', record: { type: 'user', id: added.id, name: 'Laila Hamdy' },
      changes: expect.arrayContaining([{ field: 'Roles', from: null, to: 'Member' }, { field: 'Teams', from: null, to: 'Backend' }, { field: 'Email', from: null, to: 'laila.hamdy@spark-sys.com' }]),
    })
    // A new person can be tried at once.
    expect((await api.users.viewAs(added.id)).id).toBe(added.id)
  })

  it('refuses a missing name, a bad or taken email, no role, and roles or teams that don’t exist', async () => {
    expect(await detail(api.users.create({ ...newcomer, name: ' ' }))).toBe('Give their name.')
    expect(await detail(api.users.create({ ...newcomer, name: 'x'.repeat(81) }))).toBe('A name has at most 80 characters.')
    expect(await detail(api.users.create({ ...newcomer, email: 'laila' }))).toBe('That isn’t an email address.')
    expect(await detail(api.users.create({ ...newcomer, email: 'MARIAM.FATHY@spark-sys.com' }))).toBe('Mariam Fathy has that email already.')
    expect(await detail(api.users.create({ ...newcomer, title: 'x'.repeat(81) }))).toBe('A title has at most 80 characters.')
    expect(await detail(api.users.create({ ...newcomer, roleIds: [] }))).toBe('Give them at least one role.')
    expect(await detail(api.users.create({ ...newcomer, roleIds: ['role-gone'] }))).toBe("That role doesn't exist.")
    expect(await detail(api.users.create({ ...newcomer, teamIds: ['t-gone'] }))).toBe("That team doesn't exist.")
    expect((await db.read()).users).toHaveLength(9)
  })

  it('only whoever may change users adds or edits people; the refusal is recorded', async () => {
    await api.users.viewAs('u-2')
    expect(await status(api.users.create(newcomer))).toBe(403)
    expect(await status(api.users.update('u-3', { title: 'Lead' }))).toBe(403)
    expect(await lastEntry()).toMatchObject({ action: 'denied', record: { id: 'users.update' } })
  })

  it('an edit changes what it names, keeps teams in step both ways, and logs each field as people read it', async () => {
    const edited = await api.users.update('u-3', { title: 'Senior Frontend Engineer', roleIds: ['member', 'pm'], teamIds: ['t-qa'] })
    // Roles and teams in their own order, however they were picked.
    expect(edited).toMatchObject({ name: 'Mariam Fathy', title: 'Senior Frontend Engineer', roleIds: ['pm', 'member'], teamIds: ['t-qa'] })
    const teams = (await db.read()).teams
    expect(teams.find((t) => t.id === 't-frontend')!.memberIds).not.toContain('u-3')
    expect(teams.find((t) => t.id === 't-qa')!.memberIds).toContain('u-3')
    expect((await lastEntry()).changes).toEqual([
      { field: 'Title', from: 'Frontend Engineer', to: 'Senior Frontend Engineer' },
      { field: 'Roles', from: 'Member', to: 'Project manager, Member' },
      { field: 'Teams', from: 'Frontend', to: 'QA' },
    ])
    // Her new role counts at once.
    await api.users.viewAs('u-3')
    expect((await api.users.me()).grants).toContain('checkins.managed')
  })

  it('her own email is no clash; an edit that changes nothing records and sends nothing', async () => {
    const count = (await db.read()).audit.length
    await api.users.update('u-3', { email: 'MARIAM.FATHY@spark-sys.com' })
    await api.users.update('u-3', { name: 'Mariam Fathy', teamIds: ['t-frontend'], roleIds: ['member'] })
    expect((await db.read()).audit.length).toBe(count)
    expect(events).not.toContain('peopleChanged')
  })

  it('no edit may leave nobody able to change settings, users and roles; a deactivated Admin doesn’t count', async () => {
    expect(await detail(api.users.update('u-1', { roleIds: ['member'] }))).toBe('At least one person must be able to change settings, users and roles.')
    expect((await api.users.me()).roleIds).toEqual(['admin'])
    await api.users.update('u-2', { roleIds: ['admin'] })
    await api.users.deactivate('u-2', '')
    expect(await detail(api.users.update('u-1', { roleIds: ['member'] }))).toBe('At least one person must be able to change settings, users and roles.')
  })
})

describe('deactivating and reactivating (slice 3)', () => {
  it('not yourself; anyone else, with a reason, which the log keeps', async () => {
    expect(await detail(api.users.deactivate('u-1', ''))).toBe("You can't deactivate yourself.")
    expect(await detail(api.users.deactivate('u-3', 'x'.repeat(201)))).toBe('Keep the reason under 200 characters.')
    const off = await api.users.deactivate('u-3', ' Left the company ')
    expect(off.deactivated).toEqual({ at: expect.any(String), by: 'u-1', reason: 'Left the company' })
    expect(await lastEntry()).toMatchObject({
      action: 'deactivated', group: 'settings', record: { type: 'user', id: 'u-3' }, detail: 'Left the company', changes: [{ field: 'Status', from: 'Active', to: 'Deactivated' }],
    })
    expect(events).toContain('peopleChanged')
  })

  it("stops their timer with 'flow'; their time stays", async () => {
    // The seed has Mariam with a timer running on NEX-106.
    const before = await db.read()
    const running = before.timeEntries.find((e) => e.userId === 'u-3' && e.endedAt === null)!
    await api.users.deactivate('u-3', '')
    const data = await db.read()
    expect(data.timeEntries.filter((e) => e.userId === 'u-3' && e.endedAt === null)).toEqual([])
    expect(data.timeEntries.find((e) => e.id === running.id)!.endReason).toBe('flow')
    expect(data.timeEntries.some((e) => e.userId === 'u-3' && e.taskId === 't-nex-106')).toBe(true)
    expect(events).toContain('timeLogged')
    // Offline now, and the server's closing isn't counted as something she did.
    expect(data.users.find((u) => u.id === 'u-3')!.presence).toBe('offline')
    const row = (await api.users.directory()).find((p) => p.id === 'u-3')!
    expect(row.lastActiveAt! < row.deactivated!.at).toBe(true)
  })

  it('they stay in the list, marked, but nobody can switch to them, assign them, or start talking to them', async () => {
    await api.users.deactivate('u-3', '')
    expect((await api.users.list('ws-eng')).find((u) => u.id === 'u-3')?.deactivated).toBeTruthy()
    expect(await detail(api.users.viewAs('u-3'))).toBe('Mariam Fathy is deactivated.')
    expect(await detail(api.tasks.update('NEX-102', { assigneeId: 'u-3' }))).toBe('Mariam Fathy is deactivated.')
    expect(await detail(api.projects.update('p-mob', { memberIds: ['u-3'] }))).toBe('Mariam Fathy is deactivated.')
    expect(await detail(api.chat.addMembers('c-release', ['u-9']))).not.toBe('Mariam Fathy is deactivated.')
    expect(await detail(api.chat.createChannel({ workspaceId: 'ws-eng', name: 'ops', topic: '', isPrivate: false, memberIds: ['u-3'] }))).toBe('Mariam Fathy is deactivated.')
    expect(await detail(api.chat.openDm('ws-eng', ['u-3', 'u-2']))).toBe('Mariam Fathy is deactivated.')
    // The conversation she was already in still opens, to read; search no longer offers her.
    expect((await api.chat.openDm('ws-eng', ['u-3'])).memberIds.sort()).toEqual(['u-1', 'u-3'])
    const found = await api.search.run('ws-eng', { q: 'Mariam', tab: 'people', sort: 'relevant', from: [], in: null, has: null, thread: false, after: null, before: null, tz: 'Africa/Cairo' })
    expect(found.items).toEqual([])
    // What she already had stays hers: her tasks, her projects, other edits to them.
    expect(await status(api.tasks.update('NEX-105', { priority: 'urgent' }))).toBe(200)
    expect(await status(api.projects.update('p-nex', { clientName: 'Nexus Ltd' }))).toBe(200)
  })

  it('a tab still acting as them is signed out of everything but switching person', async () => {
    await api.users.deactivate('u-3', '')
    db.actAs('u-3')
    await expect(api.users.me()).rejects.toMatchObject({ status: 401, detail: 'This account was deactivated.' })
    for (const call of [
      () => api.chat.send('c-general', 'Still here?', 'client-2'),
      () => api.chat.channels('ws-eng'),
      () => api.chat.markRead('c-general'),
      () => api.chat.setMuted('c-general', true),
      () => api.chat.setStarred('c-general', true),
      () => api.tickets.get('NEX-106'),
    ])
      await expect(call()).rejects.toMatchObject({ status: 401 })
    expect((await api.users.list('ws-eng')).length).toBe(9)
    expect((await api.users.viewAs('u-1')).id).toBe('u-1')
    expect((await api.users.me()).id).toBe('u-1')
  })

  it('deactivating someone already off changes nothing; reactivating brings them back, logged', async () => {
    await api.users.deactivate('u-3', 'Leave')
    const count = (await db.read()).audit.length
    events.length = 0
    expect((await api.users.deactivate('u-3', 'Again')).deactivated?.reason).toBe('Leave')
    expect((await db.read()).audit.length).toBe(count)
    expect(events).toEqual([])
    const back = await api.users.reactivate('u-3')
    expect(back.deactivated ?? null).toBeNull()
    expect(await lastEntry()).toMatchObject({ action: 'reactivated', group: 'settings', record: { id: 'u-3' }, changes: [{ field: 'Status', from: 'Deactivated', to: 'Active' }] })
    expect((await api.users.viewAs('u-3')).id).toBe('u-3')
    await api.users.viewAs('u-1')
    expect(await status(api.users.reactivate('u-gone'))).toBe(404)
  })
})
