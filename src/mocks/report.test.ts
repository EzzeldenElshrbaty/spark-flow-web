import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api, Rate, TimeEntry } from '@/api/types'
import { createDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { buildReport } from './report'
import { seed } from './seed'
import { createMemoryStore } from './store'

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m) // October 2026, local time
const e = (userId: string, projectId: string, start: Date, end: Date | null): TimeEntry => ({ id: Math.random().toString(), userId, projectId, taskId: null, startedAt: start.toISOString(), endedAt: end?.toISOString() ?? null, source: 'manual', note: '', endReason: null })
const rates: Rate[] = [
  { id: 'r-a', userId: 'a', hourlyCost: 100, currency: 'EGP', effectiveFrom: '1970-01-01T00:00:00.000Z' },
  { id: 'r-b', userId: 'b', hourlyCost: 300, currency: 'EGP', effectiveFrom: '1970-01-01T00:00:00.000Z' },
]
const from = at(18, 0) // Sunday 18 Oct
const to = at(28, 12) // Wednesday 28 Oct, noon

describe('buildReport', () => {
  it('totals agree', () => {
    const r = buildReport([e('a', 'p1', at(20, 9), at(20, 12)), e('b', 'p2', at(26, 9), at(26, 11)), e('a', 'p2', at(27, 8), at(27, 9)), e('c', 'p1', at(27, 10), at(27, 11))], rates, ['p1', 'p2'], from, to)
    expect(r.totals).toMatchObject({ hours: 7, cost: 300 + 600 + 100 + 0, people: 3 })
    for (const group of [r.byProject, r.byPerson, r.byWeek]) {
      expect(group.reduce((s, x) => s + x.hours, 0)).toBeCloseTo(r.totals.hours)
      expect(group.reduce((s, x) => s + x.cost, 0)).toBeCloseTo(r.totals.cost)
    }
    expect(r.byProject.map((x) => x.projectId)).toEqual(['p1', 'p2']) // 4h before 3h
    expect(r.byPerson.find((x) => x.userId === 'c')).toMatchObject({ rate: 0, cost: 0, hours: 1 })
  })

  it('clips at the edges', () => {
    const r = buildReport([e('a', 'p1', new Date(from.getTime() - 3_600_000), new Date(from.getTime() + 3_600_000)), e('a', 'p1', at(24, 23), at(25, 1))], rates, ['p1'], from, to)
    expect(r.totals.hours).toBeCloseTo(3)
    // Saturday 23:00 to Sunday 01:00: one hour in each week.
    expect(r.byWeek.map((w) => [new Date(w.weekStart).getDate(), w.hours])).toEqual([
      [18, 2],
      [25, 1],
    ])
  })

  it('running entries count to now, at most 12 h; other workspaces are left out', () => {
    const r = buildReport([e('a', 'p1', at(28, 10), null), e('a', 'p1', at(26, 6), null), e('a', 'other', at(27, 9), at(27, 10))], rates, ['p1'], from, to)
    expect(r.totals.hours).toBeCloseTo(2 + 12)
  })

  it('empty', () => {
    const r = buildReport([], rates, ['p1'], from, to)
    expect(r.totals).toEqual({ hours: 0, cost: 0, people: 0 })
    expect(r.byProject).toEqual([])
    expect(r.byWeek.map((w) => w.hours)).toEqual([0, 0])
  })
})

describe('time.report', () => {
  let api: Api
  let hub: MockHub
  beforeEach(() => {
    latency.min = latency.max = 0
    hub = createMockHub(`test-report-${Math.random()}`, null)
    api = createMockApi(createDb(createMemoryStore(), seed), hub)
  })
  afterEach(() => hub.close())

  it('admin only', async () => {
    expect((await api.time.report('ws-eng', 30)).totals.cost).toBeGreaterThan(0)
    for (const userId of ['u-9', 'u-4']) {
      await api.users.viewAs(userId)
      await expect(api.time.report('ws-eng', 30)).rejects.toMatchObject({ status: 403, detail: "You don't have access to time and cost." })
    }
  })
})
