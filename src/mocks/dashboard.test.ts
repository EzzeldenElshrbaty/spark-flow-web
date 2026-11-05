import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
import { entryHours } from '@/lib/hours'
import { createDb, type MockDb } from './db'
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
    await as('u-5') // Salma, a Member
    await expect(api.dashboard.projects('ws-eng')).rejects.toMatchObject({ status: 403, detail: "You don't have access to the dashboard." })
    await expect(api.dashboard.workingNow('ws-eng')).rejects.toMatchObject({ status: 403, detail: "You don't have access to the dashboard." })
  })

  it('no cost for non-admins', async () => {
    expect((await api.dashboard.projects('ws-eng')).find((p) => p.key === 'NEX')!.cost).toBeGreaterThan(0)
    for (const userId of ['u-9', 'u-4', 'u-2']) {
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
  it('managing a project in another workspace opens no dashboard here', async () => {
    await api.users.viewAs('u-7') // Dina manages Brand Refresh (Spark Design) only
    await expect(api.dashboard.projects('ws-eng')).rejects.toMatchObject({ status: 403 })
    expect(await api.dashboard.projects('ws-design')).toHaveLength(1)
  })
})

