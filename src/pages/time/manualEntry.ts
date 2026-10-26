import type { NewManualEntry } from '@/api/types'

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
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) errors.end = 'The end is before the start.'
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
