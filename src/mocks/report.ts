import { rateAt } from '@/lib/rates'
import type { Rate, ReportRow, TimeEntry, TimeReport } from '@/api/types'
import { weekStart } from '@/lib/dates'
import { entryEnd } from '@/lib/hours'

const HOUR = 3_600_000

/** Hours of [start, end) that fall inside [from, to). */
const overlap = (start: number, end: number, from: number, to: number) => Math.max(0, Math.min(end, to) - Math.max(start, from)) / HOUR

/**
 * Hours and cost between `from` and `to`, by project, by person and by week. Each entry is clipped to the period
 * (and split across weeks); a running one counts up to `to`, at most 12 hours. Nothing is rounded here, so the three
 * groupings add up exactly to the totals. Cost is hours × the person's rate; a missing rate counts 0.
 */
export function buildReport(entries: TimeEntry[], rates: Rate[], projectIds: string[], from: Date, to: Date): TimeReport {
  const inWorkspace = new Set(projectIds)
  // byPerson shows each person's rate now; cost goes entry by entry at the rate of the day it started.
  const rateOf = (userId: string) => rateAt(rates, userId, to.toISOString())
  const f = from.getTime()
  const t = to.getTime()

  const weeks: number[] = []
  for (let w = weekStart(from); w.getTime() < t; w.setDate(w.getDate() + 7)) weeks.push(w.getTime())

  const byProject = new Map<string, ReportRow>()
  const byPerson = new Map<string, ReportRow>()
  const byWeek = new Map<number, ReportRow>(weeks.map((w) => [w, { hours: 0, cost: 0 }]))
  const add = <K,>(map: Map<K, ReportRow>, key: K, hours: number, cost: number) => {
    const row = map.get(key) ?? { hours: 0, cost: 0 }
    row.hours += hours
    row.cost += cost
    map.set(key, row)
  }

  for (const e of entries) {
    if (!inWorkspace.has(e.projectId)) continue
    const start = new Date(e.startedAt).getTime()
    const end = entryEnd(e, to)
    const hours = overlap(start, end, f, t)
    if (hours <= 0) continue
    const rate = rateAt(rates, e.userId, e.startedAt)
    add(byProject, e.projectId, hours, hours * rate)
    add(byPerson, e.userId, hours, hours * rate)
    weeks.forEach((w, i) => {
      const next = weeks[i + 1] ?? t
      const part = overlap(start, end, Math.max(w, f), Math.min(next, t))
      if (part > 0) add(byWeek, w, part, part * rate)
    })
  }

  const totals = [...byProject.values()].reduce((s, r) => ({ hours: s.hours + r.hours, cost: s.cost + r.cost }), { hours: 0, cost: 0 })
  const desc = (a: ReportRow, b: ReportRow) => b.hours - a.hours
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    totals: { ...totals, people: byPerson.size },
    byProject: [...byProject].map(([projectId, r]) => ({ projectId, ...r })).sort(desc),
    byPerson: [...byPerson].map(([userId, r]) => ({ userId, rate: rateOf(userId), ...r })).sort(desc),
    byWeek: [...byWeek].map(([w, r]) => ({ weekStart: new Date(w).toISOString(), ...r })),
  }
}
