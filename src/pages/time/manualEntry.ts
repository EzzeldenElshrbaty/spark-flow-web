import type { NewManualEntry } from '@/api/types'
import { localDay } from '@/lib/dates'

export type ManualEntryValues = { day: string /* YYYY-MM-DD */; start: string /* HH:mm */; end: string; note: string; taskId: string | null; projectId: string }
export type ManualEntryErrors = Partial<Record<'end' | 'note' | 'task', string>>

const HOUR = 3_600_000
const at = (day: string, time: string) => new Date(`${day}T${time}:00`) // local time, as the person typed it

/** The Add time form's own checks, worded like the server's; the server alone checks overlaps. */
export function manualEntryErrors(v: ManualEntryValues, now: Date): ManualEntryErrors {
  const errors: ManualEntryErrors = {}
  if (!v.projectId) errors.task = 'Pick a project.'
  const start = at(v.day, v.start).getTime()
  const end = at(v.day, v.end).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end === start) errors.end = 'The end is before the start.'
  // On one day, an end earlier on the clock means the work ran past midnight.
  else if (end < start) errors.end = "An entry can't run past midnight. Add it as two entries."
  else if (end > now.getTime()) errors.end = "Time can't be logged in the future."
  else if (end - start > 12 * HOUR) errors.end = 'One entry can be up to 12 hours.'
  if (v.note.trim().length > 200) errors.note = 'Keep the note under 200 characters.'
  return errors
}

/** The form's values as the API takes them: a task when one is picked, else the project. */
export function toManualEntry(v: ManualEntryValues): NewManualEntry {
  const times = { startedAt: at(v.day, v.start).toISOString(), endedAt: at(v.day, v.end).toISOString(), note: v.note.trim() }
  return v.taskId ? { taskId: v.taskId, ...times } : { projectId: v.projectId, ...times }
}

const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** The form's starting values: the hour before now, rounded down to 15 minutes; just after midnight, late yesterday. */
export function defaultTimes(now: Date): { day: string; start: string; end: string } {
  const end = new Date(now)
  end.setMinutes(Math.floor(end.getMinutes() / 15) * 15, 0, 0)
  const start = new Date(end.getTime() - 3_600_000)
  if (localDay(start) === localDay(now)) return { day: localDay(now), start: hhmm(start), end: hhmm(end) }
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  return { day: localDay(yesterday), start: '22:45', end: '23:45' }
}
