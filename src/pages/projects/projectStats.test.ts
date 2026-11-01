import { describe, expect, it } from 'vitest'
import type { ProjectSummary } from '@/api/types'
import { dueLate, isLate, projectStats } from './projectStats'

const now = new Date('2026-10-26T12:00:00Z')
const p = (over: Partial<ProjectSummary>): ProjectSummary =>
  ({ id: 'p', key: 'P', status: 'active', dueDate: '2026-12-01T00:00:00Z', overdueCount: 0, ...over }) as ProjectSummary

describe('projectStats', () => {
  it('counts and filters by the four tiles', () => {
    const list = [
      p({ id: 'a' }), // active, fine
      p({ id: 'b', overdueCount: 2 }), // active, late
      p({ id: 'c', dueDate: '2026-10-30T00:00:00Z' }), // due this month
      p({ id: 'd', status: 'delivered', dueDate: '2026-10-01T00:00:00Z' }), // delivered: never late, not "due this month"
      p({ id: 'e', status: 'planned', dueDate: '2026-10-20T00:00:00Z' }), // past due, not delivered → late, due this month
    ]
    const stats = projectStats(list, now)
    expect(stats.counts).toEqual({ active: 3, overdue: 2, month: 2, onHold: 0 })
    expect(stats.filter('overdue').map((x) => x.id)).toEqual(['b', 'e'])
    expect(stats.filter(null)).toHaveLength(5)
    expect(stats.filter(null)).not.toBe(list)
  })

  it('counts on-hold projects', () => {
    expect(projectStats([p({ status: 'onHold' }), p({})], now).counts.onHold).toBe(1)
  })

  it('the due date is late only when past (the whole day) and not delivered, whatever the tasks say', () => {
    expect(dueLate(p({ overdueCount: 3 }), now)).toBe(false)
    expect(dueLate(p({ dueDate: '2026-10-26T00:00:00.000Z' }), now)).toBe(false) // due today
    expect(dueLate(p({ dueDate: '2026-10-20T00:00:00Z' }), now)).toBe(true)
    expect(dueLate(p({ dueDate: '2026-10-20T00:00:00Z', status: 'delivered' }), now)).toBe(false)
  })

  it('a delivered project past its date is not late', () => {
    expect(isLate(p({ status: 'delivered', dueDate: '2026-01-01T00:00:00Z' }), now)).toBe(false)
  })
})
