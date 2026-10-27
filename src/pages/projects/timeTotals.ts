import type { Rate, TimeEntry } from '@/api/types'
import { formatMoney } from '@/lib/format'
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

/** The Time tab's card title: the project's total for who sees everyone's entries; for anyone else, their share of it. */
export function timeHeading(everyone: boolean, shown: { hours: number; cost: number | null }, projectHours: number): string {
  if (!everyone) return `Your time · ${shown.hours}h of ${tenth(projectHours)}h logged`
  return `${shown.hours}h logged${shown.cost !== null ? ` · ${formatMoney(shown.cost)}` : ''}`
}

/** What an empty Time tab says: when only your own entries show, the project may still have time from others. */
export function emptyTimeText(everyone: boolean, projectHours: number): string {
  if (everyone || projectHours <= 0) return 'No time logged yet.'
  return `You haven't logged time here. The project has ${tenth(projectHours)}h logged.`
}

/** The "only you and the manager" line: for people who see only their own entries, once the account is known. */
export function showPrivacyNote(everyone: boolean, loading: boolean): boolean {
  return !loading && !everyone
}
