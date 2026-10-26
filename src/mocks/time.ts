import type { Api, MyDay, TimeEntry, TimeTarget } from '@/api/types'
import { localDay } from '@/lib/dates'
import { can } from '@/lib/permissions'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import { findProject } from './projects'
import type { MockHub } from './realtime'
import { badRequest, clone, currentUser, newId, requireCan } from './shared'

const HOUR = 3_600_000
const MAX_ENTRY_HOURS = 12
const MAX_PLAN = 500
const MAX_NOTE = 200

/** What a target logs against: the task (and its project) or the project alone. */
function resolveTarget(data: DbData, target: TimeTarget): { projectId: string; taskId: string | null; done: boolean } {
  if ('taskId' in target) {
    const task = data.tickets.find((t) => t.id === target.taskId)
    if (!task) throw badRequest("That task doesn't exist.")
    return { projectId: task.projectId, taskId: task.id, done: task.status === 'done' }
  }
  return { projectId: findProject(data, target.projectId).id, taskId: null, done: false }
}

function myDay(data: DbData, userId: string, now: Date): MyDay {
  const day = localDay(now)
  const mine = data.timeEntries.filter((e) => e.userId === userId)
  return clone({
    day,
    checkIn: data.checkIns.find((c) => c.userId === userId && c.day === day) ?? null,
    running: mine.find((e) => e.endedAt === null) ?? null,
    entries: mine.filter((e) => localDay(new Date(e.startedAt)) === day).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)),
  })
}

/** Closes my running entry (if any) at `at`. */
function stopRunning(data: DbData, userId: string, at: string) {
  const running = data.timeEntries.find((e) => e.userId === userId && e.endedAt === null)
  if (running) running.endedAt = at
  return running
}

/** Starts a timer on `target`, stopping the one that runs; the same target keeps its entry. Mutates `data`. */
function startTimer(data: DbData, userId: string, target: TimeTarget, at: string): string {
  const { projectId, taskId, done } = resolveTarget(data, target)
  if (done) throw badRequest('That task is done. Reopen it to log time.')
  const running = data.timeEntries.find((e) => e.userId === userId && e.endedAt === null)
  if (running && running.projectId === projectId && running.taskId === taskId) return projectId
  stopRunning(data, userId, at)
  data.timeEntries.push({ id: newId('te'), userId, projectId, taskId, startedAt: at, endedAt: null, source: 'timer', note: '' })
  return projectId
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
      findProject(data, projectId)
      const me = currentUser(data)
      const entries = data.timeEntries.filter((e) => e.projectId === projectId).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      const rates = can('timeCost.view', { userId: me.id, role: me.role }) ? data.rates : null
      return clone({ entries, rates })
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
        const at = now().getTime()
        const start = new Date(input.startedAt).getTime()
        const end = new Date(input.endedAt).getTime()
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw badRequest('The end is before the start.')
        if (end > at) throw badRequest("Time can't be logged in the future.")
        if (end - start > MAX_ENTRY_HOURS * HOUR) throw badRequest(`One entry can be up to ${MAX_ENTRY_HOURS} hours.`)
        const note = input.note.trim()
        if (note.length > MAX_NOTE) throw badRequest(`Keep the note under ${MAX_NOTE} characters.`)
        const { projectId, taskId } = resolveTarget(data, input)
        // My other entries, the running one counted up to now.
        const overlaps = data.timeEntries.some(
          (e) => e.userId === me.id && new Date(e.startedAt).getTime() < end && (e.endedAt ? new Date(e.endedAt).getTime() : at) > start,
        )
        if (overlaps) throw badRequest('That overlaps time you already logged.')
        const entry: TimeEntry = { id: newId('te'), userId: me.id, projectId, taskId, startedAt: new Date(start).toISOString(), endedAt: new Date(end).toISOString(), source: 'manual', note }
        data.timeEntries.push(entry)
        return clone(entry)
      })
      hub.publish({ type: 'timeLogged', userId: stored.userId, projectId: stored.projectId })
      return stored
    },
  }
}
