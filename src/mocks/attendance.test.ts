import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
import { setRequestInfo } from './audit'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

// User attendance and activities (Admin and help, slice 5): what a check-in and check-out record, app use as visits,
// working hours, the four views, and who sees whom.

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

describe('checking in and out records where from (slice 5)', () => {
  it('the server’s time, IP and device, and the browser’s place; undoing a check-out forgets where it came from', async () => {
    expect((await api.time.today()).firstCheckIn).toBe(true)
    const day = await api.time.checkIn({ plan: 'Reviews', location: place })
    expect(day.firstCheckIn).toBe(false)
    expect(day.checkIn).toMatchObject({ checkedInAt: clock.toISOString(), inFrom: { ip: '10.1.2.3', device: 'Chrome 130 · macOS', location: place } })
    later(30)
    from = { ip: '10.9.9.9', device: 'Safari 18 · iOS' }
    expect((await api.time.checkOut({ location: 'blocked' })).checkIn).toMatchObject({ outFrom: { ip: '10.9.9.9', device: 'Safari 18 · iOS', location: 'blocked' } })
    expect((await api.time.undoCheckOut()).checkIn).toMatchObject({ checkedOutAt: null, outFrom: null })
  })

  it('someone whose check-ins came before Attendance still gets the notice once', async () => {
    await db.update((d) => {
      d.checkIns.push({ id: 'ci-old', userId: 'u-1', day: '2026-10-01', checkedInAt: '2026-10-01T06:00:00.000Z', checkedOutAt: '2026-10-01T14:00:00.000Z', plan: 'Old' })
    })
    expect((await api.time.today()).firstCheckIn).toBe(true)
  })

  it('a place is kept to 5 decimals, about a metre', async () => {
    expect((await api.time.checkIn({ plan: 'Reviews', location: { lat: 30.044412345, lng: 31.235712345, accuracy: 18.4 } })).checkIn?.inFrom?.location).toEqual({ lat: 30.04441, lng: 31.23571, accuracy: 18 })
  })

  it('checking out a check-in forgotten on an earlier day ends it with that day’s work, as Flow, never early', async () => {
    clock = new Date('2026-11-02T07:00:00Z') // Monday 9:00 AM
    await api.time.checkIn({ plan: 'Reviews', target: { taskId: 't-nex-101' }, location: place })
    clock = new Date('2026-11-03T08:00:00Z') // Tuesday 10:00 AM: still checked in, the timer still running
    await api.time.checkOut({ location: place })
    const monday = (await db.read()).checkIns.find((c) => c.userId === 'u-1' && c.day === '2026-11-02')!
    // The timer stops at its 12-hour limit, and the check-in ends with it.
    expect(monday).toMatchObject({ checkedOutAt: '2026-11-02T19:00:00.000Z', closedByFlow: true, outFrom: null })
    expect((await api.attendance.day('2026-11-02', 'u-1'))[0]).toMatchObject({ hours: 12, early: false, byFlow: true })
  })

  it('no place sent reads as none; a place that can’t be right is refused', async () => {
    expect(await detail(api.time.checkIn({ plan: 'Reviews', location: { lat: 91, lng: 0, accuracy: 5 } }))).toBe("That location can't be right.")
    expect(await detail(api.time.checkIn({ plan: 'Reviews', location: 'somewhere' as never }))).toBe("That location can't be right.")
    expect((await api.time.checkIn({ plan: 'Reviews' })).checkIn?.inFrom?.location).toBe('none')
  })
})

describe('the check-ins view (slice 5)', () => {
  it('lists each check-in and check-out newest first, marking a new IP or device and late or early', async () => {
    const rows = await api.attendance.checkIns({ days: 7, userId: 'u-5' })
    expect(rows).toHaveLength(10)
    expect(rows.map((r) => r.at)).toEqual(rows.map((r) => r.at).sort().reverse())
    // Monday 26: in late from her phone at home, then back on the office laptop to check out.
    const monday = rows.filter((r) => r.at.startsWith('2026-10-26'))
    expect(monday.map((r) => [r.kind, r.ip, r.newIp, r.newDevice, r.offHours])).toEqual([
      ['out', '41.233.18.9', true, true, false],
      ['in', '197.48.112.6', true, true, true],
    ])
    // The first check of all has nothing to differ from.
    expect(rows.at(-1)).toMatchObject({ kind: 'in', newIp: false, newDevice: false })
    expect(rows.filter((r) => r.newIp)).toHaveLength(2)
  })

  it('a check-out Flow made is marked, never early, and has no place', async () => {
    // Tarek checked in now (seed) and forgets to check out; tomorrow's check-in closes it.
    await api.users.viewAs('u-3')
    clock = new Date('2026-11-01T07:30:00Z')
    await api.time.checkIn({ plan: 'Next', location: 'none' })
    const out = (await api.attendance.checkIns({ days: 7 })).find((r) => r.kind === 'out' && r.at.startsWith('2026-10-31'))!
    expect(out).toMatchObject({ byFlow: true, offHours: false, ip: null, location: null })
  })

  it('the period counts back from today', async () => {
    await db.read() // seeded on Saturday 31 October
    clock = new Date('2026-11-04T12:00:00Z')
    expect((await api.attendance.checkIns({ days: 7, userId: 'u-5' })).map((r) => r.at.slice(0, 10))).toEqual(['2026-10-29', '2026-10-29'])
    expect(await api.attendance.checkIns({ days: 1, userId: 'u-5' })).toEqual([])
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
    expect(await detail(api.attendance.checkIns({ days: 7, userId: 'u-9' }))).toBe("You don't have access to their attendance.")
    const seen = new Set((await api.attendance.checkIns({ days: 7 })).map((r) => r.userId))
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
  it('a row per person, absent ones too, with in, out, hours checked in, app time and late or early', async () => {
    const rows = await api.attendance.day('2026-10-26')
    expect(rows).toHaveLength(9)
    expect(rows.find((r) => r.userId === 'u-5')).toEqual({
      userId: 'u-5', checkedInAt: '2026-10-26T07:40:00.000Z', checkedOutAt: '2026-10-26T15:05:00.000Z', byFlow: false,
      hours: 445 / 60, appMinutes: 360, late: true, early: false,
    })
    expect(rows.find((r) => r.userId === 'u-1')).toEqual({ userId: 'u-1', checkedInAt: null, checkedOutAt: null, byFlow: false, hours: 0, appMinutes: 0, late: false, early: false })
    expect((await api.attendance.day('2026-10-28', 'u-7'))[0]).toMatchObject({ early: true, late: false })
    expect(await detail(api.attendance.day('28 Oct'))).toBe('Pick a day.')
  })

  it('a check-in still open counts hours until now', async () => {
    const [row] = await api.attendance.day('2026-10-31', 'u-2')
    expect(row).toMatchObject({ checkedOutAt: null, hours: 3 })
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
  it('per person: days in, average in and out, late and early, hours checked in and app time', async () => {
    const [salma] = await api.attendance.report({ days: 7, userId: 'u-5' })
    // That week Cairo was on summer time (UTC+3): in at 8:50 four days and 10:40 once, 9:12 on average; out at 6:05 PM.
    expect(salma).toMatchObject({ userId: 'u-5', daysIn: 5, avgIn: 9 * 60 + 12, avgOut: 18 * 60 + 5, late: 1, early: 0, appMinutes: 4 * 395 + 360 })
    expect(salma!.hours).toBeCloseTo(4 * (9 + 15 / 60) + 445 / 60)
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
