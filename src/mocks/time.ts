import type { Api, CheckLocation, CheckSource, EndReason, GeoFix, MyDay, MyTimer, TimeEntry, TimeTarget } from '@/api/types'
import { categoryOf } from '@/lib/boardColumns'
import { localDay } from '@/lib/dates'
import { entryEnd, MAX_ENTRY_HOURS } from '@/lib/hours'
import { can } from '@/lib/permissions'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import { findProject, openProject } from './projects'
import type { MockHub } from './realtime'
import { buildReport } from './report'
import { ApiError } from '@/lib/apiError'
import { badRequest, clone, currentUser, newId, notFound, requireCan } from './shared'
import { grantsFor } from './roles'
import { audit, changesBetween, recordOf, requestFrom } from './audit'
import { endEntry } from './timers'

/** The fields of a time entry the audit log records. */
const ENTRY_LOGGED = ['userId', 'projectId', 'taskId', 'startedAt', 'endedAt', 'note'] as const

const HOUR = 3_600_000
const MAX_PLAN = 500
const MAX_NOTE = 200

/** What a target logs against: the task (and its project) or the project alone. */
function resolveTarget(data: DbData, target: TimeTarget, keepTaskId?: string | null): { projectId: string; taskId: string | null; done: boolean } {
  if ('taskId' in target) {
    const task = data.tickets.find((t) => t.id === target.taskId)
    if (!task) throw badRequest("That task doesn't exist.")
    // New time can't go on an archived task; an entry already on it can still be fixed (keepTaskId).
    if (task.archivedAt && task.id !== keepTaskId) throw badRequest('That task is archived. Restore it to log time.')
    return { projectId: task.projectId, taskId: task.id, done: categoryOf(openProject(data, task.projectId), task.status) === 'done' }
  }
  return { projectId: openProject(data, target.projectId).id, taskId: null, done: false }
}

/**
 * An entry as the time calls return it: without where its timer started from (IP, device, place), which only
 * Attendance shows, to the people its own rules allow.
 */
function shown(entry: TimeEntry): TimeEntry {
  const copy = { ...entry }
  delete copy.startedFrom
  return copy
}

function myDay(data: DbData, userId: string, now: Date): MyDay {
  const day = localDay(now)
  const mine = data.timeEntries.filter((e) => e.userId === userId)
  return clone({
    day,
    checkIn: data.checkIns.find((c) => c.userId === userId && c.day === day) ?? null,
    openCheckIn: data.checkIns.filter((c) => c.userId === userId && c.day < day && c.checkedOutAt === null).sort((a, b) => (a.checkedInAt < b.checkedInAt ? 1 : -1))[0] ?? null,
    running: mine.filter((e) => e.endedAt === null).map(shown)[0] ?? null,
    entries: mine.filter((e) => localDay(new Date(e.startedAt)) === day).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).map(shown),
    // Check-ins from before Attendance recorded nothing, so their owner still gets the notice once.
    firstCheckIn: !data.checkIns.some((c) => c.userId === userId && c.inFrom),
    timer: currentTimer(data, userId, now),
    firstStart: !data.timeEntries.some((e) => e.userId === userId && e.startedFrom),
  })
}

const targetOf = (entry: TimeEntry): TimeTarget => (entry.taskId ? { taskId: entry.taskId } : { projectId: entry.projectId })
const sameTarget = (a: TimeEntry, b: TimeEntry) => a.projectId === b.projectId && a.taskId === b.taskId
/** My timer entries, newest first. */
const myTimerEntries = (data: DbData, userId: string) =>
  data.timeEntries.filter((e) => e.userId === userId && e.source === 'timer').sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))

/** My paused run's last entry: my newest timer entry, if it ended 'paused' or 'timeout' today. */
function pausedEntry(data: DbData, userId: string, now: Date): TimeEntry | null {
  const newest = myTimerEntries(data, userId)[0]
  const paused = newest?.endedAt && (newest.endReason === 'paused' || newest.endReason === 'timeout') && localDay(new Date(newest.endedAt)) === localDay(now)
  return paused ? newest : null
}

/** Whether time can no longer go on an entry's target: its task is Done or archived, or its project archived. */
function closedTarget(data: DbData, entry: TimeEntry): boolean {
  const project = data.projects.find((p) => p.id === entry.projectId)
  if (!project || project.archivedAt) return true
  if (!entry.taskId) return false
  const task = data.tickets.find((t) => t.id === entry.taskId)
  return !task || Boolean(task.archivedAt) || categoryOf(project, task.status) === 'done'
}

/**
 * My timer (timer slice 1): my running entry, or my paused run if it ended today on a target still open. Its run goes
 * back over my timer entries on the same target until one ended 'stopped' or 'flow', or ended before today.
 */
export function currentTimer(data: DbData, userId: string, now: Date): MyTimer | null {
  const mine = myTimerEntries(data, userId)
  const newest = mine[0]
  if (!newest) return null
  const running = newest.endedAt === null
  if (!running && (newest !== pausedEntry(data, userId, now) || closedTarget(data, newest))) return null
  const day = localDay(now)
  let runMs = 0
  for (const e of mine) {
    if (!sameTarget(e, newest)) break
    if (e !== newest && e.endReason !== 'paused' && e.endReason !== 'timeout') break
    if (e.endedAt && localDay(new Date(e.endedAt)) !== day) break
    if (e.endedAt) runMs += Date.parse(e.endedAt) - Date.parse(e.startedAt)
  }
  return {
    state: running ? 'running' : 'paused',
    target: targetOf(newest),
    projectId: newest.projectId,
    entryId: newest.id,
    runMs,
    startedAt: running ? newest.startedAt : null,
    pausedBy: running ? null : newest.endReason === 'timeout' ? 'timeout' : 'me',
  }
}

/**
 * Closes a check-in left open: today's at `at`; an earlier day's when that day's last entry ended (else when it began),
 * so a forgotten check-out doesn't count the nights in between.
 */
export function closeCheckIn(data: DbData, checkIn: DbData['checkIns'][number], at: Date) {
  // Nobody checked out: Attendance shows it as Flow's, with no place, and never as leaving early.
  checkIn.closedByFlow = true
  checkIn.outFrom = null
  if (checkIn.day >= localDay(at)) {
    checkIn.checkedOutAt = at.toISOString()
    return
  }
  const ends = data.timeEntries.filter((e) => e.userId === checkIn.userId && e.endedAt && localDay(new Date(e.startedAt)) === checkIn.day).map((e) => e.endedAt!)
  checkIn.checkedOutAt = [checkIn.checkedInAt, ...ends].sort().at(-1)!
}

/** Where a check-in or check-out comes from: the request's IP and device, and the place the browser sent. */
function sourceOf(location: unknown): CheckSource {
  return { ...requestFrom(), location: checkLocation(location) }
}

/** The browser's place, as sent: a fix on Earth, 'blocked', or 'none' (also when nothing was sent). */
function checkLocation(value: unknown): CheckLocation {
  if (value === undefined || value === 'none') return 'none'
  if (value === 'blocked') return 'blocked'
  const fix = value as Partial<GeoFix> | null
  const ok =
    typeof fix === 'object' && fix !== null &&
    typeof fix.lat === 'number' && Math.abs(fix.lat) <= 90 &&
    typeof fix.lng === 'number' && Math.abs(fix.lng) <= 180 &&
    typeof fix.accuracy === 'number' && fix.accuracy >= 0 && Number.isFinite(fix.accuracy)
  if (!ok) throw badRequest("That location can't be right.")
  const round = (n: number) => Math.round(n * 100_000) / 100_000
  // To 5 decimals, about a metre: no more than the browser's own accuracy says.
  return { lat: round(fix.lat!), lng: round(fix.lng!), accuracy: Math.round(fix.accuracy!) }
}

/** Closes my running entry (if any) at `at` for `reason`, or at the 12-hour limit (as Flow) if it was forgotten that long. */
export function stopRunning(data: DbData, userId: string, at: string, reason: EndReason) {
  const running = data.timeEntries.find((e) => e.userId === userId && e.endedAt === null)
  if (running) endEntry(running, new Date(at), reason)
  return running
}

/** Time goes only on projects you're on (its manager, a member, one of its teams), or anywhere for an Admin. */
function checkOn(data: DbData, projectId: string) {
  const me = currentUser(data)
  const project = findProject(data, projectId)
  if (!can('time.logOn', { userId: me.id, grants: grantsFor(data, me), project, userTeamIds: me.teamIds }))
    throw new ApiError({ title: 'Forbidden', status: 403, detail: "You're not on this project." })
}

/** Where time on `target` goes, if it may: a project I'm on, and not a done task. */
function loggable(data: DbData, target: TimeTarget): { projectId: string; taskId: string | null } {
  const { projectId, taskId, done } = resolveTarget(data, target)
  checkOn(data, projectId)
  if (done) throw badRequest('That task is done. Reopen it to log time.')
  return { projectId, taskId }
}

/** A new timer entry on a target already checked by `loggable`. */
function beginEntry(data: DbData, userId: string, on: { projectId: string; taskId: string | null }, at: string, from: CheckSource) {
  data.timeEntries.push({ id: newId('te'), userId, ...on, startedAt: at, endedAt: null, source: 'timer', note: '', endReason: null, startedFrom: from })
}

/**
 * Starts a timer on `target`: the running one stops and a paused run ends, so the new run counts from 0; the target
 * that already runs keeps its entry. Mutates `data`.
 */
function startTimer(data: DbData, userId: string, target: TimeTarget, at: Date, from: CheckSource): string {
  const on = loggable(data, target)
  const running = data.timeEntries.find((e) => e.userId === userId && e.endedAt === null)
  if (running && running.projectId === on.projectId && running.taskId === on.taskId) return on.projectId
  stopRunning(data, userId, at.toISOString(), 'stopped')
  const paused = pausedEntry(data, userId, at)
  if (paused) paused.endReason = 'stopped'
  beginEntry(data, userId, on, at.toISOString(), from)
  return on.projectId
}

/**
 * The rules a manual entry (new or edited) keeps: it ends after it starts, not in the future, lasts at most 12 hours,
 * has a short note and doesn't overlap the person's other time (`editing` is the entry being changed, which may keep
 * its task even if that task is now archived).
 */
function checkEntry(
  data: DbData,
  userId: string,
  input: { start: number; end: number; note: string; target: TimeTarget },
  at: number,
  editing?: TimeEntry,
): { projectId: string; taskId: string | null; note: string } {
  const { start, end } = input
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw badRequest('The end is before the start.')
  if (end > at) throw badRequest("Time can't be logged in the future.")
  if (end - start > MAX_ENTRY_HOURS * HOUR) throw badRequest(`One entry can be up to ${MAX_ENTRY_HOURS} hours.`)
  const note = input.note.trim()
  if (note.length > MAX_NOTE) throw badRequest(`Keep the note under ${MAX_NOTE} characters.`)
  const { projectId, taskId } = resolveTarget(data, input.target, editing?.taskId)
  // The person's other entries, the running one counted up to now (at most 12 hours).
  const overlaps = data.timeEntries.some(
    (e) => e.userId === userId && e.id !== editing?.id && new Date(e.startedAt).getTime() < end && entryEnd(e, new Date(at)) > start,
  )
  if (overlaps) throw badRequest('That overlaps time you already logged.')
  return { projectId, taskId, note }
}

/** An entry I may change: mine (or anyone's, for an Admin), and not still running. */
function changeableEntry(data: DbData, id: string): TimeEntry {
  const me = currentUser(data)
  const entry = data.timeEntries.find((e) => e.id === id)
  if (!entry) throw notFound('Time entry', id)
  if (entry.userId !== me.id && !can('time.editOthers', { userId: me.id, grants: grantsFor(data, me) })) throw new ApiError({ title: 'Forbidden', status: 403, detail: 'You can only change your own time.' })
  if (entry.endedAt === null) throw badRequest('Stop the timer first.')
  // An archived project's time stays as it is: not edited, moved off it or deleted.
  openProject(data, entry.projectId)
  return entry
}

/**
 * Time rules (spec §2, §3): one check-in per local day; one running timer per person, so starting another stops the
 * last; check-out closes the open check-in and the running timer; manual entries can't overlap, end in the future or
 * run over 12 hours. Each write is one transaction and announces itself with `timeLogged`.
 */
export function timeApi(db: MockDb, hub: MockHub, now: () => Date): Api['time'] {
  const write = async (fn: (data: DbData, me: { id: string }, at: Date) => string | null): Promise<MyDay> => {
    await delay()
    const { day, userId, projectId } = await db.update((data) => {
      const me = requireCan(data, 'time.logOwn')
      const at = now()
      const projectId = fn(data, me, at)
      return { day: myDay(data, me.id, at), userId: me.id, projectId }
    })
    hub.publish({ type: 'timeLogged', userId, projectId })
    return day
  }

  return {
    async list(projectId) {
      await delay()
      const data = await db.read()
      const project = findProject(data, projectId)
      const me = currentUser(data)
      // Entry times are personal (spec §1): Admins and the project's manager see everyone's, others only their own.
      const everyone = can('time.seeTeam', { userId: me.id, grants: grantsFor(data, me), project })
      const entries = data.timeEntries
        .filter((e) => e.projectId === projectId && (everyone || e.userId === me.id))
        .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
        .map(shown)
      const rates = can('timeCost.view', { userId: me.id, grants: grantsFor(data, me) }) ? data.rates : null
      return clone({ entries, rates })
    },

    async report(workspaceId, days, opts) {
      await delay()
      const data = await db.read()
      if (!data.workspaces.some((w) => w.id === workspaceId)) throw notFound('Workspace', workspaceId)
      requireCan(data, 'timeCost.view')
      const to = now()
      const from = new Date(to.getTime() - days * 24 * HOUR)
      const projectIds = data.projects.filter((p) => p.workspaceId === workspaceId && (!opts?.projectId || p.id === opts.projectId)).map((p) => p.id)
      return clone(buildReport(data.timeEntries, data.rates, projectIds, from, to))
    },

    async today() {
      await delay()
      const data = await db.read()
      return myDay(data, currentUser(data).id, now())
    },

    checkIn: ({ plan, target, location }) =>
      write((data, me, at) => {
        const inFrom = sourceOf(location)
        const text = plan.trim()
        if (!text) throw badRequest("Write a line about today's plan.")
        if (text.length > MAX_PLAN) throw badRequest(`Keep the plan under ${MAX_PLAN} characters.`)
        const day = localDay(at)
        if (data.checkIns.some((c) => c.userId === me.id && c.day === day)) throw badRequest("You've already checked in today.")
        const iso = at.toISOString()
        // A check-in left open on an earlier day closes when its last entry of that day ended (else when it began).
        for (const old of data.checkIns.filter((c) => c.userId === me.id && c.checkedOutAt === null && c.day < day)) closeCheckIn(data, old, at)
        // A timer left running from an earlier day stops where it stopped counting (12 hours in).
        const running = data.timeEntries.find((e) => e.userId === me.id && e.endedAt === null)
        if (running && localDay(new Date(running.startedAt)) < day) stopRunning(data, me.id, iso, 'flow')
        data.checkIns.push({ id: newId('ci'), userId: me.id, day, checkedInAt: iso, checkedOutAt: null, plan: text, inFrom, outFrom: null })
        return target ? startTimer(data, me.id, target, at, sourceOf(location)) : null
      }),

    checkOut: (input) =>
      write((data, me, at) => {
        const outFrom = sourceOf(input?.location)
        // The latest open check-in from any day: someone who forgot yesterday can still close it.
        const open = data.checkIns.filter((c) => c.userId === me.id && c.checkedOutAt === null).sort((a, b) => (a.checkedInAt < b.checkedInAt ? 1 : -1))[0]
        if (!open) throw badRequest("You haven't checked in today.")
        const iso = at.toISOString()
        if (open.day < localDay(at)) {
          // Forgotten on an earlier day: its timer stops where it stopped counting, and the check-in ends with that
          // day's last entry, as Flow (not now, which would count the night and read as leaving early).
          const stopped = stopRunning(data, me.id, iso, 'flow')
          closeCheckIn(data, open, at)
          return stopped?.projectId ?? null
        }
        open.checkedOutAt = iso
        open.outFrom = outFrom
        open.closedByFlow = false
        return stopRunning(data, me.id, iso, 'stopped')?.projectId ?? null
      }),

    undoCheckOut: () =>
      write((data, me, at) => {
        const today = data.checkIns.find((c) => c.userId === me.id && c.day === localDay(at) && c.checkedOutAt !== null)
        if (!today) throw badRequest("You haven't checked out today.")
        today.checkedOutAt = null
        today.outFrom = null
        today.closedByFlow = false
        return null
      }),

    start: (target, location) => write((data, me, at) => startTimer(data, me.id, target, at, sourceOf(location))),

    pause: () =>
      write((data, me, at) => {
        const paused = stopRunning(data, me.id, at.toISOString(), 'paused')
        if (!paused) throw badRequest("Your timer isn't running.")
        return paused.projectId
      }),

    resume: (location) =>
      write((data, me, at) => {
        const from = sourceOf(location)
        const paused = data.timeEntries.some((e) => e.userId === me.id && e.endedAt === null) ? null : pausedEntry(data, me.id, at)
        if (!paused) throw badRequest('Nothing is paused.')
        const on = loggable(data, targetOf(paused))
        beginEntry(data, me.id, on, at.toISOString(), from)
        return on.projectId
      }),

    stop: () =>
      write((data, me, at) => {
        const stopped = stopRunning(data, me.id, at.toISOString(), 'stopped')
        if (stopped) return stopped.projectId
        const paused = pausedEntry(data, me.id, at)
        if (!paused) throw badRequest("There's no timer to stop.")
        paused.endReason = 'stopped'
        return paused.projectId
      }),

    async addManual(input) {
      await delay()
      const stored = await db.update((data) => {
        const me = requireCan(data, 'time.logOwn')
        const start = new Date(input.startedAt).getTime()
        const end = new Date(input.endedAt).getTime()
        const { projectId, taskId, note } = checkEntry(data, me.id, { start, end, note: input.note, target: input }, now().getTime())
        checkOn(data, projectId)
        const entry: TimeEntry = { id: newId('te'), userId: me.id, projectId, taskId, startedAt: new Date(start).toISOString(), endedAt: new Date(end).toISOString(), source: 'manual', note, endReason: null }
        data.timeEntries.push(entry)
        audit(data, { action: 'created', group: 'data', record: recordOf.timeEntry(data, entry), changes: changesBetween(data, {}, entry, ENTRY_LOGGED) })
        return clone(entry)
      })
      hub.publish({ type: 'timeLogged', userId: stored.userId, projectId: stored.projectId })
      return stored
    },

    async update(id, patch) {
      await delay()
      const { entry, was } = await db.update((data) => {
        requireCan(data, 'time.logOwn')
        const entry = changeableEntry(data, id)
        const was = entry.projectId
        const start = new Date(patch.startedAt ?? entry.startedAt).getTime()
        const end = new Date(patch.endedAt ?? entry.endedAt!).getTime()
        const target: TimeTarget = patch.target ?? (entry.taskId ? { taskId: entry.taskId } : { projectId: entry.projectId })
        // The owner's rules: their other entries are what it mustn't overlap, whoever edits it.
        const checked = checkEntry(data, entry.userId, { start, end, note: patch.note ?? entry.note, target }, now().getTime(), entry)
        // Moving it to another project needs to be on that one; fixing it where it is doesn't.
        if (checked.projectId !== was) checkOn(data, checked.projectId)
        const before = clone(entry)
        Object.assign(entry, { ...checked, startedAt: new Date(start).toISOString(), endedAt: new Date(end).toISOString() })
        const edits = changesBetween(data, before, entry, ENTRY_LOGGED)
        if (edits.length) audit(data, { action: 'changed', group: 'data', record: recordOf.timeEntry(data, entry), changes: edits })
        return { entry: shown(clone(entry)), was }
      })
      hub.publish({ type: 'timeLogged', userId: entry.userId, projectId: entry.projectId })
      if (was !== entry.projectId) hub.publish({ type: 'timeLogged', userId: entry.userId, projectId: was })
      return entry
    },

    async remove(id) {
      await delay()
      const gone = await db.update((data) => {
        requireCan(data, 'time.logOwn')
        const entry = changeableEntry(data, id)
        audit(data, { action: 'deleted', group: 'data', record: recordOf.timeEntry(data, entry), changes: changesBetween(data, entry, {}, ENTRY_LOGGED) })
        data.timeEntries = data.timeEntries.filter((e) => e.id !== id)
        return entry
      })
      hub.publish({ type: 'timeLogged', userId: gone.userId, projectId: gone.projectId })
    },
  }
}
