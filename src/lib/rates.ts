import type { Rate } from '@/api/types'

/** A person's rows, oldest first. */
const rowsOf = (rates: Rate[], userId: string) => rates.filter((r) => r.userId === userId).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))

/**
 * The hourly cost in effect for a person at `at` (an ISO time): the latest row that started by then. Time before every
 * row uses the earliest one; no rate at all costs 0. Cost is worked out entry by entry with this, so a change of rate
 * never rewrites past cost.
 */
export function rateAt(rates: Rate[], userId: string, at: string): number {
  const rows = rowsOf(rates, userId)
  if (rows.length === 0) return 0
  return (rows.filter((r) => r.effectiveFrom <= at).at(-1) ?? rows[0]!).hourlyCost
}

/** Each person's current rate: their latest row. */
export function currentRates(rates: Rate[]): Rate[] {
  const latest = new Map<string, Rate>()
  for (const r of rates) {
    const seen = latest.get(r.userId)
    if (!seen || r.effectiveFrom >= seen.effectiveFrom) latest.set(r.userId, r)
  }
  return [...latest.values()]
}
