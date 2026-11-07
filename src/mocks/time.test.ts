import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
import type { RealtimeEvent } from '@/lib/realtime'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

let api: Api
let hub: MockHub
let db: MockDb
// The seed is built around the real date with entries only on earlier working days, so "today" is the real today.
let now: Date
let today: Date // the test's day; at() counts from it, so moving the clock doesn't move the day
const at = (h: number, m = 0, dayOffset = 0) => {
  const d = new Date(today)
  d.setDate(d.getDate() + dayOffset)
  d.setHours(h, m, 0, 0)
  return d
}
const later = (minutes: number) => {
  now = new Date(now.getTime() + minutes * 60_000)
}

beforeEach(() => {
  latency.min = latency.max = 0
  now = new Date()
  now.setHours(9, 0, 0, 0)
  today = new Date(now)
  hub = createMockHub(`test-time-${Math.random()}`, null)
  db = createDb(createMemoryStore(), seed)
  api = createMockApi(db, hub, () => now)
})
afterEach(() => hub.close())

describe('time.list', () => {
  it("returns the project's entries newest first, with rates for admins only", async () => {
    const asAdmin = await api.time.list('p-nex')
    expect(asAdmin.entries.length).toBeGreaterThan(0)
    expect(asAdmin.entries.every((e) => e.projectId === 'p-nex')).toBe(true)
    const starts = asAdmin.entries.map((e) => e.startedAt)
    expect(starts).toEqual([...starts].sort().reverse())
    expect(asAdmin.rates?.length).toBeGreaterThan(0)

    await api.users.viewAs('u-3')
    const asMember = await api.time.list('p-nex')
    expect(asMember.entries.every((e) => e.userId === 'u-3')).toBe(true) // members see their own (M8)
    expect(asMember.rates).toBeNull()
  })

  it('404s for an unknown project', async () => {
    await expect(api.time.list('p-nope')).rejects.toMatchObject({ status: 404 })
  })
})

describe('timer and manual time', () => {
  const mine = async () => (await db.read()).timeEntries.filter((e) => e.userId === 'u-1')

  it('today() starts empty for a fresh day, with no check-in fields (timer slice 3)', async () => {
    const day = await api.time.today()
    expect(Object.keys(day).sort()).toEqual(['day', 'entries', 'firstStart', 'timer'])
    expect(day.timer).toBeNull()
    expect(day.entries).toHaveLength(0)
  })

  it('starting a timer stops the running one', async () => {
    const first = (await api.time.start({ taskId: 't-nex-101' })).timer!
    later(30)
    const second = (await api.time.start({ taskId: 't-nex-102' })).timer!
    const entries = await mine()
    expect(entries.find((e) => e.id === first.entryId)?.endedAt).toBe(second.startedAt)
    expect(entries.filter((e) => e.endedAt === null)).toHaveLength(1)
    later(5)
    expect((await api.time.start({ taskId: 't-nex-102' })).timer?.entryId).toBe(second.entryId)
  })

  it('start refuses a done task', async () => {
    await expect(api.time.start({ taskId: 't-nex-103' })).rejects.toMatchObject({ detail: 'That task is done. Reopen it to log time.' })
    await expect(api.time.start({ taskId: 't-nope' })).rejects.toMatchObject({ detail: "That task doesn't exist." })
  })

  it('stop', async () => {
    await expect(api.time.stop()).rejects.toMatchObject({ detail: "There's no timer to stop." })
    const { timer } = await api.time.start({ projectId: 'p-nex' })
    later(10)
    expect((await api.time.stop()).timer).toBeNull()
    expect((await mine()).find((e) => e.id === timer!.entryId)?.endedAt).toBe(now.toISOString())
  })

  it('addManual rejects end before start, the future, over 12 hours, overlaps and long notes', async () => {
    const entry = (start: Date, end: Date, note = '') => ({ taskId: 't-nex-101', startedAt: start.toISOString(), endedAt: end.toISOString(), note })
    await expect(api.time.addManual(entry(at(8), at(7)))).rejects.toMatchObject({ detail: 'The end is before the start.' })
    await expect(api.time.addManual(entry(at(8), at(10)))).rejects.toMatchObject({ detail: "Time can't be logged in the future." })
    await expect(api.time.addManual(entry(at(7, 0, -1), at(20, 0, -1)))).rejects.toMatchObject({ detail: 'One entry can be up to 12 hours.' })
    await expect(api.time.addManual(entry(at(7), at(8), 'x'.repeat(201)))).rejects.toMatchObject({ detail: 'Keep the note under 200 characters.' })
    await api.time.addManual(entry(at(8), at(8, 30)))
    await expect(api.time.addManual(entry(at(8, 15), at(8, 45)))).rejects.toMatchObject({ detail: 'That overlaps time you already logged.' })
    // The running timer counts up to now.
    await api.time.start({ taskId: 't-nex-102' })
    later(60)
    await expect(api.time.addManual(entry(at(9, 15), at(9, 30)))).rejects.toMatchObject({ detail: 'That overlaps time you already logged.' })
  })

  it('addManual stores a manual entry and the hours count', async () => {
    const before = (await api.tickets.get('NEX-101')).loggedHours
    const stored = await api.time.addManual({ taskId: 't-nex-101', startedAt: at(7).toISOString(), endedAt: at(8, 30).toISOString(), note: 'Review' })
    expect(stored).toMatchObject({ source: 'manual', projectId: 'p-nex', userId: 'u-1', note: 'Review' })
    expect((await api.tickets.get('NEX-101')).loggedHours).toBeCloseTo(before + 1.5)
  })

  it('every role may log its own time', async () => {
    await api.users.viewAs('u-8') // Tarek, Member
    expect((await api.time.start({ taskId: 't-mob-104' })).timer?.target).toEqual({ taskId: 't-mob-104' })
  })

  it('each write publishes timeLogged', async () => {
    const events: RealtimeEvent[] = []
    hub.subscribe((e) => events.push(e))
    await api.time.start({ taskId: 't-nex-101' })
    await api.time.stop()
    expect(events).toEqual([
      { type: 'timeLogged', userId: 'u-1', projectId: 'p-nex' },
      { type: 'timeLogged', userId: 'u-1', projectId: 'p-nex' },
    ])
  })

  it('a timer left running overnight is closed at 12 hours, and counts at most 12 hours meanwhile', async () => {
    now = at(17)
    // NEX-102 has no seeded running timer, so its hours depend only on this test's clock (not the real time of day).
    const { timer } = await api.time.start({ taskId: 't-nex-102' })
    const before = (await api.tickets.get('NEX-102')).loggedHours
    now = at(9, 0, 1) // 16 hours later
    expect((await api.tickets.get('NEX-102')).loggedHours).toBeCloseTo(before + 12, 5)
    // Time after the 12 hours is free again for a manual entry.
    await api.time.addManual({ taskId: 't-nex-110', startedAt: at(7, 0, 1).toISOString(), endedAt: at(8, 0, 1).toISOString(), note: '' })
    await api.time.stop()
    const closed = (await mine()).find((e) => e.id === timer!.entryId)!
    expect(closed.endedAt).toBe(new Date(new Date(closed.startedAt).getTime() + 12 * 3_600_000).toISOString())
  })
})

describe('editing time', () => {
  const entry = (start: Date, end: Date, taskId = 't-nex-101') => ({ taskId, startedAt: start.toISOString(), endedAt: end.toISOString(), note: '' })

  it('the owner moves an entry to another task and time', async () => {
    const made = await api.time.addManual(entry(at(6), at(7)))
    const moved = await api.time.update(made.id, { target: { taskId: 't-nex-102' }, startedAt: at(6, 30).toISOString(), endedAt: at(7, 30).toISOString(), note: 'pairing' })
    expect(moved).toMatchObject({ id: made.id, taskId: 't-nex-102', startedAt: at(6, 30).toISOString(), endedAt: at(7, 30).toISOString(), note: 'pairing', source: 'manual' })
  })

  it('an edit is checked like a new entry: end before start, future, over 12 h, overlap with another entry', async () => {
    const a = await api.time.addManual(entry(at(6), at(7)))
    await api.time.addManual(entry(at(7), at(8)))
    await expect(api.time.update(a.id, { endedAt: at(5).toISOString() })).rejects.toMatchObject({ detail: 'The end is before the start.' })
    await expect(api.time.update(a.id, { endedAt: at(10).toISOString() })).rejects.toMatchObject({ detail: "Time can't be logged in the future." })
    await expect(api.time.update(a.id, { startedAt: at(5, 0, -1).toISOString() })).rejects.toMatchObject({ detail: 'One entry can be up to 12 hours.' })
    await expect(api.time.update(a.id, { endedAt: at(7, 30).toISOString() })).rejects.toMatchObject({ detail: 'That overlaps time you already logged.' })
  })

  it('an edit onto its own range is allowed', async () => {
    const a = await api.time.addManual(entry(at(6), at(7)))
    expect((await api.time.update(a.id, { startedAt: at(6, 15).toISOString() })).startedAt).toBe(at(6, 15).toISOString())
  })

  it("a running entry can't be edited or deleted", async () => {
    const day = await api.time.start({ taskId: 't-nex-102' })
    const id = day.timer!.entryId
    await expect(api.time.update(id, { note: 'x' })).rejects.toMatchObject({ status: 400, detail: 'Stop the timer first.' })
    await expect(api.time.remove(id)).rejects.toMatchObject({ status: 400, detail: 'Stop the timer first.' })
  })

  it("someone else's entry is refused; an admin may change it", async () => {
    await api.users.viewAs('u-8') // Tarek
    const his = await api.time.addManual(entry(at(6), at(7), 't-mob-104'))
    await api.users.viewAs('u-3') // Mariam, a member
    await expect(api.time.update(his.id, { note: 'mine' })).rejects.toMatchObject({ status: 403, detail: 'You can only change your own time.' })
    await expect(api.time.remove(his.id)).rejects.toMatchObject({ status: 403 })
    await api.users.viewAs('u-1') // Admin
    expect((await api.time.update(his.id, { note: 'fixed by admin' })).note).toBe('fixed by admin')
    expect((await api.time.update(his.id, { note: 'fixed by admin' })).userId).toBe('u-8')
  })

  it('remove takes the hours off the project and publishes timeLogged', async () => {
    const made = await api.time.addManual(entry(at(6), at(7)))
    const events: RealtimeEvent[] = []
    hub.subscribe((e) => events.push(e))
    const before = (await api.time.list('p-nex')).entries.length
    await api.time.remove(made.id)
    expect((await api.time.list('p-nex')).entries.length).toBe(before - 1)
    expect(events).toContainEqual({ type: 'timeLogged', userId: 'u-1', projectId: 'p-nex' })
  })

  it('a forgotten 12 h timer entry can be cut to its real end', async () => {
    now = at(7, 0, -1)
    await api.time.start({ taskId: 't-nex-102' })
    now = at(8) // next morning: the timer ran on
    await api.time.stop()
    const stopped = (await db.read()).timeEntries.find((e) => e.userId === 'u-1' && e.startedAt === at(7, 0, -1).toISOString())!
    expect(new Date(stopped.endedAt!).getTime() - new Date(stopped.startedAt).getTime()).toBe(12 * 3_600_000)
    const fixed = await api.time.update(stopped.id, { endedAt: at(17, 0, -1).toISOString() })
    expect(fixed.endedAt).toBe(at(17, 0, -1).toISOString())
  })
})

describe('editing time, edge cases from review', () => {
  it('a note-only edit of a timer entry that starts the second the last one stopped is allowed', async () => {
    now = new Date(at(7).getTime() + 27_400) // 07:00:27.4
    await api.time.start({ taskId: 't-nex-101' })
    now = new Date(at(8).getTime() + 13_900)
    const second = (await api.time.start({ taskId: 't-nex-102' })).timer!
    now = at(8, 30)
    await api.time.stop()
    expect((await api.time.update(second.entryId, { note: 'pairing' })).note).toBe('pairing')
  })

  it('an entry on an archived task can still be fixed, but not moved to another archived task', async () => {
    const made = await api.time.addManual({ taskId: 't-nex-101', startedAt: at(6).toISOString(), endedAt: at(7).toISOString(), note: '' })
    await api.tasks.archive('NEX-101')
    await api.tasks.archive('NEX-103')
    expect((await api.time.update(made.id, { endedAt: at(6, 30).toISOString() })).endedAt).toBe(at(6, 30).toISOString())
    await expect(api.time.update(made.id, { target: { taskId: 't-nex-103' } })).rejects.toMatchObject({ detail: 'That task is archived. Restore it to log time.' })
  })
})

describe('timers and column types', () => {
  it('a timer is refused on a task in a Done-type column', async () => {
    await db.update((d) => {
      d.projects.find((p) => p.id === 'p-nex')!.board = [
        { id: 'todo', label: 'To do', category: 'todo' },
        { id: 'inProgress', label: 'Doing', category: 'inProgress' },
        { id: 'col-ship', label: 'Shipped', category: 'done' },
      ]
      d.tickets.find((t) => t.key === 'NEX-102')!.status = 'col-ship'
    })
    await expect(api.time.start({ taskId: 't-nex-102' })).rejects.toMatchObject({ detail: 'That task is done. Reopen it to log time.' })
  })
})

describe('time on projects you are on', () => {
  const entry = (start: Date, end: Date, taskId: string) => ({ taskId, startedAt: start.toISOString(), endedAt: end.toISOString(), note: '' })

  it("starting a timer or adding time on a project you aren't on is refused", async () => {
    await api.users.viewAs('u-8') // Tarek: Mobile App only
    await expect(api.time.start({ taskId: 't-nex-102' })).rejects.toMatchObject({ status: 403, detail: "You're not on this project." })
    await expect(api.time.addManual(entry(at(6), at(7), 't-nex-102'))).rejects.toMatchObject({ status: 403, detail: "You're not on this project." })
    await api.users.viewAs('u-9') // Karim, sales, not on Nexus Core
    await expect(api.time.start({ taskId: 't-nex-102' })).rejects.toMatchObject({ status: 403 })
  })

  it('a member sees only their own entries; the manager and an admin see all', async () => {
    const all = (await api.time.list('p-nex')).entries
    expect(new Set(all.map((e) => e.userId)).size).toBeGreaterThan(1)
    await api.users.viewAs('u-3') // Mariam, member
    const mine = (await api.time.list('p-nex')).entries
    expect(mine.length).toBeGreaterThan(0)
    expect(mine.every((e) => e.userId === 'u-3')).toBe(true)
    await api.users.viewAs('u-2') // Nour manages Nexus Core
    expect((await api.time.list('p-nex')).entries).toHaveLength(all.length)
  })

  it('a PM of another project sees only their own entries there', async () => {
    await api.users.viewAs('u-4') // Ahmed manages Mobile App, not Nexus Core
    expect((await api.time.list('p-nex')).entries.every((e) => e.userId === 'u-4')).toBe(true)
  })

  it('someone taken off a project keeps seeing their own old entries but cannot log new time', async () => {
    await api.users.viewAs('u-3')
    const made = (await api.time.list('p-nex')).entries.find((e) => e.endedAt !== null)!
    await db.update((d) => {
      const p = d.projects.find((x) => x.id === 'p-nex')!
      p.memberIds = p.memberIds.filter((id) => id !== 'u-3')
      p.teamIds = []
    })
    expect((await api.time.list('p-nex')).entries.some((e) => e.id === made.id)).toBe(true)
    await expect(api.time.start({ taskId: 't-nex-102' })).rejects.toMatchObject({ status: 403 })
  })
})

describe('a forgotten timer', () => {
  it("starting on a new day stops yesterday's timer at its 12-hour limit, as Flow", async () => {
    now = at(16, 0, -1)
    await api.time.start({ taskId: 't-nex-101' })
    now = at(9)
    const day = await api.time.start({ taskId: 't-nex-102' })
    expect(day.timer?.target).toEqual({ taskId: 't-nex-102' })
    const entry = (await db.read()).timeEntries.find((e) => e.userId === 'u-1' && e.taskId === 't-nex-101' && e.startedAt === at(16, 0, -1).toISOString())!
    // Stopped at the 12-hour limit, not at this morning's start: 12 hours of time, whatever a clock change overnight
    // does to the wall clock.
    expect(entry.endedAt).toBe(new Date(at(16, 0, -1).getTime() + 12 * 3_600_000).toISOString())
    expect(entry.endReason).toBe('flow')
  })
})

describe('report filters', () => {
  it('report for one project only', async () => {
    const all = await api.time.report('ws-eng', 90)
    const nex = await api.time.report('ws-eng', 90, { projectId: 'p-nex' })
    expect(nex.byProject.map((p) => p.projectId)).toEqual(['p-nex'])
    expect(nex.totals.hours).toBeCloseTo(all.byProject.find((p) => p.projectId === 'p-nex')!.hours, 5)
  })
})


describe('pause, resume and stop (timer slice 1)', () => {
  const mine = async () => (await db.read()).timeEntries.filter((e) => e.userId === 'u-1')
  const MIN = 60_000

  it("pause ends my running entry with 'paused' and keeps it as my timer", async () => {
    const started = await api.time.start({ taskId: 't-nex-101' })
    later(30)
    const day = await api.time.pause()
    const entry = (await mine()).find((e) => e.id === started.timer!.entryId)!
    expect(entry).toMatchObject({ endedAt: now.toISOString(), endReason: 'paused' })
    expect(day.timer).toEqual({ state: 'paused', target: { taskId: 't-nex-101' }, projectId: 'p-nex', entryId: entry.id, runMs: 30 * MIN, startedAt: null, pausedBy: 'me' })
  })

  it('resume starts a new entry on the paused target; runMs carries the paused time', async () => {
    const first = (await api.time.start({ taskId: 't-nex-101' })).timer!.entryId
    later(30)
    await api.time.pause()
    later(15)
    const { timer } = await api.time.resume()
    expect(timer).toMatchObject({ state: 'running', target: { taskId: 't-nex-101' }, runMs: 30 * MIN, startedAt: now.toISOString(), pausedBy: null })
    expect(timer!.entryId).not.toBe(first)
    expect((await mine()).filter((e) => e.taskId === 't-nex-101')).toHaveLength(2)
  })

  it("stop on a running timer ends it 'stopped'; on a paused one marks it 'stopped'; either way timer is null", async () => {
    const running = (await api.time.start({ taskId: 't-nex-101' })).timer!.entryId
    later(10)
    expect((await api.time.stop()).timer).toBeNull()
    expect((await mine()).find((e) => e.id === running)).toMatchObject({ endedAt: now.toISOString(), endReason: 'stopped' })

    const paused = (await api.time.start({ taskId: 't-nex-102' })).timer!.entryId
    later(10)
    await api.time.pause()
    const pausedAt = now.toISOString()
    later(5)
    expect((await api.time.stop()).timer).toBeNull()
    expect((await mine()).find((e) => e.id === paused)).toMatchObject({ endedAt: pausedAt, endReason: 'stopped' })
  })

  it('start while paused ends the paused run and starts the new target from runMs 0', async () => {
    const old = (await api.time.start({ taskId: 't-nex-101' })).timer!.entryId
    later(20)
    await api.time.pause()
    const { timer } = await api.time.start({ taskId: 't-nex-102' })
    expect(timer).toMatchObject({ state: 'running', target: { taskId: 't-nex-102' }, runMs: 0 })
    expect((await mine()).find((e) => e.id === old)?.endReason).toBe('stopped')
    // Starting the same task again is a new run too.
    later(5)
    await api.time.pause()
    expect((await api.time.start({ taskId: 't-nex-102' })).timer?.runMs).toBe(0)
  })

  it('pause, resume and stop refuse with "Your timer isn\'t running." / "Nothing is paused." / "There\'s no timer to stop."', async () => {
    await expect(api.time.pause()).rejects.toMatchObject({ status: 400, detail: "Your timer isn't running." })
    await expect(api.time.resume()).rejects.toMatchObject({ status: 400, detail: 'Nothing is paused.' })
    await expect(api.time.stop()).rejects.toMatchObject({ status: 400, detail: "There's no timer to stop." })
    await api.time.start({ taskId: 't-nex-101' })
    await expect(api.time.resume()).rejects.toMatchObject({ detail: 'Nothing is paused.' })
  })

  it('resume is refused like start when the task went Done while paused', async () => {
    await api.time.start({ taskId: 't-nex-101' })
    later(10)
    await api.time.pause()
    await db.update((d) => {
      d.tickets.find((t) => t.id === 't-nex-101')!.status = 'done'
    })
    await expect(api.time.resume()).rejects.toMatchObject({ detail: 'That task is done. Reopen it to log time.' })
  })

  it("a run started 23:00 and paused 01:00 is today's paused timer with both parts in runMs", async () => {
    now = at(23, 0, -1)
    await api.time.start({ taskId: 't-nex-101' })
    now = at(1, 0)
    const { timer } = await api.time.pause()
    expect(timer).toMatchObject({ state: 'paused', runMs: 120 * MIN })
    expect((await api.time.today()).timer?.state).toBe('paused')
  })

  it('a run paused and resumed before midnight keeps its count after midnight, paused and resumed again', async () => {
    now = at(22, 0, -1)
    await api.time.start({ taskId: 't-nex-101' })
    now = at(22, 30, -1)
    await api.time.pause()
    now = at(23, 0, -1)
    await api.time.resume()
    // Running across midnight: the 30 minutes before the pause still count.
    now = at(0, 1)
    expect((await api.time.today()).timer).toMatchObject({ state: 'running', runMs: 30 * MIN })
    now = at(1, 0)
    expect((await api.time.pause()).timer).toMatchObject({ state: 'paused', runMs: 150 * MIN })
    // Resumed in the morning, the run carries on from 2:30, not from the part after midnight.
    now = at(9, 0)
    expect((await api.time.resume()).timer).toMatchObject({ state: 'running', runMs: 150 * MIN })
  })

  it("yesterday's paused run is not today's timer, and stop refuses", async () => {
    now = at(15, 0, -1)
    await api.time.start({ taskId: 't-nex-101' })
    later(30)
    await api.time.pause()
    now = at(9, 0)
    expect((await api.time.today()).timer).toBeNull()
    await expect(api.time.stop()).rejects.toMatchObject({ detail: "There's no timer to stop." })
  })

  it('start and resume record startedFrom; firstStart is true until one does', async () => {
    expect((await api.time.today()).firstStart).toBe(true)
    const started = await api.time.start({ taskId: 't-nex-101' }, { lat: 30.044431, lng: 31.235712, accuracy: 20.4 })
    expect(started.firstStart).toBe(false)
    const first = (await mine()).find((e) => e.id === started.timer!.entryId)!
    expect(first.startedFrom).toMatchObject({ location: { lat: 30.04443, lng: 31.23571, accuracy: 20 } })
    expect(first.startedFrom).toHaveProperty('ip')
    expect(first.startedFrom).toHaveProperty('device')
    later(5)
    await api.time.pause()
    const resumed = await api.time.resume('blocked')
    expect((await mine()).find((e) => e.id === resumed.timer!.entryId)?.startedFrom?.location).toBe('blocked')
    await expect(api.time.start({ taskId: 't-nex-102' }, { lat: 200, lng: 0, accuracy: 1 })).rejects.toMatchObject({ detail: "That location can't be right." })
  })

  it("Flow's stops (task Done, deactivate, 12 h) write endReason 'flow'", async () => {
    const onTask = (await api.time.start({ taskId: 't-nex-101' })).timer!.entryId
    later(10)
    await api.tasks.update('NEX-101', { status: 'done' })
    expect((await mine()).find((e) => e.id === onTask)?.endReason).toBe('flow')

    const forgotten = (await api.time.start({ taskId: 't-nex-102' })).timer!.entryId
    later(13 * 60)
    await api.time.stop()
    expect((await mine()).find((e) => e.id === forgotten)?.endReason).toBe('flow')

    await api.users.viewAs('u-3')
    const theirs = (await api.time.today()).timer!.entryId
    await api.users.viewAs('u-1')
    await api.users.deactivate('u-3', 'Left')
    expect((await db.read()).timeEntries.find((e) => e.id === theirs)?.endReason).toBe('flow')
  })
})

describe('where a timer start came from stays in Attendance', () => {
  it("time.list and an edit's reply never carry startedFrom, for the owner or anyone else", async () => {
    await api.users.viewAs('u-3')
    // u-3's seed timer runs on NEX-106 from before the test's clock; stop it, then time one of mine.
    await db.update((d) => void (d.timeEntries = d.timeEntries.filter((e) => e.id !== 'te-u-3-now')))
    await api.time.start({ taskId: 't-nex-101' }, { lat: 30.04443, lng: 31.23571, accuracy: 20 })
    later(10)
    const own = (await api.time.stop()).entries[0]
    expect(own).not.toHaveProperty('startedFrom') // my day lists my entries without it too
    await api.users.viewAs('u-1')
    const listed = (await api.time.list('p-nex')).entries
    expect(listed.some((e) => e.id === own.id)).toBe(true)
    expect(listed.every((e) => !('startedFrom' in e))).toBe(true)
    const edited = await api.time.update(own.id, { note: 'Pairing' })
    expect(edited).not.toHaveProperty('startedFrom')
    expect((await db.read()).timeEntries.find((e) => e.id === own.id)?.startedFrom?.location).toMatchObject({ lat: 30.04443 })
  })
})

describe('my timer goes by when entries end (timer slice 2 app check)', () => {
  it('a running entry is my timer even when it started before one I already stopped', async () => {
    await api.time.start({ taskId: 't-nex-101' })
    later(10)
    await api.time.stop()
    later(1)
    const running = (await api.time.start({ taskId: 't-nex-102' })).timer!.entryId
    // Its start moved back past the stopped one (a dev helper, or an edited start).
    await db.update((d) => {
      const e = d.timeEntries.find((x) => x.id === running)!
      e.startedAt = new Date(now.getTime() - 60 * 60_000).toISOString()
    })
    expect((await api.time.today()).timer).toMatchObject({ state: 'running', entryId: running })
  })
})

describe('adding time for someone else (add time for)', () => {
  // Yesterday 01:00–02:00: before any seeded timer that day.
  const forMariam = (userId = 'u-3', h = 1) => ({ projectId: 'p-nex', startedAt: at(h, 0, -1).toISOString(), endedAt: at(h + 1, 0, -1).toISOString(), note: 'Pairing', userId })
  const FOR_MANAGERS = 'You can only add time for others on projects you manage.'

  it('an Admin adds time for someone on any project; it is theirs, marked who added it', async () => {
    const entry = await api.time.addManual(forMariam())
    expect(entry).toMatchObject({ userId: 'u-3', addedBy: 'u-1', projectId: 'p-nex', source: 'manual', note: 'Pairing' })
    const audit = (await db.read()).audit.at(-1)!
    expect(audit).toMatchObject({ actorId: 'u-1', action: 'created' })
  })

  it("a project's manager adds time for its people, and not on a project they don't manage", async () => {
    await api.users.viewAs('u-2') // Nour manages Nexus Core
    expect(await api.time.addManual(forMariam())).toMatchObject({ userId: 'u-3', addedBy: 'u-2' })
    await expect(api.time.addManual({ ...forMariam('u-8'), projectId: 'p-mob' })).rejects.toMatchObject({ status: 403, detail: FOR_MANAGERS })
  })

  it("a Member can't add time for someone else; for themselves it's as before, with no addedBy", async () => {
    await api.users.viewAs('u-3')
    await expect(api.time.addManual(forMariam('u-5'))).rejects.toMatchObject({ status: 403, detail: FOR_MANAGERS })
    const own = await api.time.addManual(forMariam('u-3'))
    expect(own.userId).toBe('u-3')
    expect('addedBy' in own).toBe(false)
  })

  it("refuses someone not on the project, someone deactivated, someone unknown, and time that overlaps theirs", async () => {
    await api.users.viewAs('u-2')
    await expect(api.time.addManual(forMariam('u-8'))).rejects.toMatchObject({ status: 400, detail: 'You can only add time for the people on this project.' })
    await expect(api.time.addManual(forMariam('u-nope'))).rejects.toMatchObject({ status: 404 })
    await api.time.addManual(forMariam())
    await expect(api.time.addManual(forMariam())).rejects.toMatchObject({ status: 400, detail: 'That overlaps time Mariam Fathy already logged.' })
    await api.users.viewAs('u-1')
    await api.users.deactivate('u-6', 'Left the company')
    await api.users.viewAs('u-2')
    await expect(api.time.addManual(forMariam('u-6', 3))).rejects.toMatchObject({ status: 400, detail: 'Hossam Gaber is deactivated.' })
  })

  it('whoever added an entry can fix and delete it; another manager cannot', async () => {
    await api.users.viewAs('u-2')
    const entry = await api.time.addManual(forMariam())
    expect(entry.userId).toBe('u-3')
    expect((await api.time.update(entry.id, { note: 'Code review' })).note).toBe('Code review')
    await api.users.viewAs('u-4') // Ahmed manages other projects
    await expect(api.time.update(entry.id, { note: 'x' })).rejects.toMatchObject({ status: 403 })
    await api.users.viewAs('u-2')
    await api.time.remove(entry.id)
    expect((await db.read()).timeEntries.some((e) => e.id === entry.id)).toBe(false)
  })
})
