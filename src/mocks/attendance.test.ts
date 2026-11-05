import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
import { setRequestInfo } from './audit'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

// User attendance and activities (Admin and help, slice 5; timer slice 3): days made from timer entries, app use as
// visits, working hours, the four views, and who sees whom.

const MIN = 60_000
let db: MockDb
let api: Api
let hub: MockHub
let clock: Date
let events: string[]
let from = { ip: '10.1.2.3', device: 'Chrome 130 · macOS' }
beforeEach(() => {
  latency.min = latency.max = 0
  // Saturday 31 Oct 2026, 2 PM in Cairo. The seed's working days are Sunday 25 to Thursday 29 October.
  clock = new Date('2026-10-31T12:00:00Z')
  from = { ip: '10.1.2.3', device: 'Chrome 130 · macOS' }
  setRequestInfo(() => from)
  hub = createMockHub(`test-attendance-${Math.random()}`, null)
  events = []
  hub.subscribe((e) => events.push(e.type))
  db = createDb(createMemoryStore(), seed, () => clock)
  api = createMockApi(db, hub, () => clock)
})
afterEach(() => hub.close())

const detail = (promise: Promise<unknown>) => promise.then(() => '', (e: { detail?: string }) => e.detail)
const later = (minutes: number) => (clock = new Date(clock.getTime() + minutes * MIN))
const place = { lat: 30.0444, lng: 31.2357, accuracy: 20 }

describe('attendance days from timer entries (timer slice 3)', () => {
  const u1Days = async () => api.attendance.days({ days: 7, userId: 'u-1' })

  it('a day is first timer start to last timer end; manual entries make no day', async () => {
    const salma = await api.attendance.days({ days: 7, userId: 'u-5' })
    expect(salma.map((d) => d.day)).toEqual(['2026-10-29', '2026-10-28', '2026-10-27', '2026-10-26', '2026-10-25'])
    expect(salma.find((d) => d.day === '2026-10-26')).toEqual({
      id: 'u-5:2026-10-26', userId: 'u-5', day: '2026-10-26', inAt: '2026-10-26T07:40:00.000Z', outAt: '2026-10-26T15:05:00.000Z',
      hours: 415 / 60, from: { ip: '197.48.112.6', device: 'Chrome 130 · Android', location: { lat: 30.0626, lng: 31.3409, accuracy: 12 } },
      endReason: 'stopped', newIp: true, newDevice: true, late: true, early: false,
    })
    // Tuesday's manual entry (9:00 to 11:00) adds no hours to the day and doesn't move its in or out.
    expect(salma.find((d) => d.day === '2026-10-27')).toMatchObject({ inAt: '2026-10-27T05:50:00.000Z', outAt: '2026-10-27T15:05:00.000Z', hours: 405 / 60 })
    await api.time.addManual({ projectId: 'p-nex', startedAt: '2026-10-31T08:00:00.000Z', endedAt: '2026-10-31T09:00:00.000Z', note: '' })
    expect(await u1Days()).toEqual([])
    await api.time.start({ taskId: 't-nex-101' }, place)
    later(30)
    await api.time.stop()
    expect(await u1Days()).toEqual([
      expect.objectContaining({ day: '2026-10-31', inAt: '2026-10-31T12:00:00.000Z', outAt: '2026-10-31T12:30:00.000Z', hours: 0.5, endReason: 'stopped', from: { ...from, location: place } }),
    ])
  })

  it("late from the first start; early from the last end; never early after 'flow' or 'timeout', or today while a timer runs or is paused", async () => {
    // Monday 2 November, Cairo on winter time (UTC+2): 8:00 UTC is 10:00 AM, late.
    clock = new Date('2026-11-02T08:00:00Z')
    await api.time.start({ taskId: 't-nex-101' })
    later(60)
    await api.time.pause()
    const today = async () => (await u1Days()).find((d) => d.day === '2026-11-02')!
    expect(await today()).toMatchObject({ late: true, early: false, outAt: '2026-11-02T09:00:00.000Z', endReason: 'paused' })
    await api.time.resume()
    expect(await today()).toMatchObject({ early: false, outAt: null, endReason: null })
    later(30)
    await api.time.stop()
    expect(await today()).toMatchObject({ early: true, outAt: '2026-11-02T09:30:00.000Z', hours: 1.5 })
    // Out at 10:00 AM Cairo each day, ended three ways.
    await db.update((d) => {
      for (const [day, endReason] of [['03', 'timeout'], ['04', 'flow'], ['05', 'stopped']] as const)
        d.timeEntries.push({ id: `te-x-${day}`, userId: 'u-1', projectId: 'p-nex', taskId: null, startedAt: `2026-11-${day}T06:30:00.000Z`, endedAt: `2026-11-${day}T08:00:00.000Z`, source: 'timer', note: '', endReason })
    })
    clock = new Date('2026-11-06T10:00:00Z')
    expect((await u1Days()).map((d) => [d.day, d.endReason, d.late, d.early])).toEqual([
      ['2026-11-05', 'stopped', false, true],
      ['2026-11-04', 'flow', false, false],
      ['2026-11-03', 'timeout', false, false],
      ['2026-11-02', 'stopped', true, true],
    ])
  })

  it('days carry from, newIp and newDevice against the same person’s day before', async () => {
    const salma = (await api.attendance.days({ days: 7, userId: 'u-5' })).reverse()
    // Monday 26: in late from her phone at home; Tuesday back on the office laptop, which differs from Monday.
    expect(salma.map((d) => [d.day, d.from?.ip, d.newIp, d.newDevice])).toEqual([
      ['2026-10-25', '41.233.18.9', false, false],
      ['2026-10-26', '197.48.112.6', true, true],
      ['2026-10-27', '41.233.18.9', true, true],
      ['2026-10-28', '41.233.18.9', false, false],
      ['2026-10-29', '41.233.18.9', false, false],
    ])
  })

  it('the period counts back from today', async () => {
    await db.read() // seeded on Saturday 31 October
    clock = new Date('2026-11-04T12:00:00Z')
    expect((await api.attendance.days({ days: 7, userId: 'u-5' })).map((d) => d.day)).toEqual(['2026-10-29'])
    expect(await api.attendance.days({ days: 1, userId: 'u-5' })).toEqual([])
  })

  it('the check-in calls are gone', () => {
    for (const name of ['checkIn', 'checkOut', 'undoCheckOut']) expect(name in api.time).toBe(false)
    expect('checkIns' in api.attendance).toBe(false)
  })
})

describe('who sees whom (slice 5)', () => {
  it('Admins see everyone; a project’s manager the people on it; anyone else only themselves', async () => {
    expect((await api.attendance.scope()).userIds).toHaveLength(9)
    await api.users.viewAs('u-2') // manages Nexus Core
    const pm = (await api.attendance.scope()).userIds
    expect(pm[0]).toBe('u-2')
    expect(pm).toEqual(expect.arrayContaining(['u-3', 'u-5', 'u-6']))
    expect(pm).not.toContain('u-9') // only on Sela booking, which Nour doesn't manage
    expect(await detail(api.attendance.days({ days: 7, userId: 'u-9' }))).toBe("You don't have access to their attendance.")
    const seen = new Set((await api.attendance.days({ days: 7 })).map((r) => r.userId))
    expect([...seen].every((id) => pm.includes(id))).toBe(true)
    expect(seen.has('u-5')).toBe(true)
    // On Nexus Core through its Frontend team, not as a member.
    expect(pm).toContain('u-7')
    await api.users.viewAs('u-1')
    await api.projects.archive('p-nex')
    await api.users.viewAs('u-2')
    // Hossam is only on Nexus Core among Nour's projects: once it's archived, Nour no longer sees him.
    expect((await api.attendance.scope()).userIds).not.toContain('u-6')
    await api.users.viewAs('u-5')
    expect((await api.attendance.scope()).userIds).toEqual(['u-5'])
    expect(new Set((await api.attendance.visits({ days: 7 })).map((v) => v.userId))).toEqual(new Set(['u-5']))
    expect(await detail(api.attendance.report({ days: 7, userId: 'u-2' }))).toBe("You don't have access to their attendance.")
    expect(await detail(api.attendance.visits({ days: 7, userId: 'u-2' }))).toBe("You don't have access to their attendance.")
    expect(await detail(api.attendance.day('2026-10-26', 'u-2'))).toBe("You don't have access to their attendance.")
  })
})

describe('the day view (slice 5)', () => {
  it('a row per person, absent ones too, with in, out, timer hours, app time and late or early', async () => {
    const rows = await api.attendance.day('2026-10-26')
    expect(rows).toHaveLength(9)
    expect(rows.find((r) => r.userId === 'u-5')).toEqual({
      userId: 'u-5', inAt: '2026-10-26T07:40:00.000Z', outAt: '2026-10-26T15:05:00.000Z', hours: 415 / 60, appMinutes: 360, late: true, early: false,
    })
    expect(rows.find((r) => r.userId === 'u-1')).toEqual({ userId: 'u-1', inAt: null, outAt: null, hours: 0, appMinutes: 0, late: false, early: false })
    expect((await api.attendance.day('2026-10-28', 'u-7'))[0]).toMatchObject({ early: true, late: false })
    expect(await detail(api.attendance.day('28 Oct'))).toBe('Pick a day.')
  })

  it('a day with a timer running counts hours until now, with no out', async () => {
    const [row] = await api.attendance.day('2026-10-31', 'u-2')
    expect(row).toMatchObject({ inAt: '2026-10-31T11:00:00.000Z', outAt: null, hours: 1 })
  })
})

describe('app use (slice 5)', () => {
  it('a ping a minute after the last goes on the same visit; a gap, another IP or another day starts a new one', async () => {
    await api.attendance.ping()
    later(1)
    await api.attendance.ping()
    let mine = (await api.attendance.visits({ days: 1, userId: 'u-1' }))
    expect(mine).toEqual([expect.objectContaining({ startedAt: '2026-10-31T12:00:00.000Z', endedAt: '2026-10-31T12:01:00.000Z', minutes: 2, ip: '10.1.2.3', device: 'Chrome 130 · macOS' })])
    later(6)
    await api.attendance.ping()
    from = { ip: '10.9.9.9', device: 'Chrome 130 · macOS' }
    later(1)
    await api.attendance.ping()
    mine = await api.attendance.visits({ days: 1, userId: 'u-1' })
    expect(mine.map((v) => [v.startedAt.slice(11, 16), v.minutes, v.ip])).toEqual([['12:08', 1, '10.9.9.9'], ['12:07', 1, '10.1.2.3'], ['12:00', 2, '10.1.2.3']])
    clock = new Date('2026-10-31T21:59:30Z') // 11:59 PM in Cairo
    await api.attendance.ping()
    clock = new Date('2026-10-31T22:00:30Z') // past midnight
    await api.attendance.ping()
    expect((await api.attendance.visits({ days: 1, userId: 'u-1' })).map((v) => v.day)).toEqual(['2026-11-01'])
  })

  it('a second ping within the same minute (another tab) adds nothing; two devices keep a visit each', async () => {
    await api.attendance.ping()
    clock = new Date(clock.getTime() + 20_000)
    await api.attendance.ping()
    later(1)
    await api.attendance.ping()
    expect((await api.attendance.visits({ days: 1, userId: 'u-1' })).map((v) => v.minutes)).toEqual([2])
    from = { ip: '10.1.2.3', device: 'Safari 18 · iOS' }
    await api.attendance.ping()
    for (const device of ['Chrome 130 · macOS', 'Safari 18 · iOS', 'Chrome 130 · macOS', 'Safari 18 · iOS']) {
      if (device.startsWith('Chrome')) later(1)
      from = { ip: '10.1.2.3', device }
      await api.attendance.ping()
    }
    expect((await api.attendance.visits({ days: 1, userId: 'u-1' })).map((v) => [v.device, v.minutes])).toEqual([['Safari 18 · iOS', 3], ['Chrome 130 · macOS', 4]])
  })

  it('pings are not logged and tell nobody', async () => {
    const logged = (await db.read()).audit.length
    events.length = 0
    await api.attendance.ping()
    expect((await db.read()).audit.length).toBe(logged)
    expect(events).toEqual([])
  })
})

describe('the report (slice 5)', () => {
  it('per person: days in, average in and out, late and early, timer hours and app time', async () => {
    const [salma] = await api.attendance.report({ days: 7, userId: 'u-5' })
    // That week Cairo was on summer time (UTC+3): in at 8:50 four days and 10:40 once, 9:12 on average; out at 6:05 PM.
    expect(salma).toMatchObject({ userId: 'u-5', daysIn: 5, avgIn: 9 * 60 + 12, avgOut: 18 * 60 + 5, late: 1, early: 0, appMinutes: 4 * 395 + 360 })
    expect(salma!.hours).toBeCloseTo((3 * 525 + 405 + 415) / 60)
    const everyone = await api.attendance.report({ days: 7 })
    expect(everyone).toHaveLength(9)
    expect(everyone.find((r) => r.userId === 'u-7')).toMatchObject({ early: 1, late: 0 })
    expect(everyone.find((r) => r.userId === 'u-1')).toEqual({ userId: 'u-1', daysIn: 0, avgIn: null, avgOut: null, late: 0, early: 0, hours: 0, appMinutes: 0 })
  })

  it('only 1, 7, 30 or 90 days', async () => {
    expect(await detail(api.attendance.report({ days: 14 as never }))).toBe('Pick 1, 7, 30 or 90 days.')
  })
})

describe('working hours (slice 5)', () => {
  it('Sunday to Thursday, 9 to 5, Cairo time, until someone who may change settings changes them; logged', async () => {
    expect(await api.attendance.workHours()).toEqual({ days: [0, 1, 2, 3, 4], start: '09:00', end: '17:00', timeZone: 'Africa/Cairo' })
    expect(await detail(api.attendance.setWorkHours({ days: [0], start: '17:00', end: '09:00' }))).toBe('The day ends after it starts.')
    expect(await api.attendance.setWorkHours({ days: [4, 0, 1, 2, 3], start: '08:30', end: '16:30' })).toEqual({ days: [0, 1, 2, 3, 4], start: '08:30', end: '16:30', timeZone: 'Africa/Cairo' })
    expect((await db.read()).audit.at(-1)).toMatchObject({
      action: 'changed', group: 'settings', record: { name: 'Working hours' },
      changes: [{ field: 'Starts', from: '9:00 AM', to: '8:30 AM' }, { field: 'Ends', from: '5:00 PM', to: '4:30 PM' }],
    })
    // 8:50 is now late.
    expect((await api.attendance.report({ days: 7, userId: 'u-5' }))[0]!.late).toBe(5)
    await api.users.viewAs('u-2')
    expect(await detail(api.attendance.setWorkHours({ days: [0], start: '09:00', end: '17:00' }))).toBe("You don't have access to settings.")
  })
})

describe('the timer timeout setting (timer slice 2)', () => {
  it('reads 4 hours by default; setTimer needs settings.manage, refuses anything but 1 to 12 whole hours, and audits Timer timeout', async () => {
    expect(await api.attendance.timer()).toEqual({ timeoutHours: 4 })
    for (const bad of [0, 13, 2.5, '4']) {
      await expect(api.attendance.setTimer({ timeoutHours: bad as number })).rejects.toMatchObject({ status: 400, detail: 'Pick a whole number of hours from 1 to 12.' })
    }
    expect(await api.attendance.setTimer({ timeoutHours: 2 })).toEqual({ timeoutHours: 2 })
    const entry = (await db.read()).audit.at(-1)!
    expect(entry).toMatchObject({ action: 'changed', group: 'settings', changes: [{ field: 'Timer timeout', from: '4 h', to: '2 h' }] })
    await api.users.viewAs('u-3')
    await expect(api.attendance.setTimer({ timeoutHours: 3 })).rejects.toMatchObject({ status: 403 })
    expect(await api.attendance.timer()).toEqual({ timeoutHours: 2 })
  })
})
