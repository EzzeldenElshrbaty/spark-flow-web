const DAY = 86_400_000

/** A due date means the whole of that day: it is past only once the day (in UTC, as dates are stored) is over. */
export function isPastDue(iso: string, now: Date): boolean {
  const d = new Date(iso)
  return now.getTime() >= Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + DAY
}

/** The browser's own calendar day, 'YYYY-MM-DD': what an attendance day means (spec §3). */
export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The Sunday, 00:00 local, that starts the week holding `date` (Spark Systems works Sunday to Thursday). */
export function weekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - d.getDay())
  return d
}
