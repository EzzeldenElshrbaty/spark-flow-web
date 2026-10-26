import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
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
    await expect(api.dashboard.checkedIn('ws-eng')).rejects.toMatchObject({ status: 403, detail: "You don't have access to the dashboard." })
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

  it('checked in now', async () => {
    await as('u-8')
    await api.time.checkIn({ plan: 'x', target: { taskId: 't-mob-104' } })
    await as('u-1')
    expect((await api.dashboard.checkedIn('ws-eng')).find((c) => c.userId === 'u-8')?.running?.taskId).toBe('t-mob-104')
    await as('u-4') // manages MOB
    expect((await api.dashboard.checkedIn('ws-eng')).some((c) => c.userId === 'u-8')).toBe(true)
    await as('u-2') // NEX and ELM only
    expect((await api.dashboard.checkedIn('ws-eng')).some((c) => c.userId === 'u-8')).toBe(false)
    await as('u-9') // Sales
    expect(await api.dashboard.checkedIn('ws-eng')).toEqual([])
    await as('u-8')
    await api.time.checkOut()
    await as('u-1')
    expect((await api.dashboard.checkedIn('ws-eng')).some((c) => c.userId === 'u-8')).toBe(false)
  })
})
