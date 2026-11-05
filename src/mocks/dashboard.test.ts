import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
import { categoryOf } from '@/lib/boardColumns'
import { localDay } from '@/lib/dates'
import { entryHours } from '@/lib/hours'
import { createDb, type MockDb } from './db'
import { taskView } from './derive'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

let api: Api
let hub: MockHub
let db: MockDb
const as = (userId: string) => api.users.viewAs(userId)
const keys = (list: { key: string }[]) => list.map((p) => p.key).sort()

beforeEach(() => {
  latency.min = latency.max = 0
  hub = createMockHub(`test-dashboard-${Math.random()}`, null)
  db = createDb(createMemoryStore(), seed)
  api = createMockApi(db, hub)
})
afterEach(() => hub.close())

describe('dashboard', () => {
  it('scope per role', async () => {
    expect(keys(await api.dashboard.projects('ws-eng'))).toEqual(['ELM', 'MOB', 'NEX', 'SEL'])
    await as('u-9') // Sales
    expect(keys(await api.dashboard.projects('ws-eng'))).toEqual(['ELM', 'MOB', 'NEX', 'SEL'])
    await as('u-4') // Ahmed
    expect(keys(await api.dashboard.projects('ws-eng'))).toEqual(['MOB', 'SEL'])
    await as('u-2') // Nour
    expect(keys(await api.dashboard.projects('ws-eng'))).toEqual(['ELM', 'NEX'])
    await as('u-5') // Salma, a Member: on Nexus Core, Mobile App and El Moasser
    expect(keys(await api.dashboard.projects('ws-eng'))).toEqual(['ELM', 'MOB', 'NEX'])
    expect(await api.dashboard.workingNow('ws-eng')).toEqual([]) // she manages none of them
    await as('u-8') // Tarek, a Member: on Mobile App directly and through the Mobile team
    expect(keys(await api.dashboard.projects('ws-eng'))).toEqual(['MOB'])
  })

  it('scope: a PM sees the projects they manage plus the ones they are on; someone on none sees none', async () => {
    // Ahmed manages Mobile App and Sela booking (and is on Mobile App through his team).
    await as('u-4')
    expect(keys(await api.dashboard.projects('ws-eng'))).toEqual(['MOB', 'SEL'])
    // A PM on a project they don't manage sees it too.
    await db.update((d) => void d.projects.find((p) => p.id === 'p-nex')!.memberIds.push('u-4'))
    expect(keys(await api.dashboard.projects('ws-eng'))).toEqual(['MOB', 'NEX', 'SEL'])
    // Nour is on nothing in Spark Design: an empty dashboard, not a refusal.
    await as('u-2')
    expect(await api.dashboard.projects('ws-design')).toEqual([])
    const stats = await api.dashboard.stats('ws-design')
    expect(stats.days).toHaveLength(14)
    expect(stats.days.every((d) => d.hours === 0 && d.mine === 0)).toBe(true)
    expect(stats.byProject).toEqual([])
    expect(stats.byStatus.map((s) => s.count)).toEqual([0, 0, 0])
    expect(stats.overdue).toEqual([])
  })

  it('no cost for non-admins', async () => {
    expect((await api.dashboard.projects('ws-eng')).find((p) => p.key === 'NEX')!.cost).toBeGreaterThan(0)
    for (const userId of ['u-9', 'u-4', 'u-2', 'u-5']) {
      await as(userId)
      expect((await api.dashboard.projects('ws-eng')).every((p) => p.cost === null)).toBe(true)
    }
  })

  it('phase, estimate and week', async () => {
    const before = await api.dashboard.projects('ws-eng')
    const nex = before.find((p) => p.key === 'NEX')!
    expect(nex.phaseName).toBe('Build')
    expect(before.find((p) => p.key === 'ELM')!.phaseName).toBeNull()
    const data = await db.read()
    const estimates = data.tickets.filter((t) => t.projectId === 'p-nex').reduce((s, t) => s + (t.estimateHours ?? 0), 0)
    expect(nex.estimateHours).toBeCloseTo(estimates)

    await as('u-3')
    const day = (offset: number, h: number) => {
      const d = new Date()
      d.setDate(d.getDate() + offset)
      d.setHours(h, 0, 0, 0)
      return d.toISOString()
    }
    await api.time.addManual({ projectId: 'p-nex', startedAt: day(-10, 6), endedAt: day(-10, 8), note: 'old' })
    const before3 = before.find((p) => p.key === 'NEX')!.week.find((w) => w.userId === 'u-3')?.hours ?? 0
    await api.time.addManual({ projectId: 'p-nex', startedAt: day(-1, 5), endedAt: day(-1, 7), note: 'yesterday' })
    await as('u-1')
    const after3 = (await api.dashboard.projects('ws-eng')).find((p) => p.key === 'NEX')!.week.find((w) => w.userId === 'u-3')!.hours
    expect(after3).toBeCloseTo(before3 + 2, 1) // yesterday counts, 10 days ago doesn't
  })

  it('Working now lists running timers, newest first, by checkins.all and checkins.managed (timer slice 3)', async () => {
    // The seed has Nour, Mariam and Hossam running a timer on Nexus Core.
    expect((await api.dashboard.workingNow('ws-eng')).map((w) => w.userId).sort()).toEqual(['u-2', 'u-3', 'u-6'])
    await as('u-8')
    await api.time.start({ taskId: 't-mob-104' })
    await as('u-1')
    const now = await api.dashboard.workingNow('ws-eng')
    expect(now[0]).toEqual({ userId: 'u-8', taskId: 't-mob-104', projectId: 'p-mob', startedAt: expect.any(String) })
    await as('u-4') // manages MOB
    expect((await api.dashboard.workingNow('ws-eng')).map((w) => w.userId)).toEqual(['u-8'])
    await as('u-2') // NEX and ELM only
    expect((await api.dashboard.workingNow('ws-eng')).some((w) => w.userId === 'u-8')).toBe(false)
    await as('u-9') // Sales
    expect(await api.dashboard.workingNow('ws-eng')).toEqual([])
    await as('u-8')
    await api.time.pause()
    await as('u-1')
    // Paused isn't working now.
    expect((await api.dashboard.workingNow('ws-eng')).some((w) => w.userId === 'u-8')).toBe(false)
    expect('checkedIn' in api.dashboard).toBe(false)
  })
})

describe("others' hours on the cards", () => {
  it("a Member sees only their own row in a card's last 7 days, with the project's total; a manager and Sales see each person", async () => {
    const people = (week: { userId: string }[]) => week.map((w) => w.userId).sort()
    const nexOf = async () => (await api.dashboard.projects('ws-eng')).find((p) => p.key === 'NEX')!
    const admin = await nexOf()
    const total = admin.week.reduce((s, w) => s + w.hours, 0)
    expect(admin.week.length).toBeGreaterThan(1)
    expect(admin.weekHours).toBeCloseTo(total, 2)

    await as('u-3') // Mariam, a Member on Nexus Core: her own entries only, as on its Time tab
    const member = await nexOf()
    expect(people(member.week)).toEqual(['u-3'])
    expect(member.weekHours).toBeCloseTo(total, 2)

    await as('u-2') // Nour manages Nexus Core
    expect(people((await nexOf()).week)).toEqual(people(admin.week))
    await as('u-9') // Sales: the dashboard for every project, as before
    expect(people((await nexOf()).week)).toEqual(people(admin.week))
  })
})

describe('over estimate', () => {
  it("hours on unestimated tasks and on no task don't count toward over", async () => {
    const card = (await api.dashboard.projects('ws-eng')).find((p) => p.id === 'p-nex')!
    const data = await db.read()
    const estimated = new Set(data.tickets.filter((t) => t.projectId === 'p-nex' && !t.archivedAt && t.estimateHours !== null).map((t) => t.id))
    const entries = data.timeEntries.filter((e) => e.projectId === 'p-nex')
    const expected = entries.filter((e) => e.taskId && estimated.has(e.taskId)).reduce((s, e) => s + entryHours(e, new Date()), 0)
    expect(card.estimatedLoggedHours).toBeCloseTo(expected, 1)
    // Two hours on the project but on no task: logged, not estimated.
    await db.update((d) => void d.timeEntries.push({ id: 'te-extra', userId: 'u-3', projectId: 'p-nex', taskId: null, startedAt: '2026-10-01T08:00:00.000Z', endedAt: '2026-10-01T10:00:00.000Z', source: 'manual', note: '', endReason: null }))
    const after = (await api.dashboard.projects('ws-eng')).find((p) => p.id === 'p-nex')!
    expect(after.loggedHours).toBeCloseTo(card.loggedHours + 2, 1)
    expect(after.estimatedLoggedHours).toBeCloseTo(card.estimatedLoggedHours, 1)
  })
})

describe('last week, unrounded', () => {
  it("last week's hours aren't rounded", async () => {
    const at = Date.now() - 3_600_000
    await db.update((d) => void d.timeEntries.push({ id: 'te-20', userId: 'u-8', projectId: 'p-nex', taskId: null, startedAt: new Date(at).toISOString(), endedAt: new Date(at + 20 * 60_000).toISOString(), source: 'manual', note: '', endReason: null }))
    const week = (await api.dashboard.projects('ws-eng')).find((p) => p.id === 'p-nex')!.week
    expect(week.find((w) => w.userId === 'u-8')!.hours).toBeCloseTo(1 / 3, 4)
  })
})

describe('dashboard scope', () => {
  it("a PM doesn't see a timer running on a project outside their scope", async () => {
    await api.users.viewAs('u-5') // Salma: on Nexus Core and Mobile App
    await api.time.start({ taskId: 't-mob-103' })
    await api.users.viewAs('u-2') // Nour manages Nexus Core, not Mobile App
    expect((await api.dashboard.workingNow('ws-eng')).some((w) => w.userId === 'u-5')).toBe(false)
  })
  it("a workspace's dashboard covers only its own projects", async () => {
    await api.users.viewAs('u-7') // Dina manages Brand Refresh (Spark Design) and is on El Moasser and, through Frontend, Nexus Core
    expect(keys(await api.dashboard.projects('ws-eng'))).toEqual(['ELM', 'NEX'])
    expect(keys(await api.dashboard.projects('ws-design'))).toEqual(['BRD'])
  })
})

/** The browser's calendar day of a date `offset` days from today, as `days[].day` gives it. */
const dayKey = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return localDay(d)
}
/** Today, `offset` days away, at `h` o'clock local. */
const at = (offset: number, h: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  d.setHours(h, 0, 0, 0)
  return d.toISOString()
}

describe('dashboard stats', () => {
  it('stats: 14 days oldest first with mine ≤ hours', async () => {
    const before = await api.dashboard.stats('ws-eng')
    expect(before.days.map((d) => d.day)).toEqual(Array.from({ length: 14 }, (_, i) => dayKey(i - 13)))
    expect(before.days.every((d) => d.mine <= d.hours + 1e-9)).toBe(true)

    // Mariam (Nexus Core, El Moasser) logs 2 h yesterday; Tarek logs 3 h on Mobile App, outside her scope.
    await as('u-3')
    const mine = await api.dashboard.stats('ws-eng')
    await api.time.addManual({ projectId: 'p-nex', startedAt: at(-1, 5), endedAt: at(-1, 7), note: 'yesterday' })
    await as('u-8')
    await api.time.addManual({ projectId: 'p-mob', startedAt: at(-1, 1), endedAt: at(-1, 4), note: 'not hers' })
    await as('u-3')
    const after = await api.dashboard.stats('ws-eng')
    expect(after.days[12].hours).toBeCloseTo(mine.days[12].hours + 2, 4)
    expect(after.days[12].mine).toBeCloseTo(mine.days[12].mine + 2, 4)
    // Admin sees both.
    await as('u-1')
    expect((await api.dashboard.stats('ws-eng')).days[12].hours).toBeCloseTo(before.days[12].hours + 5, 4)
  })

  it('stats: an entry is split at local midnight, and nothing before the 14 days counts', async () => {
    const before = await api.dashboard.stats('ws-eng')
    await as('u-3')
    await api.time.addManual({ projectId: 'p-nex', startedAt: at(-2, 22), endedAt: at(-1, 1), note: 'late' })
    await api.time.addManual({ projectId: 'p-nex', startedAt: at(-20, 9), endedAt: at(-20, 11), note: 'old' })
    await as('u-1')
    const after = await api.dashboard.stats('ws-eng')
    expect(after.days[11].hours).toBeCloseTo(before.days[11].hours + 2, 4)
    expect(after.days[12].hours).toBeCloseTo(before.days[12].hours + 1, 4)
    const total = (s: typeof after) => s.days.reduce((sum, d) => sum + d.hours, 0)
    expect(total(after)).toBeCloseTo(total(before) + 3, 4)
  })

  it('stats: byProject most first, in scope only, adding up to the days', async () => {
    const stats = await api.dashboard.stats('ws-eng')
    const hours = stats.byProject.map((p) => p.hours)
    expect(hours).toEqual([...hours].sort((a, b) => b - a))
    expect(hours.every((h) => h > 0)).toBe(true)
    expect(hours.reduce((s, h) => s + h, 0)).toBeCloseTo(stats.days.reduce((s, d) => s + d.hours, 0), 4)
    await as('u-8') // Mobile App only
    expect((await api.dashboard.stats('ws-eng')).byProject.every((p) => p.projectId === 'p-mob')).toBe(true)
  })

  it('stats: byStatus counts To do and In progress, and Done only when moved there in the last 14 days', async () => {
    const data = await db.read()
    const live = data.tickets.filter((t) => t.projectId !== 'p-brd' && !t.archivedAt)
    const before = await api.dashboard.stats('ws-eng')
    expect(before.byStatus.map((s) => s.category)).toEqual(['todo', 'inProgress', 'done'])
    const project = (id: string) => data.projects.find((p) => p.id === id)!
    expect(before.byStatus[0].count).toBe(live.filter((t) => categoryOf(project(t.projectId), t.status) === 'todo').length)
    expect(before.byStatus[1].count).toBe(live.filter((t) => categoryOf(project(t.projectId), t.status) === 'inProgress').length)

    // NEX-102 (To do) moves to Done now: one less To do, one more Done.
    await api.tasks.update('NEX-102', { status: 'done' })
    // A task that has been Done since it was made 30 days ago isn't recent.
    await db.update((d) => {
      const t = d.tickets.find((x) => x.key === 'NEX-103')!
      d.tickets.push({ ...t, id: 't-old-done', key: 'NEX-999', createdAt: at(-30, 9), updatedAt: at(-30, 9), status: 'done' })
    })
    const after = await api.dashboard.stats('ws-eng')
    expect(after.byStatus[0].count).toBe(before.byStatus[0].count - 1)
    expect(after.byStatus[2].count).toBe(before.byStatus[2].count + 1)
  })

  it('stats: overdue only in scope, due soonest first', async () => {
    const stats = await api.dashboard.stats('ws-eng')
    const data = await db.read()
    const now = new Date()
    const expected = data.tickets.filter((t) => t.projectId !== 'p-brd' && !t.archivedAt && taskView(t, data, now).overdue).map((t) => t.key)
    expect(stats.overdue.map((t) => t.key).sort()).toEqual(expected.sort())
    expect(expected.length).toBeGreaterThan(0)
    const dues = stats.overdue.map((t) => t.dueAt).filter((d): d is string => d !== null)
    expect(dues).toEqual([...dues].sort())
    expect(stats.overdue[0]).toEqual({ taskId: expect.any(String), key: expect.any(String), title: expect.any(String), projectId: expect.any(String), assigneeId: expect.toBeOneOf([expect.any(String), null]), dueAt: expect.toBeOneOf([expect.any(String), null]) })
    await as('u-8') // Mobile App only
    expect((await api.dashboard.stats('ws-eng')).overdue.every((t) => t.projectId === 'p-mob')).toBe(true)
  })

  it('stats carry no cost', async () => {
    expect(JSON.stringify(await api.dashboard.stats('ws-eng'))).not.toMatch(/cost|rate/i)
  })
})

