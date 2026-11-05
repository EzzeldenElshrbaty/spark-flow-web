import { describe, expect, it } from 'vitest'
import type { TaskView, TimeEntry } from '@/api/types'
import { daySummary, dueTodayOrOverdue, greeting } from './myDay'

const at = (h: number, m = 0, dayOffset = 0) => new Date(2026, 9, 28 + dayOffset, h, m)
const entry = (start: Date, end: Date | null): TimeEntry => ({ id: Math.random().toString(), userId: 'u', projectId: 'p', taskId: null, startedAt: start.toISOString(), endedAt: end?.toISOString() ?? null, source: 'timer', note: '', endReason: null })
const task = (over: Partial<TaskView>): TaskView => ({ id: over.key ?? 'x', key: 'P-1', status: 'todo', category: over.status === 'done' ? 'done' : 'todo', assigneeId: 'me', dueAt: null, overdue: false, ...over }) as TaskView

describe('greeting', () => {
  it('by the hour, first name only', () => {
    expect(greeting(at(9), 'Nour El-Sayed')).toBe('Good morning, Nour')
    expect(greeting(at(13), 'Nour El-Sayed')).toBe('Good afternoon, Nour')
    expect(greeting(at(18), 'Nour El-Sayed')).toBe('Good evening, Nour')
  })
})

describe('daySummary', () => {
  it('sums the day, a running entry up to now', () => {
    const now = at(12)
    expect(daySummary([entry(at(11, 30), null), entry(at(7), at(11))], now)).toEqual({ hours: 4.5, first: at(7).toISOString(), last: now.toISOString() })
    expect(daySummary([], now)).toEqual({ hours: 0, first: null, last: null })
  })
})

describe('dueTodayOrOverdue', () => {
  it("keeps my open tasks that are overdue or due today, in My tasks' order", () => {
    const now = at(10)
    const tasks = [
      task({ key: 'P-4', dueAt: '2026-10-29T00:00:00.000Z' }), // tomorrow (dates are stored as UTC midnight of the day)
      task({ key: 'P-3', dueAt: '2026-10-28T00:00:00.000Z' }), // today
      task({ key: 'P-2', overdue: true, dueAt: '2026-10-26T00:00:00.000Z' }),
      task({ key: 'P-1', status: 'done', dueAt: '2026-10-28T00:00:00.000Z' }),
      task({ key: 'P-0', assigneeId: 'other', dueAt: '2026-10-28T00:00:00.000Z' }),
      task({ key: 'P-5', overdue: true }), // over its estimate, no date
    ]
    expect(dueTodayOrOverdue(tasks, 'me', now).map((t) => t.key)).toEqual(['P-2', 'P-5', 'P-3'])
  })
})
