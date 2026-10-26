import type { Rate, TimeEntry } from '@/api/types'
import { entryHours } from '@/lib/hours'

export type PersonTotal = { userId: string; hours: number; cost: number | null }

const tenth = (n: number) => Math.round(n * 10) / 10

/** Hours (and, with rates, cost) per person, most hours first, plus the project totals. A running entry counts up to now. */
export function totalsByPerson(entries: TimeEntry[], rates: Rate[] | null, now: Date) {
  const hours = new Map<string, number>()
  for (const e of entries) hours.set(e.userId, (hours.get(e.userId) ?? 0) + entryHours(e, now))
  const rateOf = (userId: string) => rates?.find((r) => r.userId === userId)?.hourlyCost ?? 0
  const people: PersonTotal[] = [...hours]
    .map(([userId, h]) => ({ userId, hours: tenth(h), cost: rates ? Math.round(h * rateOf(userId)) : null }))
    .sort((a, b) => b.hours - a.hours)
  return {
    people,
    hours: tenth([...hours.values()].reduce((a, b) => a + b, 0)),
    cost: rates ? people.reduce((sum, p) => sum + (p.cost ?? 0), 0) : null,
  }
}
