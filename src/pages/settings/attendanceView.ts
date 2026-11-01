import type { AttendancePeriod, CheckLocation, GeoFix } from '@/api/types'

// How Settings → Attendance reads its numbers and places (Admin and help, slice 5).

export const TABS = [
  { id: 'checkins', label: 'Check-ins' },
  { id: 'day', label: 'Day view' },
  { id: 'activity', label: 'Activity log' },
  { id: 'report', label: 'Report' },
] as const
export type AttendanceTab = (typeof TABS)[number]['id']

export const PERIODS: { days: AttendancePeriod; label: string }[] = [
  { days: 1, label: 'Today' },
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
]

export const tabOf = (value: string | null): AttendanceTab => TABS.find((t) => t.id === value)?.id ?? 'checkins'
export const periodOf = (value: string | null): AttendancePeriod => PERIODS.find((p) => String(p.days) === value)?.days ?? 7

/** App time: "3h 25m", "45m", "1h", or "—" for none. */
export function formatAppTime(minutes: number): string {
  if (minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`
}

export const isFix = (location: CheckLocation | null): location is GeoFix => typeof location === 'object' && location !== null

/** A place as its coordinates and accuracy, or why there is none. */
export function placeText(location: CheckLocation | null): string {
  if (isFix(location)) return `${location.lat}, ${location.lng} · ±${location.accuracy} m`
  return location === 'blocked' ? 'Location blocked' : location === 'none' ? 'No location' : '—'
}

/** Google Maps at that place, opened in a new tab. */
export const mapsUrl = (fix: GeoFix) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${fix.lat},${fix.lng}`)}`
