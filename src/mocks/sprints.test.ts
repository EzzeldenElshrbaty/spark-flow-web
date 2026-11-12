import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api, Sprint } from '@/api/types'
import type { RealtimeEvent } from '@/lib/realtime'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

// Sprints (spec 2026-11-11 §4–§5). The seed: Nexus Core (p-nex, agile) runs Sprint 14 (s-nex-1, active: NEX-101…107,
// two of them done, 23 points) with Sprint 15 (s-nex-2, planned: NEX-110) after it; Nour (u-2) manages it, Mariam (u-3)
// is on it, Youssef (u-1) is Admin. Mobile App (p-mob) is waterfall, managed by Ahmed (u-4).

let db: MockDb
let api: Api
let hub: MockHub
let events: RealtimeEvent[]
const now = new Date('2026-11-11T10:00:00Z')

beforeEach(() => {
  latency.min = latency.max = 0
  hub = createMockHub(`test-sprints-${Math.random()}`, null)
  db = createDb(createMemoryStore(), seed, () => now)
  api = createMockApi(db, hub, () => now)
  events = []
  hub.subscribe((e) => events.push(e))
})
afterEach(() => hub.close())

const DENIED = { status: 403, detail: 'Only an Admin or the project’s manager can change sprints.' }
const asNour = () => api.users.viewAs('u-2')
const sprintOf = async (key: string) => (await db.read()).tickets.find((t) => t.key === key)!.sprintId
const historyOf = async () => (await db.read()).activity
const cards = async () => (await db.read()).messages.filter((m) => m.sprintEvent)
/** Local midnight of a day, or (`end`) its last millisecond: the days the sheets pick. */
const day = (y: number, m: number, d: number, end = false) => (end ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d)).toISOString()
/** Local midnight `plus` days after the day of `iso`, or (`end`) that day's last millisecond. */
const dayAfter = (iso: string, plus: number, end = false) => {
  const d = new Date(iso)
  d.setDate(d.getDate() + plus)
  if (end) d.setHours(23, 59, 59, 999)
  else d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

describe('sprints.list', () => {
  it('lists active, then planned by start, then closed newest first', async () => {
    await db.update((data) => {
      const s = (id: string, name: string, state: Sprint['state'], startDate: string, endDate: string): Sprint => ({ id, projectId: 'p-nex', name, goal: '', state, startDate, endDate })
      data.sprints.unshift(
        s('s-nex-12', 'Sprint 12', 'closed', '2026-09-30T00:00:00.000Z', '2026-10-13T00:00:00.000Z'),
        s('s-nex-16', 'Sprint 16', 'planned', '2026-12-10T00:00:00.000Z', '2026-12-23T00:00:00.000Z'),
        s('s-nex-13', 'Sprint 13', 'closed', '2026-10-14T00:00:00.000Z', '2026-10-27T00:00:00.000Z'),
      )
    })
    expect((await api.sprints.list('p-nex')).map((s) => s.name)).toEqual(['Sprint 14', 'Sprint 15', 'Sprint 16', 'Sprint 13', 'Sprint 12'])
    expect((await api.sprints.list('p-mob'))).toEqual([])
    await expect(api.sprints.list('nope')).rejects.toMatchObject({ status: 404 })
  })
})

describe('sprints.create', () => {
  it('creates Sprint 16, planned, two weeks from the day after Sprint 15 ends', async () => {
    await asNour()
    const sprint15 = (await api.sprints.list('p-nex')).find((s) => s.id === 's-nex-2')!
    const created = await api.sprints.create({ projectId: 'p-nex' })
    expect(created).toMatchObject({
      projectId: 'p-nex', name: 'Sprint 16', goal: '', state: 'planned',
      startDate: dayAfter(sprint15.endDate, 1), endDate: dayAfter(sprint15.endDate, 14, true),
    })
    expect((await api.sprints.list('p-nex')).map((s) => s.name)).toEqual(['Sprint 14', 'Sprint 15', 'Sprint 16'])
    expect((await historyOf()).at(-1)).toMatchObject({ projectId: 'p-nex', taskKey: null, kind: 'sprint.added', subject: 'Sprint 16', actorId: 'u-2' })
    expect(events).toContainEqual({ type: 'projectChanged', projectId: 'p-nex' })
    // What the sheet confirmed, trimmed.
    const named = await api.sprints.create({ projectId: 'p-nex', name: '  Hardening  ', goal: ' Fix the flaky tests. ', startDate: day(2026, 12, 20), endDate: day(2026, 12, 31, true) })
    expect(named).toMatchObject({ name: 'Hardening', goal: 'Fix the flaky tests.', startDate: day(2026, 12, 20), endDate: day(2026, 12, 31, true) })
  })

  it('refuses a member: 403 "Only an Admin or the project’s manager can change sprints."', async () => {
    await api.users.viewAs('u-3')
    await expect(api.sprints.create({ projectId: 'p-nex' })).rejects.toMatchObject(DENIED)
    await expect(api.sprints.update('s-nex-2', { goal: 'Mine' })).rejects.toMatchObject(DENIED)
    await expect(api.sprints.complete('s-nex-1', { moveTo: null })).rejects.toMatchObject(DENIED)
    await expect(api.sprints.remove('s-nex-2')).rejects.toMatchObject(DENIED)
    expect((await db.read()).sprints.filter((s) => s.projectId === 'p-nex').map((s) => `${s.name} ${s.state} ${s.goal.slice(0, 6)}`)).toEqual(['Sprint 14 active Rotate', 'Sprint 15 planned Audit '])
  })

  it('refuses a waterfall project: 400 "Sprints are for agile projects."', async () => {
    await api.users.viewAs('u-4') // Ahmed manages Mobile App
    await expect(api.sprints.create({ projectId: 'p-mob' })).rejects.toMatchObject({ status: 400, detail: 'Sprints are for agile projects.' })
  })

  it('refuses an archived project', async () => {
    await api.projects.archive('p-nex')
    await expect(api.sprints.create({ projectId: 'p-nex' })).rejects.toMatchObject({ status: 400, detail: 'This project is archived. Restore it first.' })
    await expect(api.sprints.update('s-nex-2', { goal: 'x' })).rejects.toMatchObject({ status: 400, detail: 'This project is archived. Restore it first.' })
  })

  it('refuses a blank name, a 61-character name, a 501-character goal, an end before its start', async () => {
    await asNour()
    const create = (over: object) => api.sprints.create({ projectId: 'p-nex', ...over })
    await expect(create({ name: '   ' })).rejects.toMatchObject({ status: 400, detail: 'Give the sprint a name.' })
    await expect(create({ name: 'x'.repeat(61) })).rejects.toMatchObject({ status: 400, detail: 'Keep the name under 60 characters.' })
    await expect(create({ goal: 'x'.repeat(501) })).rejects.toMatchObject({ status: 400, detail: 'Keep the goal under 500 characters.' })
    await expect(create({ startDate: day(2026, 12, 20), endDate: day(2026, 12, 19, true) })).rejects.toMatchObject({ status: 400, detail: 'The end date must be after the start date.' })
    expect((await db.read()).sprints.filter((s) => s.projectId === 'p-nex')).toHaveLength(2)
  })
})

describe('sprints.update', () => {
  it('edits a planned and an active sprint; refuses a closed one: "A closed sprint can’t be changed."', async () => {
    await asNour()
    expect(await api.sprints.update('s-nex-2', { name: ' Sprint 15b ', goal: 'Ship it.' })).toMatchObject({ id: 's-nex-2', name: 'Sprint 15b', goal: 'Ship it.', state: 'planned' })
    expect((await historyOf()).at(-1)).toMatchObject({ kind: 'sprint.changed', subject: 'Sprint 15b' })
    const end = day(2026, 11, 20, true)
    expect(await api.sprints.update('s-nex-1', { endDate: end })).toMatchObject({ id: 's-nex-1', endDate: end, state: 'active' })
    await expect(api.sprints.update('s-nex-2', { state: 'closed' } as never)).rejects.toMatchObject({ status: 400, detail: 'Some of these fields can’t be changed.' })
    await expect(api.sprints.update('s-nex-2', { name: '' })).rejects.toMatchObject({ status: 400, detail: 'Give the sprint a name.' })
    await expect(api.sprints.update('nope', {})).rejects.toMatchObject({ status: 404 })
    await api.sprints.complete('s-nex-1', { moveTo: null })
    await expect(api.sprints.update('s-nex-1', { goal: 'Too late' })).rejects.toMatchObject({ status: 400, detail: 'A closed sprint can’t be changed.' })
  })
})

describe('sprints.start', () => {
  const form = (name: string) => ({ name, goal: 'Ship the audit log.', startDate: day(2026, 11, 19), endDate: day(2026, 12, 2, true) })

  it('refuses while Sprint 14 runs: 409 "Sprint 14 is still running. Complete it before you start another."', async () => {
    await asNour()
    await expect(api.sprints.start('s-nex-2', form('Sprint 15'))).rejects.toMatchObject({ status: 409, detail: 'Sprint 14 is still running. Complete it before you start another.' })
    expect((await db.read()).sprints.find((s) => s.id === 's-nex-2')!.state).toBe('planned')
  })

  it('refuses an empty sprint: "Add a task to Sprint 16 before you start it." (an archived task doesn’t count)', async () => {
    await asNour()
    await api.sprints.complete('s-nex-1', { moveTo: null })
    const sprint16 = await api.sprints.create({ projectId: 'p-nex' })
    const task = await api.tasks.create({ projectId: 'p-nex', title: 'Old spike', descriptionBody: [], status: '', priority: 'low', storyPoints: 2, assigneeId: null, sprintId: sprint16.id })
    await api.tasks.archive(task.key)
    await expect(api.sprints.start(sprint16.id, form('Sprint 16'))).rejects.toMatchObject({ status: 400, detail: 'Add a task to Sprint 16 before you start it.' })
  })

  it('refuses a sprint that isn’t planned: "Only a planned sprint can be started."', async () => {
    await asNour()
    await expect(api.sprints.start('s-nex-1', form('Sprint 14'))).rejects.toMatchObject({ status: 400, detail: 'Only a planned sprint can be started.' })
    await api.sprints.complete('s-nex-1', { moveTo: null })
    await expect(api.sprints.start('s-nex-1', form('Sprint 14'))).rejects.toMatchObject({ status: 400, detail: 'Only a planned sprint can be started.' })
  })

  it('starts with the confirmed name, dates and goal; posts a started card with tasks and points; logs sprint.started; audits status', async () => {
    await asNour()
    // Sprint 15 then holds NEX-101, 102, 105, 106, 107 and NEX-110: 6 tasks, 24 points; NEX-102 (3) is archived.
    await api.sprints.complete('s-nex-1', { moveTo: 's-nex-2' })
    await api.tasks.archive('NEX-102')
    events = []
    const started = await api.sprints.start('s-nex-2', { ...form('  Sprint 15: audit  '), goal: '  Ship the audit log.  ' })
    expect(started).toEqual({ id: 's-nex-2', projectId: 'p-nex', name: 'Sprint 15: audit', goal: 'Ship the audit log.', startDate: day(2026, 11, 19), endDate: day(2026, 12, 2, true), state: 'active' })
    const card = (await cards()).at(-1)!
    expect(card).toMatchObject({
      channelId: 'c-p-nex', senderId: 'u-2', content: 'Started Sprint 15: audit: Ship the audit log.', mentions: [],
      sprintEvent: { kind: 'started', projectKey: 'NEX', sprintId: 's-nex-2', name: 'Sprint 15: audit', goal: 'Ship the audit log.', endDate: day(2026, 12, 2, true), tasks: 5, points: 21 },
    })
    expect((await historyOf()).at(-1)).toMatchObject({ projectId: 'p-nex', taskKey: null, kind: 'sprint.started', subject: 'Sprint 15: audit' })
    expect((await db.read()).audit.at(-1)).toMatchObject({ action: 'changed', group: 'status', record: { type: 'sprint', id: 's-nex-2', name: 'Sprint 15: audit · Nexus Core' }, detail: 'Started · ends 2 Dec' })
    expect(events).toContainEqual({ type: 'projectChanged', projectId: 'p-nex' })
    expect(events).toContainEqual({ type: 'messageReceived', message: expect.objectContaining({ id: card.id }) })
    // Without a goal, the card says only that it started.
    await api.sprints.complete('s-nex-2', { moveTo: 'new' })
    const next = (await db.read()).sprints.find((s) => s.projectId === 'p-nex' && s.state === 'planned')!
    await api.sprints.start(next.id, { ...form(next.name), goal: '' })
    expect((await cards()).at(-1)!.content).toBe(`Started ${next.name}`)
  })
})

describe('sprints.complete', () => {
  it('refuses a sprint that isn’t active: "Only the running sprint can be completed."', async () => {
    await asNour()
    await expect(api.sprints.complete('s-nex-2', { moveTo: null })).rejects.toMatchObject({ status: 400, detail: 'Only the running sprint can be completed.' })
  })

  it('moves only unfinished, unarchived tasks to Sprint 15; done ones keep s-nex-1; returns { moved, next: Sprint 15 }', async () => {
    await asNour()
    await api.tasks.archive('NEX-107')
    const done = await api.sprints.complete('s-nex-1', { moveTo: 's-nex-2' })
    expect(done.sprint).toMatchObject({ id: 's-nex-1', state: 'closed' })
    expect(done.moved).toBe(4)
    expect(done.next).toMatchObject({ id: 's-nex-2', name: 'Sprint 15', state: 'planned' })
    for (const key of ['NEX-101', 'NEX-102', 'NEX-105', 'NEX-106', 'NEX-110']) expect(await sprintOf(key)).toBe('s-nex-2')
    for (const key of ['NEX-103', 'NEX-104', 'NEX-107']) expect(await sprintOf(key)).toBe('s-nex-1')
  })

  it('moveTo "new" makes the next-named sprint after the closed one’s end and moves the tasks there', async () => {
    await asNour()
    await api.sprints.remove('s-nex-2') // so Sprint 14 is the project's last sprint
    const sprint14 = (await api.sprints.list('p-nex'))[0]!
    const done = await api.sprints.complete('s-nex-1', { moveTo: 'new' })
    expect(done.moved).toBe(5)
    expect(done.next).toMatchObject({ projectId: 'p-nex', name: 'Sprint 15', goal: '', state: 'planned', startDate: dayAfter(sprint14.endDate, 1), endDate: dayAfter(sprint14.endDate, 14, true) })
    for (const key of ['NEX-101', 'NEX-102', 'NEX-105', 'NEX-106', 'NEX-107']) expect(await sprintOf(key)).toBe(done.next!.id)
    expect((await api.sprints.list('p-nex')).map((s) => `${s.name} ${s.state}`)).toEqual(['Sprint 15 planned', 'Sprint 14 closed'])
    expect((await historyOf()).map((e) => e.kind)).toContain('sprint.added')
  })

  it('moveTo null sends unfinished tasks to the backlog (sprintId null)', async () => {
    await asNour()
    const done = await api.sprints.complete('s-nex-1', { moveTo: null })
    expect(done).toMatchObject({ moved: 5, next: null })
    for (const key of ['NEX-101', 'NEX-102', 'NEX-105', 'NEX-106', 'NEX-107']) expect(await sprintOf(key)).toBeNull()
    expect(await sprintOf('NEX-103')).toBe('s-nex-1')
    expect((await cards()).at(-1)!.sprintEvent).toMatchObject({ kind: 'completed', movedTo: null, moved: 5 })
    expect((await db.read()).audit.at(-1)!.detail).toBe('Completed · 2 of 7 tasks done · 5 moved to the backlog')
  })

  it('refuses a moveTo that isn’t a planned sprint of the project: "Move the tasks to a planned sprint of this project."', async () => {
    await asNour()
    const refused = { status: 400, detail: 'Move the tasks to a planned sprint of this project.' }
    await expect(api.sprints.complete('s-nex-1', { moveTo: 's-brd-2' })).rejects.toMatchObject(refused)
    await expect(api.sprints.complete('s-nex-1', { moveTo: 's-nex-1' })).rejects.toMatchObject(refused)
    await expect(api.sprints.complete('s-nex-1', { moveTo: 'nope' })).rejects.toMatchObject(refused)
    expect((await db.read()).sprints.find((s) => s.id === 's-nex-1')!.state).toBe('active')
    expect(await sprintOf('NEX-101')).toBe('s-nex-1')
  })

  it('logs sprint.completed with count, one task.changed per moved task (sprintId, from/to labels); posts a completed card; publishes projectChanged and ticketUpdated per moved task', async () => {
    await asNour()
    const before = (await historyOf()).length
    await api.sprints.complete('s-nex-1', { moveTo: 's-nex-2' })
    const added = (await historyOf()).slice(before)
    expect(added.find((e) => e.kind === 'sprint.completed')).toMatchObject({ projectId: 'p-nex', taskKey: null, subject: 'Sprint 14', count: 5, actorId: 'u-2' })
    const moves = added.filter((e) => e.kind === 'task.changed')
    expect(moves.map((e) => e.taskKey).sort()).toEqual(['NEX-101', 'NEX-102', 'NEX-105', 'NEX-106', 'NEX-107'])
    for (const e of moves) expect(e.changes).toEqual([{ field: 'sprintId', from: 's-nex-1', to: 's-nex-2', fromLabel: 'Sprint 14', toLabel: 'Sprint 15' }])
    const card = (await cards()).at(-1)!
    expect(card).toMatchObject({
      channelId: 'c-p-nex', senderId: 'u-2', content: 'Completed Sprint 14: 2 of 7 tasks done', mentions: [],
      sprintEvent: { kind: 'completed', projectKey: 'NEX', sprintId: 's-nex-1', name: 'Sprint 14', done: 2, total: 7, movedTo: 'Sprint 15', moved: 5 },
    })
    expect((await db.read()).audit.at(-1)).toMatchObject({ action: 'changed', group: 'status', record: { type: 'sprint', id: 's-nex-1', name: 'Sprint 14 · Nexus Core' }, detail: 'Completed · 2 of 7 tasks done · 5 moved to Sprint 15' })
    expect(events).toContainEqual({ type: 'projectChanged', projectId: 'p-nex' })
    const updated = events.filter((e) => e.type === 'ticketUpdated').map((e) => e.ticket)
    expect(updated.map((t) => t.key).sort()).toEqual(['NEX-101', 'NEX-102', 'NEX-105', 'NEX-106', 'NEX-107'])
    expect(updated.every((t) => t.sprintId === 's-nex-2')).toBe(true)
    expect(events).toContainEqual({ type: 'messageReceived', message: expect.objectContaining({ id: card.id }) })
  })
})

describe('sprints.remove', () => {
  it('removes a planned sprint, its tasks to the backlog; refuses the active one: "Only a planned sprint can be deleted."', async () => {
    await asNour()
    await api.sprints.remove('s-nex-2')
    expect((await api.sprints.list('p-nex')).map((s) => s.id)).toEqual(['s-nex-1'])
    expect(await sprintOf('NEX-110')).toBeNull()
    const history = await historyOf()
    expect(history.find((e) => e.kind === 'sprint.removed')).toMatchObject({ subject: 'Sprint 15', count: 1 })
    expect(history.at(-1)).toMatchObject({ kind: 'task.changed', taskKey: 'NEX-110', changes: [{ field: 'sprintId', from: 's-nex-2', to: null, fromLabel: 'Sprint 15' }] })
    expect(events).toContainEqual({ type: 'projectChanged', projectId: 'p-nex' })
    expect(events).toContainEqual({ type: 'ticketUpdated', ticket: expect.objectContaining({ key: 'NEX-110', sprintId: null }) })
    await expect(api.sprints.remove('s-nex-1')).rejects.toMatchObject({ status: 400, detail: 'Only a planned sprint can be deleted.' })
  })
})

describe('tasks and closed sprints', () => {
  it('refuses moving a task into a closed sprint: "That sprint is closed. Pick a planned or running one."; a task already in it may keep it', async () => {
    await asNour()
    await api.sprints.complete('s-nex-1', { moveTo: null })
    const closed = { status: 400, detail: 'That sprint is closed. Pick a planned or running one.' }
    await expect(api.tasks.update('NEX-109', { sprintId: 's-nex-1' })).rejects.toMatchObject(closed)
    await expect(api.tasks.create({ projectId: 'p-nex', title: 'Late', descriptionBody: [], status: '', priority: 'low', storyPoints: null, assigneeId: null, sprintId: 's-nex-1' })).rejects.toMatchObject(closed)
    // NEX-103 was done in Sprint 14: it keeps it through an edit.
    expect(await api.tasks.update('NEX-103', { sprintId: 's-nex-1', priority: 'low' })).toMatchObject({ sprintId: 's-nex-1', priority: 'low' })
    expect(await api.tasks.update('NEX-109', { sprintId: 's-nex-2' })).toMatchObject({ sprintId: 's-nex-2' })
  })

  // Sprints final review: a sheet or tab left open after its sprint was deleted.
  it('refuses a sprint that no longer exists: "That sprint no longer exists."', async () => {
    await asNour()
    await api.sprints.remove('s-nex-2')
    const gone = { status: 400, detail: 'That sprint no longer exists.' }
    await expect(api.tasks.update('NEX-109', { sprintId: 's-nex-2' })).rejects.toMatchObject(gone)
    await expect(api.tasks.create({ projectId: 'p-nex', title: 'Late', descriptionBody: [], status: '', priority: 'low', storyPoints: null, assigneeId: null, sprintId: 's-nex-2' })).rejects.toMatchObject(gone)
    // Another project's sprint is still that.
    await expect(api.tasks.update('NEX-109', { sprintId: 's-brd-1' })).rejects.toMatchObject({ status: 400, detail: 'That sprint belongs to another project.' })
  })
})

describe('sprint cards in the project’s chat', () => {
  it('a sprint card can’t be edited or deleted: "This message can’t be changed."', async () => {
    await asNour()
    await api.sprints.complete('s-nex-1', { moveTo: 's-nex-2' })
    const card = (await cards()).at(-1)!
    const target = { kind: 'message' as const, id: card.id }
    await expect(api.chat.edit(target, 'Changed')).rejects.toMatchObject({ status: 400, detail: 'This message can’t be changed.' })
    await expect(api.chat.remove(target)).rejects.toMatchObject({ status: 400, detail: 'This message can’t be changed.' })
    // Nor is it "my last message" to pick up and edit.
    expect((await api.chat.sent('ws-eng')).map((i) => i.target.id)).not.toContain(card.id)
  })
})
