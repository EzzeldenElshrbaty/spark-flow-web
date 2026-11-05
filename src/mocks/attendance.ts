import type { Api, AttendanceDayRow, AttendancePeriod, AttendanceQuery, AttendanceReportRow, CheckEvent, CheckIn, CheckSource, User, Visit } from '@/api/types'
import { localDay } from '@/lib/dates'
import { timeoutProblem } from '@/lib/hours'
import { isActive } from '@/lib/people'
import { can } from '@/lib/permissions'
import { projectPeopleIds } from '@/lib/projectPeople'
import { checkWorkHours, describeWorkHours, formatDayMinutes, isEarly, isLate, WEEKDAYS, zoned } from '@/lib/workHours'
import { audit, requestFrom } from './audit'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import { grantsFor } from './roles'
import { badRequest, clone, currentUser, forbidden, newId } from './shared'

// User attendance and activities (Admin and help, slice 5): check-ins with where they came from, app use as visits,
// working hours, and who sees whom.

const MINUTE = 60_000
/** A ping this soon after a visit's last goes on the same visit (the tracker counts someone idle after 5 minutes). */
const SAME_VISIT_MS = 5 * MINUTE
/** A ping this soon after the last counted one (another tab, a tick right after coming back) adds nothing. */
const SAME_MINUTE_MS = 50_000
const PERIODS: readonly AttendancePeriod[] = [1, 7, 30, 90]
const DAY_TEXT = /^\d{4}-\d{2}-\d{2}$/

/**
 * Whose attendance someone may see, themselves first: everyone with "See everyone’s check-ins and app use"; the
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

/** A check-in's hours: until its check-out, or until now while today's is open; a past day left open counts nothing. */
function hoursOf(c: CheckIn, now: Date): number {
  const end = c.checkedOutAt ?? (c.day === localDay(now) ? now.toISOString() : null)
  return end ? Math.max(0, Date.parse(end) - Date.parse(c.checkedInAt)) / 3_600_000 : 0
}

/** Every check-in and check-out of these people, oldest first, each marked against the same person's previous one. */
function eventsOf(data: DbData, ids: string[]): CheckEvent[] {
  const hours = data.settings.workHours
  const raw: (Omit<CheckEvent, 'newIp' | 'newDevice'> & { source: CheckSource | null })[] = []
  for (const c of data.checkIns.filter((c) => ids.includes(c.userId))) {
    const inFrom = c.inFrom ?? null
    raw.push({ id: `${c.id}:in`, userId: c.userId, kind: 'in', at: c.checkedInAt, source: inFrom, ip: inFrom?.ip ?? null, device: inFrom?.device ?? null, location: inFrom?.location ?? null, byFlow: false, offHours: isLate(c.checkedInAt, hours) })
    if (c.checkedOutAt) {
      const byFlow = Boolean(c.closedByFlow)
      const outFrom = byFlow ? null : (c.outFrom ?? null)
      raw.push({ id: `${c.id}:out`, userId: c.userId, kind: 'out', at: c.checkedOutAt, source: outFrom, ip: outFrom?.ip ?? null, device: outFrom?.device ?? null, location: outFrom?.location ?? null, byFlow, offHours: !byFlow && isEarly(c.checkedInAt, c.checkedOutAt, hours) })
    }
  }
  raw.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.kind === 'in' ? -1 : 1))
  const last = new Map<string, { ip: string | null; device: string | null }>()
  return raw.map(({ source, ...event }) => {
    const before = last.get(event.userId)
    const newIp = Boolean(before?.ip && event.ip && before.ip !== event.ip)
    const newDevice = Boolean(before?.device && event.device && before.device !== event.device)
    if (source) last.set(event.userId, { ip: event.ip ?? before?.ip ?? null, device: event.device ?? before?.device ?? null })
    return { ...event, newIp, newDevice }
  })
}

const average = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null)

export function attendanceApi(db: MockDb, now: () => Date): Api['attendance'] {
  return {
    async scope() {
      await delay()
      const data = await db.read()
      return { userIds: visibleTo(data, currentUser(data)) }
    },

    async checkIns(query: AttendanceQuery) {
      await delay()
      const data = await db.read()
      const ids = whoFor(data, query.userId)
      const since = sinceOf(query.days, now())
      return clone(eventsOf(data, ids).filter((e) => localDay(new Date(e.at)) >= since).reverse())
    },

    async day(day, userId) {
      await delay()
      const data = await db.read()
      if (typeof day !== 'string' || !DAY_TEXT.test(day)) throw badRequest('Pick a day.')
      const at = now()
      const hours = data.settings.workHours
      const checkInOf = (id: string) => data.checkIns.find((c) => c.userId === id && c.day === day)
      return shownPeople(data, whoFor(data, userId), (id) => Boolean(checkInOf(id))).map((id): AttendanceDayRow => {
        const c = checkInOf(id)
        const byFlow = Boolean(c?.closedByFlow)
        return {
          userId: id,
          checkedInAt: c?.checkedInAt ?? null,
          checkedOutAt: c?.checkedOutAt ?? null,
          byFlow,
          hours: c ? hoursOf(c, at) : 0,
          appMinutes: data.visits.filter((v) => v.userId === id && v.day === day).reduce((s, v) => s + v.minutes, 0),
          late: Boolean(c && isLate(c.checkedInAt, hours)),
          early: Boolean(c?.checkedOutAt && !byFlow && isEarly(c.checkedInAt, c.checkedOutAt, hours)),
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
      const checks = (id: string) => data.checkIns.filter((c) => c.userId === id && c.day >= since)
      return shownPeople(data, ids, (id) => checks(id).length > 0).map((id): AttendanceReportRow => {
        const mine = checks(id)
        const outs = mine.filter((c) => c.checkedOutAt && !c.closedByFlow)
        return {
          userId: id,
          daysIn: mine.length,
          avgIn: average(mine.map((c) => minutesOf(c.checkedInAt))),
          // A check-out after midnight averages as past midnight, not as early morning.
          avgOut: average(outs.map((c) => minutesOf(c.checkedOutAt!) + (zoned(c.checkedOutAt!, hours.timeZone).date > zoned(c.checkedInAt, hours.timeZone).date ? 24 * 60 : 0))),
          late: mine.filter((c) => isLate(c.checkedInAt, hours)).length,
          early: outs.filter((c) => isEarly(c.checkedInAt, c.checkedOutAt!, hours)).length,
          hours: mine.reduce((s, c) => s + hoursOf(c, at), 0),
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
