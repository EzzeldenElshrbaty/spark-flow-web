import { formatTime } from '@/lib/format'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** A Remind me choice (spec 6.5): its label, the time it means, and the hint shown after it ("9:00 AM"). */
export type RemindPreset = { label: string; at: Date; hint: string | null }

/** 9:00 AM local, `days` days from `now`'s date. */
const nineAm = (now: Date, days: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 9, 0)

/** Days from `now` to the next Monday; on a Monday, the one after. */
const toMonday = (now: Date) => ((8 - now.getDay()) % 7) || 7

/** In 20 minutes, In 1 hour, In 3 hours, Tomorrow (9:00 AM), Next week (Mon 9:00 AM), in the viewer's time zone. */
export function remindPresets(now: Date): RemindPreset[] {
  const later = (minutes: number) => new Date(now.getTime() + minutes * MINUTE)
  const monday = toMonday(now)
  return [
    { label: 'In 20 minutes', at: later(20), hint: null },
    { label: 'In 1 hour', at: later(60), hint: null },
    { label: 'In 3 hours', at: later(180), hint: null },
    { label: 'Tomorrow', at: nineAm(now, 1), hint: formatTime(nineAm(now, 1)) },
    { label: 'Next week', at: nineAm(now, monday), hint: `Mon ${formatTime(nineAm(now, monday))}` },
  ]
}

/** The Schedule menu's times (spec 6.8): Tomorrow at 9:00 AM and Monday at 9:00 AM, in the viewer's time zone. */
export function schedulePresets(now: Date): { label: string; at: Date }[] {
  return [
    { label: 'Tomorrow at 9:00 AM', at: nineAm(now, 1) },
    { label: 'Monday at 9:00 AM', at: nineAm(now, toMonday(now)) },
  ]
}

/** What's wrong with a Custom… time (a datetime-local value), or null when it can be used. */
export function customRemindError(value: string, now: Date): string | null {
  const time = value ? new Date(value).getTime() : NaN
  if (Number.isNaN(time)) return 'Pick a date and time.'
  if (time <= now.getTime()) return 'Pick a time in the future.'
  return null
}

/** Whether a reminder is due within 24 hours, or already past (spec 6.12: shown in accent). */
export const dueSoon = (iso: string, now: Date): boolean => new Date(iso).getTime() - now.getTime() <= DAY
