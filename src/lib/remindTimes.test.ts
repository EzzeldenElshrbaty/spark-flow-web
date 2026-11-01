import { describe, expect, it } from 'vitest'
import { customRemindError, dueSoon, remindPresets, schedulePresets } from '@/lib/remindTimes'

// A Wednesday, 14:10 local time.
const now = new Date(2030, 0, 2, 14, 10)

describe('remindPresets (spec 6.5 Remind me submenu)', () => {
  it('In 20 minutes, In 1 hour, In 3 hours, Tomorrow 9:00 AM, Next week Monday 9:00 AM, in local time', () => {
    expect(remindPresets(now).map((p) => [p.label, p.at.getTime()])).toEqual([
      ['In 20 minutes', new Date(2030, 0, 2, 14, 30).getTime()],
      ['In 1 hour', new Date(2030, 0, 2, 15, 10).getTime()],
      ['In 3 hours', new Date(2030, 0, 2, 17, 10).getTime()],
      ['Tomorrow', new Date(2030, 0, 3, 9, 0).getTime()],
      ['Next week', new Date(2030, 0, 7, 9, 0).getTime()],
    ])
    expect(remindPresets(now).map((p) => p.hint)).toEqual([null, null, null, '9:00 AM', 'Mon 9:00 AM'])
  })

  it('on a Monday, next week is the Monday after', () => {
    const monday = new Date(2030, 0, 7, 8, 0)
    expect(remindPresets(monday).at(-1)!.at.getTime()).toBe(new Date(2030, 0, 14, 9, 0).getTime())
  })
})

describe('customRemindError (Custom…)', () => {
  it('asks for a date and time, then for one in the future', () => {
    expect(customRemindError('', now)).toBe('Pick a date and time.')
    expect(customRemindError('2030-01-02T14:00', now)).toBe('Pick a time in the future.')
    expect(customRemindError('2030-01-02T14:30', now)).toBeNull()
  })
})

describe('dueSoon (spec 6.12: the reminder time is accent within 24h)', () => {
  it('within the next 24 hours, or already past', () => {
    expect(dueSoon(new Date(2030, 0, 3, 14, 0).toISOString(), now)).toBe(true)
    expect(dueSoon(new Date(2030, 0, 3, 14, 20).toISOString(), now)).toBe(false)
    expect(dueSoon(new Date(2030, 0, 1, 9, 0).toISOString(), now)).toBe(true)
  })
})

describe('schedulePresets (spec 6.8 Schedule menu)', () => {
  it('Tomorrow at 9:00 AM and Monday at 9:00 AM, local time; on a Monday, the next one', () => {
    expect(schedulePresets(now).map((p) => [p.label, p.at.getTime()])).toEqual([
      ['Tomorrow at 9:00 AM', new Date(2030, 0, 3, 9, 0).getTime()],
      ['Monday at 9:00 AM', new Date(2030, 0, 7, 9, 0).getTime()],
    ])
    expect(schedulePresets(new Date(2030, 0, 7, 8, 0))[1].at.getTime()).toBe(new Date(2030, 0, 14, 9, 0).getTime())
  })
})
