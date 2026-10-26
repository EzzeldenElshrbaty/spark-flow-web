import { describe, expect, it } from 'vitest'
import { isPastDue, localDay, weekStart } from './dates'

describe('isPastDue', () => {
  it('a due date counts as the whole of that day', () => {
    const due = '2026-10-27T00:00:00.000Z'
    expect(isPastDue(due, new Date('2026-10-27T08:00:00Z'))).toBe(false) // due today
    expect(isPastDue(due, new Date('2026-10-27T23:59:59Z'))).toBe(false)
    expect(isPastDue(due, new Date('2026-10-28T00:00:01Z'))).toBe(true)
    expect(isPastDue('2026-10-27T15:30:00Z', new Date('2026-10-27T20:00:00Z'))).toBe(false) // a time on the day still means the day
  })
})

describe('localDay', () => {
  it("is the browser's own calendar day", () => {
    expect(localDay(new Date(2026, 9, 28, 23, 30))).toBe('2026-10-28')
    expect(localDay(new Date(2026, 0, 5, 0, 10))).toBe('2026-01-05')
  })
})

describe('weekStart', () => {
  it('is the Sunday at midnight, local time, that starts the week', () => {
    expect(weekStart(new Date(2026, 9, 28, 15))).toEqual(new Date(2026, 9, 25)) // Wednesday → Sunday 25 Oct
    expect(weekStart(new Date(2026, 9, 25, 0, 30))).toEqual(new Date(2026, 9, 25))
  })
})
