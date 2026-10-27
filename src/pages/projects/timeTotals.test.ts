import { describe, expect, it } from 'vitest'
import type { Rate, TimeEntry } from '@/api/types'
import { totalsByPerson, emptyTimeText, showPrivacyNote, timeHeading } from './timeTotals'
import { formatMoney } from '@/lib/format'

const now = new Date('2026-10-26T12:00:00Z')
const e = (userId: string, startedAt: string, endedAt: string | null): TimeEntry => ({ id: Math.random().toString(), userId, projectId: 'p', taskId: null, startedAt, endedAt, source: 'manual', note: '' })

describe('totalsByPerson', () => {
  const entries = [
    e('a', '2026-10-26T08:00:00Z', '2026-10-26T10:00:00Z'), // 2 h
    e('b', '2026-10-25T09:00:00Z', '2026-10-25T10:30:00Z'), // 1.5 h
    e('a', '2026-10-26T11:00:00Z', null), // running: 1 h so far
  ]
  it('sums hours per person, most hours first, with cost when rates are given (missing rate costs 0)', () => {
    const rates: Rate[] = [{ id: 'r-a', userId: 'a', hourlyCost: 300, currency: 'EGP', effectiveFrom: '1970-01-01T00:00:00.000Z' }]
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

describe('timeHeading and emptyTimeText', () => {
  it('who sees everyone gets the project total; anyone else their share of it', () => {
    expect(timeHeading(true, { hours: 120, cost: 9000 }, 120)).toBe(`120h logged · ${formatMoney(9000)}`)
    expect(timeHeading(true, { hours: 120, cost: null }, 120)).toBe('120h logged')
    expect(timeHeading(false, { hours: 6, cost: null }, 120.04)).toBe('Your time · 6h of 120h logged')
  })

  it('an empty list says whose time is missing', () => {
    expect(emptyTimeText(true, 0)).toBe('No time logged yet.')
    expect(emptyTimeText(false, 0)).toBe('No time logged yet.')
    expect(emptyTimeText(false, 120)).toBe("You haven't logged time here. The project has 120h logged.")
  })

  it('the privacy line waits for the account, and is only for people who see their own time', () => {
    expect(showPrivacyNote(false, true)).toBe(false)
    expect(showPrivacyNote(true, false)).toBe(false)
    expect(showPrivacyNote(false, false)).toBe(true)
  })
  it('totals add up exactly; rounding is for the screen', () => {
    const third = (userId: string) => ({ id: userId, userId, projectId: 'p', taskId: null, startedAt: '2026-10-20T08:00:00.000Z', endedAt: '2026-10-20T08:20:00.000Z', source: 'manual' as const, note: '' })
    const r = (userId: string) => ({ id: `r-${userId}`, userId, hourlyCost: 100, currency: 'EGP' as const, effectiveFrom: '1970-01-01T00:00:00.000Z' })
    const t = totalsByPerson([third('a'), third('b')], [r('a'), r('b')], new Date('2026-10-21T00:00:00Z'))
    expect(t.cost).toBeCloseTo(66.667, 2)
    expect(t.hours).toBeCloseTo(0.6667, 3)
  })
})

