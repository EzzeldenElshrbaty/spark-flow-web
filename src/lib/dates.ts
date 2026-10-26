const DAY = 86_400_000

/** A due date means the whole of that day: it is past only once the day (in UTC, as dates are stored) is over. */
export function isPastDue(iso: string, now: Date): boolean {
  const d = new Date(iso)
  return now.getTime() >= Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + DAY
}
