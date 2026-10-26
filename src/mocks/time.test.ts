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
    expect(asMember.entries).toHaveLength(asAdmin.entries.length)
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
