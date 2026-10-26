import { describe, expect, it } from 'vitest'
import { elapsedMs, formatClock, formatHours } from './format'

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
