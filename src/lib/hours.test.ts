import { describe, expect, it } from 'vitest'
import { runningClock } from './hours'

describe('runningClock', () => {
  const start = '2026-10-26T08:00:00.000Z'
  it('counts up to now', () => {
    expect(runningClock(start, new Date('2026-10-26T09:30:00.000Z'))).toEqual({ ms: 90 * 60_000, capped: false })
  })
  it('the running clock stops at 12 h and says so', () => {
    expect(runningClock(start, new Date('2026-10-26T21:00:00.000Z'))).toEqual({ ms: 12 * 3_600_000, capped: true })
  })
})
