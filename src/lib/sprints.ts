import type { Sprint, TaskView } from '@/api/types'

// The sprint rules the mock backend and the sheets share (sprints spec). A sprint's days are the runtime's local days:
// `startDate` is the start of its first day and `endDate` the end (23:59:59.999) of its last.

const DAY = 86_400_000
/** A new sprint runs two weeks, counting its first and last day. */
const SPRINT_DAYS = 14

/** Local 00:00 of the day `plusDays` after `date`'s. */
function dayStart(date: Date, plusDays = 0): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + plusDays)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Local 23:59:59.999 of the day `plusDays` after `date`'s. */
function dayEnd(date: Date, plusDays = 0): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + plusDays)
  d.setHours(23, 59, 59, 999)
  return d
}

/** Whole local days from `from`'s day to `to`'s (negative when `to` is earlier); a clock change doesn't shift it. */
function daysBetween(from: Date, to: Date): number {
  const utc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((utc(to) - utc(from)) / DAY)
}

/** The next sprint's name: the highest trailing number among the names, plus one ("Sprint 16"), "Sprint 1" if none has a number. */
export function nextSprintName(names: string[]): string {
  const highest = names.reduce((max, name) => {
    const found = /(\d+)\D*$/.exec(name)
    return found ? Math.max(max, Number(found[1])) : max
  }, 0)
  return `Sprint ${highest + 1}`
}

/** Two weeks from the day after the latest sprint ends (from today when that day is past, or there's no sprint). */
export function defaultSprintDates(sprints: Pick<Sprint, 'endDate'>[], now: Date): { startDate: string; endDate: string } {
  const today = dayStart(now)
  const ends = sprints.map((s) => new Date(s.endDate).getTime()).filter(Number.isFinite)
  const after = ends.length > 0 ? dayStart(new Date(Math.max(...ends)), 1) : today
  const start = after.getTime() > today.getTime() ? after : today
  return { startDate: start.toISOString(), endDate: dayEnd(start, SPRINT_DAYS - 1).toISOString() }
}

export type SprintForm = { name: string; goal: string; startDate: string; endDate: string }

/** What's wrong with a sprint form, by field; the mock refuses with the same sentences. */
export function sprintErrors(v: SprintForm): Partial<Record<'name' | 'goal' | 'endDate', string>> {
  const errors: Partial<Record<'name' | 'goal' | 'endDate', string>> = {}
  const name = v.name.trim()
  if (name === '') errors.name = 'Give the sprint a name.'
  else if (name.length > 60) errors.name = 'Keep the name under 60 characters.'
  if (v.goal.trim().length > 500) errors.goal = 'Keep the goal under 500 characters.'
  // Written so a date that isn't one fails too.
  if (!(new Date(v.endDate).getTime() > new Date(v.startDate).getTime())) errors.endDate = 'The end date must be after the start date.'
  return errors
}

const STATE_ORDER: Record<Sprint['state'], number> = { active: 0, planned: 1, closed: 2 }

/** Active first, then planned by start date, then closed by end date, newest first. */
export function sortSprints(sprints: Sprint[]): Sprint[] {
  const at = (iso: string) => new Date(iso).getTime()
  return [...sprints].sort((a, b) => {
    if (a.state !== b.state) return STATE_ORDER[a.state] - STATE_ORDER[b.state]
    return a.state === 'closed' ? at(b.endDate) - at(a.endDate) : at(a.startDate) - at(b.startDate)
  })
}

/** Where a sprint stands against its end, in local days: "4 days left", "1 day left", "Ends today", "Ended 2 days ago". */
export function sprintDays(sprint: Pick<Sprint, 'startDate' | 'endDate'>, now: Date): string {
  const left = daysBetween(now, new Date(sprint.endDate))
  if (left === 0) return 'Ends today'
  const n = Math.abs(left)
  const days = `${n} ${n === 1 ? 'day' : 'days'}`
  return left > 0 ? `${days} left` : `Ended ${days} ago`
}

/** A sprint's tasks and story points, and how many of each are done; archived tasks don't count. */
export function sprintTotals(tasks: TaskView[], sprintId: string): { tasks: number; points: number; done: number; donePoints: number } {
  const totals = { tasks: 0, points: 0, done: 0, donePoints: 0 }
  for (const t of tasks) {
    if (t.sprintId !== sprintId || t.archivedAt) continue
    const points = t.storyPoints ?? 0
    totals.tasks += 1
    totals.points += points
    if (t.category === 'done') {
      totals.done += 1
      totals.donePoints += points
    }
  }
  return totals
}
