import type { Api, MyDay, TimeEntry, TimeTarget } from '@/api/types'
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

function myDay(data: DbData, userId: string, now: Date): MyDay {
  const day = localDay(now)
  const mine = data.timeEntries.filter((e) => e.userId === userId)
  return clone({
    day,
    checkIn: data.checkIns.find((c) => c.userId === userId && c.day === day) ?? null,
    openCheckIn: data.checkIns.filter((c) => c.userId === userId && c.day < day && c.checkedOutAt === null).sort((a, b) => (a.checkedInAt < b.checkedInAt ? 1 : -1))[0] ?? null,
    running: mine.find((e) => e.endedAt === null) ?? null,
    entries: mine.filter((e) => localDay(new Date(e.startedAt)) === day).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)),
  })
}

/** Closes my running entry (if any) at `at`, or 12 hours after it started if it was forgotten that long. */
function stopRunning(data: DbData, userId: string, at: string) {
  const running = data.timeEntries.find((e) => e.userId === userId && e.endedAt === null)
  if (running) running.endedAt = new Date(entryEnd(running, new Date(at))).toISOString()
  return running
}

/** Time goes only on projects you're on (its manager, a member, one of its teams), or anywhere for an Admin. */
function checkOn(data: DbData, projectId: string) {
  const me = currentUser(data)
  const project = findProject(data, projectId)
  if (!can('time.logOn', { userId: me.id, role: me.role, project, userTeamIds: me.teamIds }))
    throw new ApiError({ title: 'Forbidden', status: 403, detail: "You're not on this project." })
}

/** Starts a timer on `target`, stopping the one that runs; the same target keeps its entry. Mutates `data`. */
function startTimer(data: DbData, userId: string, target: TimeTarget, at: string): string {
  const { projectId, taskId, done } = resolveTarget(data, target)
  checkOn(data, projectId)
  if (done) throw badRequest('That task is done. Reopen it to log time.')
  const running = data.timeEntries.find((e) => e.userId === userId && e.endedAt === null)
  if (running && running.projectId === projectId && running.taskId === taskId) return projectId
  stopRunning(data, userId, at)
  data.timeEntries.push({ id: newId('te'), userId, projectId, taskId, startedAt: at, endedAt: null, source: 'timer', note: '' })
  return projectId
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
  if (entry.userId !== me.id && me.role !== 'admin') throw new ApiError({ title: 'Forbidden', status: 403, detail: 'You can only change your own time.' })
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
      const everyone = me.role === 'admin' || project.managerId === me.id
      const entries = data.timeEntries
        .filter((e) => e.projectId === projectId && (everyone || e.userId === me.id))
        .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      const rates = can('timeCost.view', { userId: me.id, role: me.role }) ? data.rates : null
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

    checkIn: ({ plan, target }) =>
      write((data, me, at) => {
        const text = plan.trim()
        if (!text) throw badRequest("Write a line about today's plan.")
        if (text.length > MAX_PLAN) throw badRequest(`Keep the plan under ${MAX_PLAN} characters.`)
        const day = localDay(at)
        if (data.checkIns.some((c) => c.userId === me.id && c.day === day)) throw badRequest("You've already checked in today.")
        const iso = at.toISOString()
        // A check-in left open on an earlier day closes when its last entry of that day ended (else when it began).
        for (const old of data.checkIns.filter((c) => c.userId === me.id && c.checkedOutAt === null && c.day < day)) {
          const ends = data.timeEntries.filter((e) => e.userId === me.id && e.endedAt && localDay(new Date(e.startedAt)) === old.day).map((e) => e.endedAt!)
          old.checkedOutAt = [old.checkedInAt, ...ends].sort().at(-1)!
        }
        // A timer left running from an earlier day stops where it stopped counting (12 hours in).
        const running = data.timeEntries.find((e) => e.userId === me.id && e.endedAt === null)
        if (running && localDay(new Date(running.startedAt)) < day) stopRunning(data, me.id, iso)
        data.checkIns.push({ id: newId('ci'), userId: me.id, day, checkedInAt: iso, checkedOutAt: null, plan: text })
        return target ? startTimer(data, me.id, target, iso) : null
      }),

    checkOut: () =>
      write((data, me, at) => {
        // The latest open check-in from any day: someone who forgot yesterday can still close it.
        const open = data.checkIns.filter((c) => c.userId === me.id && c.checkedOutAt === null).sort((a, b) => (a.checkedInAt < b.checkedInAt ? 1 : -1))[0]
        if (!open) throw badRequest("You haven't checked in today.")
        const iso = at.toISOString()
        open.checkedOutAt = iso
        return stopRunning(data, me.id, iso)?.projectId ?? null
      }),

    undoCheckOut: () =>
      write((data, me, at) => {
        const today = data.checkIns.find((c) => c.userId === me.id && c.day === localDay(at) && c.checkedOutAt !== null)
        if (!today) throw badRequest("You haven't checked out today.")
        today.checkedOutAt = null
        return null
      }),

    start: (target) => write((data, me, at) => startTimer(data, me.id, target, at.toISOString())),

    stop: () =>
      write((data, me, at) => {
        const stopped = stopRunning(data, me.id, at.toISOString())
        if (!stopped) throw badRequest('No timer is running.')
        return stopped.projectId
      }),

    async addManual(input) {
      await delay()
      const stored = await db.update((data) => {
        const me = requireCan(data, 'time.logOwn')
        const start = new Date(input.startedAt).getTime()
        const end = new Date(input.endedAt).getTime()
        const { projectId, taskId, note } = checkEntry(data, me.id, { start, end, note: input.note, target: input }, now().getTime())
        checkOn(data, projectId)
        const entry: TimeEntry = { id: newId('te'), userId: me.id, projectId, taskId, startedAt: new Date(start).toISOString(), endedAt: new Date(end).toISOString(), source: 'manual', note }
        data.timeEntries.push(entry)
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
        Object.assign(entry, { ...checked, startedAt: new Date(start).toISOString(), endedAt: new Date(end).toISOString() })
        return { entry: clone(entry), was }
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
        data.timeEntries = data.timeEntries.filter((e) => e.id !== id)
        return entry
      })
      hub.publish({ type: 'timeLogged', userId: gone.userId, projectId: gone.projectId })
    },
  }
}
