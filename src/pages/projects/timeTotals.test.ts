import { describe, expect, it } from 'vitest'
import type { Rate, TimeEntry } from '@/api/types'
import { totalsByPerson } from './timeTotals'

const now = new Date('2026-10-26T12:00:00Z')
const e = (userId: string, startedAt: string, endedAt: string | null): TimeEntry => ({ id: Math.random().toString(), userId, projectId: 'p', taskId: null, startedAt, endedAt, source: 'manual', note: '' })

describe('totalsByPerson', () => {
  const entries = [
    e('a', '2026-10-26T08:00:00Z', '2026-10-26T10:00:00Z'), // 2 h
    e('b', '2026-10-25T09:00:00Z', '2026-10-25T10:30:00Z'), // 1.5 h
    e('a', '2026-10-26T11:00:00Z', null), // running: 1 h so far
  ]
  it('sums hours per person, most hours first, with cost when rates are given (missing rate costs 0)', () => {
    const rates: Rate[] = [{ userId: 'a', hourlyCost: 300, currency: 'EGP' }]
    expect(totalsByPerson(entries, rates, now)).toEqual({
      people: [
        { userId: 'a', hours: 3, cost: 900 },
        { userId: 'b', hours: 1.5, cost: 0 },
      ],
      hours: 4.5,
      cost: 900,
    })
  })
  it('leaves cost null without rates', () => {
    const totals = totalsByPerson(entries, null, now)
    expect(totals.cost).toBeNull()
    expect(totals.people.every((p) => p.cost === null)).toBe(true)
  })
})
