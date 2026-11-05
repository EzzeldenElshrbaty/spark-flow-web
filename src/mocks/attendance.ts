import type { Api, AttendanceDay, AttendanceDayRow, AttendancePeriod, AttendanceQuery, AttendanceReportRow, EndReason, TimeEntry, User, Visit } from '@/api/types'
import { localDay } from '@/lib/dates'
import { entryHours, timeoutProblem } from '@/lib/hours'
import { isActive } from '@/lib/people'
import { can } from '@/lib/permissions'
import { projectPeopleIds } from '@/lib/projectPeople'
import { checkWorkHours, describeWorkHours, formatDayMinutes, isEarly, isLate, WEEKDAYS, zoned } from '@/lib/workHours'
import { audit, requestFrom } from './audit'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import { grantsFor } from './roles'
import { badRequest, clone, currentUser, forbidden, newId } from './shared'
import { currentTimer } from './time'

// User attendance and activities (Admin and help, slice 5): days made from timer entries with where they started from
// (timer slice 3), app use as visits, working hours, and who sees whom.

const MINUTE = 60_000
/** A ping this soon after a visit's last goes on the same visit (the tracker counts someone idle after 5 minutes). */
const SAME_VISIT_MS = 5 * MINUTE
/** A ping this soon after the last counted one (another tab, a tick right after coming back) adds nothing. */
const SAME_MINUTE_MS = 50_000
const PERIODS: readonly AttendancePeriod[] = [1, 7, 30, 90]
const DAY_TEXT = /^\d{4}-\d{2}-\d{2}$/

/**
 * Whose attendance someone may see, themselves first: everyone with "See everyone’s timers and app use"; the
 * people on projects they manage with "…of the people on projects they manage"; otherwise only themselves.
 */
export function visibleTo(data: DbData, me: User): string[] {
  const grants = grantsFor(data, me)
  const ids = new Set([me.id])
  if (grants.includes('checkins.all')) for (const u of data.users) ids.add(u.id)
  else if (grants.includes('checkins.managed'))
    for (const p of data.projects.filter((p) => p.managerId === me.id && !p.archivedAt)) for (const id of projectPeopleIds(p, data.users)) ids.add(id)
  return [...ids]
}

/** The people a query covers: one person I may see (403 otherwise), or everyone I may see. */
function whoFor(data: DbData, userId: string | undefined): string[] {
  const visible = visibleTo(data, currentUser(data))
  if (userId === undefined) return visible
  if (!visible.includes(userId)) throw forbidden('their attendance')
  return [userId]
}

/** The first local day of a period ending today. */
function sinceOf(days: unknown, now: Date): string {
  if (!PERIODS.includes(days as AttendancePeriod)) throw badRequest('Pick 1, 7, 30 or 90 days.')
  // Calendar days, so a day that's 23 or 25 hours long (a clock change) doesn't move the start.
  return localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((days as number) - 1)))
}

/** The people a list shows: active ones, plus anyone deactivated who has something to show. */
const shownPeople = (data: DbData, ids: string[], has: (id: string) => boolean) =>
  ids.filter((id) => {
    const user = data.users.find((u) => u.id === id)
    return user && (isActive(user) || has(id))
  })

/** Ends that never count as leaving early: Flow's (a Done task, an archive, deactivating, the 12-hour limit) and the timeout's. */
const NOT_EARLY: readonly (EndReason | null)[] = ['flow', 'timeout']

/** A day's out that says when they stopped: not Flow's or the timeout's, and not today's while a timer runs or waits. */
function outCounts(data: DbData, d: Pick<AttendanceDay, 'userId' | 'day' | 'outAt' | 'endReason'>, now: Date): boolean {
  return Boolean(d.outAt) && !NOT_EARLY.includes(d.endReason) && !(d.day === localDay(now) && currentTimer(data, d.userId, now))
}

/**
 * People's days (timer slice 3): their timer entries grouped by person and the local day each started; manual entries
 * make no day. Newest first, from `since` on; each day's first start is compared with the same person's day before.
 */
export function daysOf(data: DbData, userIds: string[], since: string, now: Date): AttendanceDay[] {
  const hours = data.settings.workHours
  const groups = new Map<string, TimeEntry[]>()
  for (const e of data.timeEntries) {
    if (e.source !== 'timer' || !userIds.includes(e.userId)) continue
    const key = `${e.userId}:${localDay(new Date(e.startedAt))}`
    groups.set(key, [...(groups.get(key) ?? []), e])
  }
  const days = [...groups].map(([id, entries]) => {
    const sorted = [...entries].sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))
    const first = sorted[0]!
    // Out is the last end; none while one of the day's entries still runs.
    const last = sorted.some((e) => e.endedAt === null) ? null : sorted.reduce((a, e) => (e.endedAt! > a.endedAt! ? e : a))
    const day = id.slice(first.userId.length + 1)
    const outAt = last?.endedAt ?? null
    const endReason = last?.endReason ?? null
    return {
      id, userId: first.userId, day, inAt: first.startedAt, outAt, endReason,
      hours: sorted.reduce((sum, e) => sum + entryHours(e, now), 0),
      from: first.startedFrom ?? null,
      late: isLate(first.startedAt, hours),
      early: outCounts(data, { userId: first.userId, day, outAt, endReason }, now) && isEarly(first.startedAt, outAt!, hours),
    }
  })
  days.sort((a, b) => (a.inAt < b.inAt ? -1 : 1))
  const before = new Map<string, { ip: string | null; device: string | null }>()
  const marked = days.map((d): AttendanceDay => {
    const was = before.get(d.userId)
    const ip = d.from?.ip ?? null
    const device = d.from?.device ?? null
    const newIp = Boolean(was?.ip && ip && was.ip !== ip)
    const newDevice = Boolean(was?.device && device && was.device !== device)
    if (d.from) before.set(d.userId, { ip: ip ?? was?.ip ?? null, device: device ?? was?.device ?? null })
    return { ...d, newIp, newDevice }
  })
  return marked.filter((d) => d.day >= since).reverse()
}

const average = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null)

export function attendanceApi(db: MockDb, now: () => Date): Api['attendance'] {
  return {
    async scope() {
      await delay()
      const data = await db.read()
      return { userIds: visibleTo(data, currentUser(data)) }
    },

    async days(query: AttendanceQuery) {
      await delay()
      const data = await db.read()
      const at = now()
      return clone(daysOf(data, whoFor(data, query.userId), sinceOf(query.days, at), at))
    },

    async day(day, userId) {
      await delay()
      const data = await db.read()
      if (typeof day !== 'string' || !DAY_TEXT.test(day)) throw badRequest('Pick a day.')
      const ids = whoFor(data, userId)
      const days = daysOf(data, ids, day, now()).filter((d) => d.day === day)
      const dayOf = (id: string) => days.find((d) => d.userId === id)
      return shownPeople(data, ids, (id) => Boolean(dayOf(id))).map((id): AttendanceDayRow => {
        const d = dayOf(id)
        return {
          userId: id,
          inAt: d?.inAt ?? null,
          outAt: d?.outAt ?? null,
          hours: d?.hours ?? 0,
          appMinutes: data.visits.filter((v) => v.userId === id && v.day === day).reduce((s, v) => s + v.minutes, 0),
          late: d?.late ?? false,
          early: d?.early ?? false,
        }
      })
    },

    async visits(query) {
      await delay()
      const data = await db.read()
      const ids = whoFor(data, query.userId)
      const since = sinceOf(query.days, now())
      return clone(data.visits.filter((v) => ids.includes(v.userId) && v.day >= since).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)))
    },

    async report(query) {
      await delay()
      const data = await db.read()
      const ids = whoFor(data, query.userId)
      const at = now()
      const since = sinceOf(query.days, at)
      const hours = data.settings.workHours
      const minutesOf = (iso: string) => zoned(iso, hours.timeZone).minutes
      const all = daysOf(data, ids, since, at)
      const daysFor = (id: string) => all.filter((d) => d.userId === id)
      return shownPeople(data, ids, (id) => daysFor(id).length > 0).map((id): AttendanceReportRow => {
        const mine = daysFor(id)
        const outs = mine.filter((d) => outCounts(data, d, at))
        return {
          userId: id,
          daysIn: mine.length,
          avgIn: average(mine.map((d) => minutesOf(d.inAt))),
          // An out after midnight averages as past midnight, not as early morning.
          avgOut: average(outs.map((d) => minutesOf(d.outAt!) + (zoned(d.outAt!, hours.timeZone).date > zoned(d.inAt, hours.timeZone).date ? 24 * 60 : 0))),
          late: mine.filter((d) => d.late).length,
          early: mine.filter((d) => d.early).length,
          hours: mine.reduce((s, d) => s + d.hours, 0),
          appMinutes: data.visits.filter((v) => v.userId === id && v.day >= since).reduce((s, v) => s + v.minutes, 0),
        }
      })
    },

    async workHours() {
      await delay()
      return clone((await db.read()).settings.workHours)
    },

    async setWorkHours(input) {
      await delay()
      return db.update((data) => {
        const me = currentUser(data)
        if (!can('settings.manage', { userId: me.id, grants: grantsFor(data, me) })) throw forbidden('settings')
        const problem = checkWorkHours(input)
        if (problem) throw badRequest(problem)
        const was = data.settings.workHours
        const next = { days: [...new Set(input.days)].sort((a, b) => a - b), start: input.start, end: input.end, timeZone: was.timeZone }
        const clock = (hm: string) => formatDayMinutes(Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3)))
        const dayNames = (days: number[]) => days.map((d) => WEEKDAYS[d]).join(', ')
        const changes = [
          ...(dayNames(was.days) !== dayNames(next.days) ? [{ field: 'Working days', from: dayNames(was.days), to: dayNames(next.days) }] : []),
          ...(was.start !== next.start ? [{ field: 'Starts', from: clock(was.start), to: clock(next.start) }] : []),
          ...(was.end !== next.end ? [{ field: 'Ends', from: clock(was.end), to: clock(next.end) }] : []),
        ]
        if (changes.length) {
          data.settings.workHours = next
          audit(data, { action: 'changed', group: 'settings', record: { type: 'settings', id: 'workHours', name: 'Working hours' }, changes, detail: describeWorkHours(next) })
        }
        return clone(data.settings.workHours)
      })
    },

    async timer() {
      await delay()
      return { timeoutHours: (await db.read()).settings.timerTimeoutHours }
    },

    async setTimer(input) {
      await delay()
      return db.update((data) => {
        const me = currentUser(data)
        if (!can('settings.manage', { userId: me.id, grants: grantsFor(data, me) })) throw forbidden('settings')
        const problem = timeoutProblem(input?.timeoutHours)
        if (problem) throw badRequest(problem)
        const was = data.settings.timerTimeoutHours
        if (was !== input.timeoutHours) {
          data.settings.timerTimeoutHours = input.timeoutHours
          audit(data, { action: 'changed', group: 'settings', record: { type: 'settings', id: 'timer', name: 'Timer' }, changes: [{ field: 'Timer timeout', from: `${was} h`, to: `${input.timeoutHours} h` }] })
        }
        return { timeoutHours: data.settings.timerTimeoutHours }
      })
    },

    async ping() {
      await delay()
      await db.update((data) => {
        const me = currentUser(data)
        const at = now()
        const { ip, device } = requestFrom()
        const day = localDay(at)
        // The latest visit from this IP and device: a laptop and a phone used together keep a visit each.
        const last = data.visits
          .filter((v) => v.userId === me.id && v.ip === ip && v.device === device)
          .reduce<Visit | undefined>((a, v) => (!a || v.endedAt > a.endedAt ? v : a), undefined)
        const gap = last ? at.getTime() - Date.parse(last.endedAt) : Infinity
        if (last && last.day === day && gap < SAME_MINUTE_MS) return
        if (last && last.day === day && gap <= SAME_VISIT_MS) {
          last.endedAt = at.toISOString()
          last.minutes += 1
          return
        }
        data.visits.push({ id: newId('v'), userId: me.id, day, startedAt: at.toISOString(), endedAt: at.toISOString(), minutes: 1, ip, device })
      })
    },
  }
}
