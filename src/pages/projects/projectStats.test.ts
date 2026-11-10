import { describe, expect, it } from 'vitest'
import type { ProjectSummary } from '@/api/types'
import { behindSchedule, dueLate, dueText, isLate, progressTone, projectStats, finishHint } from './projectStats'

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

describe('red only when late (UX Phase 3, 3.3)', () => {
  const now = new Date('2026-11-09T10:00:00.000Z')
  const at = (over: Partial<ProjectSummary>) => ({ status: 'active', dueDate: '2026-12-01T00:00:00.000Z', expectedFinish: '2026-11-20T00:00:00.000Z', progress: 0.2, ...over }) as ProjectSummary
  it('behind schedule: past due, or expected to finish after its due date; never once delivered', () => {
    expect(behindSchedule(at({}), now)).toBe(false)
    expect(behindSchedule(at({ dueDate: '2026-11-01T00:00:00.000Z' }), now)).toBe(true)
    expect(behindSchedule(at({ expectedFinish: '2026-12-05T00:00:00.000Z' }), now)).toBe(true)
    expect(behindSchedule(at({ status: 'delivered', dueDate: '2026-11-01T00:00:00.000Z' }), now)).toBe(false)
  })
  it('a progress bar is grey on time, red when behind, green when done', () => {
    expect(progressTone(at({}), now)).toBe('neutral')
    expect(progressTone(at({ expectedFinish: '2026-12-05T00:00:00.000Z' }), now)).toBe('danger')
    expect(progressTone(at({ progress: 1, dueDate: '2026-11-01T00:00:00.000Z' }), now)).toBe('success')
  })
})

describe('finishHint (UX Phase 4, 4.10)', () => {
  const now = new Date('2026-11-09T10:00:00.000Z')
  const p = (expectedFinish: string | null, dueDate = '2026-12-04T00:00:00.000Z') => ({ status: 'active', dueDate, expectedFinish }) as never
  it('"On time" when it’s expected to finish the day it’s due', () => expect(finishHint(p('2026-12-04T15:00:00.000Z'), now)).toBe('On time'))
  it('the due date otherwise, and "late" when behind', () => {
    expect(finishHint(p('2026-11-30T00:00:00.000Z'), now)).toBe('Due 4 Dec 2026')
    expect(finishHint(p('2026-12-20T00:00:00.000Z'), now)).toBe('Due 4 Dec 2026 · late')
  })
})

describe('finishHint past the due date (final review)', () => {
  it('a project past due and not delivered is late, never "On time", even when expected to finish that day', () => {
    const now = new Date('2026-11-09T10:00:00.000Z')
    expect(finishHint({ status: 'active', dueDate: '2026-11-03T00:00:00.000Z', expectedFinish: '2026-11-03T00:00:00.000Z' } as never, now)).toBe('Due 3 Nov 2026 · late')
  })
})

describe('dueText (UX Phase 5B, 5.10): late in words, not only red', () => {
  it('adds "· late" to a late date, as finishHint does', () => {
    expect(dueText('2026-10-03T12:00:00.000Z', true)).toBe('3 Oct 2026 · late')
    expect(dueText('2026-10-03T12:00:00.000Z', false)).toBe('3 Oct 2026')
  })
})
