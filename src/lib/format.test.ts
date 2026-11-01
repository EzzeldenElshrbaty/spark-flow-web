import { describe, expect, it } from 'vitest'
import { elapsedMs, formatClock, formatHours, lastReplyWhen } from './format'

describe('elapsedMs and formatClock', () => {
  it('works the running time out from startedAt, never below zero', () => {
    expect(elapsedMs('2026-10-28T07:00:00Z', new Date('2026-10-28T08:05:09Z'))).toBe(3_909_000)
    expect(elapsedMs('2026-10-28T09:00:00Z', new Date('2026-10-28T08:00:00Z'))).toBe(0)
  })
  it('shows h:mm:ss', () => {
    expect(formatClock(3_909_000)).toBe('1:05:09')
    expect(formatClock(0)).toBe('0:00:00')
    expect(formatClock(43_200_000)).toBe('12:00:00')
  })
})

describe('formatHours', () => {
  it('one decimal, no trailing .0', () => {
    expect(formatHours(7.5)).toBe('7.5h')
    expect(formatHours(115)).toBe('115h')
    expect(formatHours(0.04)).toBe('0h')
    expect(formatHours(2.25)).toBe('2.3h')
  })
})

describe('lastReplyWhen (spec 6.7 thread summary)', () => {
  const now = new Date(2026, 9, 29, 15, 0)
  it('says the time on the same day, "yesterday at" the day before, and whole days after that', () => {
    expect(lastReplyWhen(new Date(2026, 9, 29, 9, 41).toISOString(), now)).toBe('today at 9:41 AM')
    expect(lastReplyWhen(new Date(2026, 9, 28, 23, 5).toISOString(), now)).toBe('yesterday at 11:05 PM')
    expect(lastReplyWhen(new Date(2026, 9, 24, 16, 0).toISOString(), now)).toBe('5 days ago')
  })
})
