import type { WorkHours } from '@/api/types'

// Working hours (Admin and help, slice 5): what "late" and "left early" mean on Attendance. Shared by the mock and the
// page. Times are read in the hours' own time zone, so a browser elsewhere still counts Cairo's 9:00.

export const DEFAULT_WORK_HOURS: WorkHours = { days: [0, 1, 2, 3, 4], start: '09:00', end: '17:00', timeZone: 'Africa/Cairo' }

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const HM = /^([01]\d|2[0-3]):([0-5]\d)$/

const minutesOf = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3))

/** A moment's date (YYYY-MM-DD), weekday (0 = Sunday) and minutes after midnight in a time zone. */
export function zoned(iso: string, timeZone: string): { date: string; weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso))
  const part = (type: string) => parts.find((p) => p.type === type)!.value
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    weekday: DAY_NAMES.indexOf(part('weekday') as (typeof DAY_NAMES)[number]),
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
  }
}

/** In after the start, on a working day. */
export function isLate(inAt: string, hours: WorkHours): boolean {
  const { weekday, minutes } = zoned(inAt, hours.timeZone)
  return hours.days.includes(weekday) && minutes > minutesOf(hours.start)
}

/** Out before the end of the day's own working hours (the day of its first start); an out after midnight is never early. */
export function isEarly(inAt: string, outAt: string, hours: WorkHours): boolean {
  const start = zoned(inAt, hours.timeZone)
  const out = zoned(outAt, hours.timeZone)
  return hours.days.includes(start.weekday) && out.date === start.date && out.minutes < minutesOf(hours.end)
}

/** Minutes after midnight as a clock time: "9:05 AM". */
export function formatDayMinutes(total: number): string {
  const rounded = Math.round(total)
  const h = Math.floor(rounded / 60) % 24
  return `${h % 12 || 12}:${String(rounded % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** "Sun–Thu · 9:00 AM–5:00 PM · Cairo time": a run of days as a range, others listed. */
export function describeWorkHours(hours: WorkHours): string {
  const days = [...new Set(hours.days)].sort((a, b) => a - b)
  const run = days.length > 2 && days.every((d, i) => i === 0 || d === days[i - 1]! + 1)
  const dayText = run ? `${DAY_NAMES[days[0]!]}–${DAY_NAMES[days.at(-1)!]}` : days.map((d) => DAY_NAMES[d]).join(', ')
  const place = hours.timeZone.split('/').at(-1)!.replace(/_/g, ' ')
  return `${dayText} · ${formatDayMinutes(minutesOf(hours.start))}–${formatDayMinutes(minutesOf(hours.end))} · ${place} time`
}

/** The first rule a change breaks, as the sentence the form shows; null when it's fine. */
export function checkWorkHours(input: { days: unknown; start: unknown; end: unknown }): string | null {
  if (!Array.isArray(input.days) || input.days.length === 0) return 'Pick at least one working day.'
  if (!input.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return 'Pick days from Sunday to Saturday.'
  if (typeof input.start !== 'string' || typeof input.end !== 'string' || !HM.test(input.start) || !HM.test(input.end)) return 'Times are HH:MM, such as 09:00.'
  if (minutesOf(input.end) <= minutesOf(input.start)) return 'The day ends after it starts.'
  return null
}
