import { describe, expect, it } from 'vitest'
import { checkWorkHours, DEFAULT_WORK_HOURS, describeWorkHours, formatDayMinutes, isEarly, isLate, zoned } from './workHours'

// Working hours (Admin and help, slice 5): late and early are read in the hours' own time zone, on working days only.

describe('working hours', () => {
  it('reads a moment as its weekday and minutes in the time zone', () => {
    // 1 Nov 2026 is a Sunday; Cairo is UTC+2 in November.
    expect(zoned('2026-11-01T07:15:00.000Z', 'Africa/Cairo')).toEqual({ date: '2026-11-01', weekday: 0, minutes: 9 * 60 + 15 })
    expect(zoned('2026-11-05T22:30:00.000Z', 'Africa/Cairo')).toEqual({ date: '2026-11-06', weekday: 5, minutes: 30 })
  })

  it('late is in after the start on a working day; early is out before the end', () => {
    expect(isLate('2026-11-01T07:00:00.000Z', DEFAULT_WORK_HOURS)).toBe(false) // 9:00 exactly
    expect(isLate('2026-11-01T07:01:00.000Z', DEFAULT_WORK_HOURS)).toBe(true)
    expect(isLate('2026-11-06T09:00:00.000Z', DEFAULT_WORK_HOURS)).toBe(false) // Friday: not a working day
    const sunday = '2026-11-01T07:00:00.000Z'
    expect(isEarly(sunday, '2026-11-01T14:59:00.000Z', DEFAULT_WORK_HOURS)).toBe(true) // 4:59 PM
    expect(isEarly(sunday, '2026-11-01T15:00:00.000Z', DEFAULT_WORK_HOURS)).toBe(false)
    expect(isEarly('2026-11-07T07:00:00.000Z', '2026-11-07T10:00:00.000Z', DEFAULT_WORK_HOURS)).toBe(false) // Saturday
    // Worked past midnight into Monday: out at 12:30 AM is late, not early; nor is Friday's check-out of Thursday's day.
    expect(isEarly(sunday, '2026-11-01T22:30:00.000Z', DEFAULT_WORK_HOURS)).toBe(false)
    expect(isEarly('2026-11-05T07:00:00.000Z', '2026-11-06T08:00:00.000Z', DEFAULT_WORK_HOURS)).toBe(false)
  })

  it('says them in a line and minutes as a clock time', () => {
    expect(describeWorkHours(DEFAULT_WORK_HOURS)).toBe('Sun–Thu · 9:00 AM–5:00 PM · Cairo time')
    expect(describeWorkHours({ ...DEFAULT_WORK_HOURS, days: [0, 2, 4] })).toBe('Sun, Tue, Thu · 9:00 AM–5:00 PM · Cairo time')
    expect(formatDayMinutes(0)).toBe('12:00 AM')
    expect(formatDayMinutes(13 * 60 + 5)).toBe('1:05 PM')
  })

  it('refuses no days, a bad time, or an end before the start', () => {
    expect(checkWorkHours({ days: [], start: '09:00', end: '17:00' })).toBe('Pick at least one working day.')
    expect(checkWorkHours({ days: [0], start: '9am', end: '17:00' })).toBe('Times are HH:MM, such as 09:00.')
    expect(checkWorkHours({ days: [0, 7], start: '09:00', end: '17:00' })).toBe('Pick days from Sunday to Saturday.')
    expect(checkWorkHours({ days: [0], start: '17:00', end: '09:00' })).toBe('The day ends after it starts.')
    expect(checkWorkHours({ days: [4, 0, 0], start: '08:30', end: '16:30' })).toBeNull()
  })
})
