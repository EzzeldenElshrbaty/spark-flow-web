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

describe('check-in, timer and manual time', () => {
  const mine = async () => (await db.read()).timeEntries.filter((e) => e.userId === 'u-1')

  it('today() starts empty for a fresh day', async () => {
    const day = await api.time.today()
    expect(day.checkIn).toBeNull()
    expect(day.running).toBeNull()
    expect(day.entries).toHaveLength(0)
  })

  it('check-in once per day, plan required', async () => {
    await expect(api.time.checkIn({ plan: ' ' })).rejects.toMatchObject({ status: 400, detail: "Write a line about today's plan." })
    const day = await api.time.checkIn({ plan: 'Auth work' })
    expect(day.checkIn?.plan).toBe('Auth work')
    await expect(api.time.checkIn({ plan: 'Again' })).rejects.toMatchObject({ detail: "You've already checked in today." })
  })

  it('check-in with a task starts its timer', async () => {
    const day = await api.time.checkIn({ plan: 'x', target: { taskId: 't-nex-101' } })
    expect(day.running).toMatchObject({ taskId: 't-nex-101', projectId: 'p-nex', source: 'timer', endedAt: null })
  })

  it('starting a timer stops the running one', async () => {
    const first = (await api.time.start({ taskId: 't-nex-101' })).running!
    later(30)
    const second = (await api.time.start({ taskId: 't-nex-102' })).running!
    const entries = await mine()
    expect(entries.find((e) => e.id === first.id)?.endedAt).toBe(second.startedAt)
    expect(entries.filter((e) => e.endedAt === null)).toHaveLength(1)
    later(5)
    expect((await api.time.start({ taskId: 't-nex-102' })).running?.id).toBe(second.id)
  })

  it('start refuses a done task', async () => {
    await expect(api.time.start({ taskId: 't-nex-103' })).rejects.toMatchObject({ detail: 'That task is done. Reopen it to log time.' })
    await expect(api.time.start({ taskId: 't-nope' })).rejects.toMatchObject({ detail: "That task doesn't exist." })
  })

  it('stop', async () => {
    await expect(api.time.stop()).rejects.toMatchObject({ detail: 'No timer is running.' })
    const { running } = await api.time.start({ projectId: 'p-nex' })
    later(10)
    expect((await api.time.stop()).running).toBeNull()
    expect((await mine()).find((e) => e.id === running!.id)?.endedAt).toBe(now.toISOString())
  })

  it("check-out closes yesterday's open check-in", async () => {
    now = at(17)
    await api.time.checkIn({ plan: 'Late start', target: { taskId: 't-nex-101' } })
    now = at(9, 0, 1)
    const day = await api.time.today()
    expect(day.checkIn).toBeNull()
    expect(day.openCheckIn?.plan).toBe('Late start') // still open from yesterday
    expect(day.running?.taskId).toBe('t-nex-101')
    const out = await api.time.checkOut()
    expect(out.running).toBeNull()
    expect(out.openCheckIn).toBeNull()
    const checkIns = (await db.read()).checkIns.filter((c) => c.userId === 'u-1')
    expect(checkIns.every((c) => c.checkedOutAt !== null)).toBe(true)
    await expect(api.time.checkOut()).rejects.toMatchObject({ detail: "You haven't checked in today." })
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
    await api.time.checkIn({ plan: 'Offline cache' })
    expect((await api.time.start({ taskId: 't-mob-104' })).running?.userId).toBe('u-8')
  })

  it('each write publishes timeLogged', async () => {
    const events: RealtimeEvent[] = []
    hub.subscribe((e) => events.push(e))
    await api.time.start({ taskId: 't-nex-101' })
    await api.time.checkIn({ plan: 'x' })
    expect(events).toEqual([
      { type: 'timeLogged', userId: 'u-1', projectId: 'p-nex' },
      { type: 'timeLogged', userId: 'u-1', projectId: null },
    ])
  })

  it('a timer left running overnight is closed at 12 hours, and counts at most 12 hours meanwhile', async () => {
    now = at(17)
    // NEX-102 has no seeded running timer, so its hours depend only on this test's clock (not the real time of day).
    const { running } = await api.time.checkIn({ plan: 'Late', target: { taskId: 't-nex-102' } })
    const before = (await api.tickets.get('NEX-102')).loggedHours
    now = at(9, 0, 1) // 16 hours later
    expect((await api.tickets.get('NEX-102')).loggedHours).toBeCloseTo(before + 12, 5)
    // Time after the 12 hours is free again for a manual entry.
    await api.time.addManual({ taskId: 't-nex-110', startedAt: at(7, 0, 1).toISOString(), endedAt: at(8, 0, 1).toISOString(), note: '' })
    await api.time.checkOut()
    const closed = (await mine()).find((e) => e.id === running!.id)!
    expect(closed.endedAt).toBe(new Date(new Date(closed.startedAt).getTime() + 12 * 3_600_000).toISOString())
  })

  it("checking in closes an earlier day's open check-in", async () => {
    now = at(10, 0, -1)
    await api.time.checkIn({ plan: 'Yesterday' })
    await api.time.addManual({ taskId: 't-nex-101', startedAt: at(8, 0, -1).toISOString(), endedAt: at(9, 30, -1).toISOString(), note: '' })
    now = at(9)
    const day = await api.time.checkIn({ plan: 'Today' })
    expect(day.openCheckIn).toBeNull()
    const yesterday = (await db.read()).checkIns.find((c) => c.userId === 'u-1' && c.plan === 'Yesterday')!
    expect(yesterday.checkedOutAt).toBe(at(10, 0, -1).toISOString()) // its own start: the manual entry ended earlier
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
    const id = day.running!.id
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
    const second = (await api.time.start({ taskId: 't-nex-102' })).running!
    now = at(8, 30)
    await api.time.stop()
    expect((await api.time.update(second.id, { note: 'pairing' })).note).toBe('pairing')
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
    await expect(api.time.checkIn({ plan: 'Work', target: { taskId: 't-nex-102' } })).rejects.toMatchObject({ status: 403 })
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

describe('undo check-out', () => {
  it("undo reopens today's check-in; the person is \"checked in now\" again on the dashboard", async () => {
    await api.time.checkIn({ plan: 'Reviews' })
    later(60)
    await api.time.checkOut()
    const day = await api.time.undoCheckOut()
    expect(day.checkIn?.checkedOutAt ?? null).toBeNull()
    expect((await api.dashboard.checkedIn('ws-eng')).some((c) => c.userId === 'u-1')).toBe(true)
  })
  it('undo with no check-out today is refused', async () => {
    await expect(api.time.undoCheckOut()).rejects.toMatchObject({ status: 400, detail: "You haven't checked out today." })
    await api.time.checkIn({ plan: 'Reviews' })
    await expect(api.time.undoCheckOut()).rejects.toMatchObject({ status: 400, detail: "You haven't checked out today." })
  })
  it("undo doesn't reopen yesterday's", async () => {
    now = at(9, 0, -1)
    await api.time.checkIn({ plan: 'Yesterday' })
    now = at(17, 0, -1)
    await api.time.checkOut()
    now = at(9)
    await expect(api.time.undoCheckOut()).rejects.toMatchObject({ status: 400, detail: "You haven't checked out today." })
  })
})

describe('a forgotten timer', () => {
  it("checking in on a new day stops yesterday's timer", async () => {
    now = at(16, 0, -1)
    await api.time.start({ taskId: 't-nex-101' })
    now = at(9)
    const day = await api.time.checkIn({ plan: 'New day' })
    expect(day.running).toBeNull()
    const entry = (await db.read()).timeEntries.find((e) => e.userId === 'u-1' && e.taskId === 't-nex-101' && e.startedAt === at(16, 0, -1).toISOString())!
    expect(entry.endedAt).toBe(at(4).toISOString()) // stopped at the 12-hour limit, not at this morning's check-in
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

