import { describe, expect, it } from 'vitest'
import { dayTicks, elapsedMs, formatClock, formatDateTime, formatDayAt, formatDayDivider, formatDayMonth, formatHours, formatWeekdayDay, lastReplyWhen } from './format'

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

describe('dates through one place (UX Phase 3, 3.4)', () => {
  // Local times: the helpers read the person's own day, like formatTime.
  const now = new Date(2026, 10, 9, 10, 0) // Mon 9 Nov 2026

  it('a chat day divider: Today, Yesterday, then the full day, with the year only when it isn’t this one', () => {
    expect(formatDayDivider(new Date(2026, 10, 9, 8, 0), now)).toBe('Today')
    expect(formatDayDivider(new Date(2026, 10, 8, 23, 0), now)).toBe('Yesterday')
    expect(formatDayDivider(new Date(2026, 10, 4, 12, 0), now)).toBe('Wednesday 4 November')
    expect(formatDayDivider(new Date(2025, 9, 23, 12, 0), now)).toBe('Thursday 23 October 2025')
  })

  it('a message’s full time: "Wed 4 Nov 2026, 2:00 PM"', () => {
    expect(formatDateTime(new Date(2026, 10, 4, 14, 0))).toBe('Wed 4 Nov 2026, 2:00 PM')
  })

  it('when something happens: today at, tomorrow at, else the short day', () => {
    expect(formatDayAt(new Date(2026, 10, 9, 14, 0), now)).toBe('today at 2:00 PM')
    expect(formatDayAt(new Date(2026, 10, 10, 9, 0), now)).toBe('tomorrow at 9:00 AM')
    expect(formatDayAt(new Date(2026, 10, 16, 9, 0), now)).toBe('Mon 16 Nov at 9:00 AM')
  })

  it('short days: "3 Oct" (a date-only value read in UTC when asked) and "Fri 23 Oct"', () => {
    expect(formatDayMonth(new Date(2026, 9, 3, 12, 0))).toBe('3 Oct')
    expect(formatDayMonth('2026-10-03T00:00:00.000Z', { utc: true })).toBe('3 Oct')
    expect(formatWeekdayDay(new Date(2026, 9, 23, 12, 0))).toBe('Fri 23 Oct')
  })

  it('chart days: the month on the first and on each 1st', () => {
    const days = [new Date(2026, 9, 30), new Date(2026, 9, 31), new Date(2026, 10, 1), new Date(2026, 10, 2)]
    expect(dayTicks(days)).toEqual(['30 Oct', '31', '1 Nov', '2'])
  })
})

describe('formatClipLength (chat spec 6.9)', () => {
  it('shows m:ss', async () => {
    const { formatClipLength } = await import('./format')
    expect([0, 42_400, 245_000, 750_000].map(formatClipLength)).toEqual(['0:00', '0:42', '4:05', '12:30'])
  })
})
