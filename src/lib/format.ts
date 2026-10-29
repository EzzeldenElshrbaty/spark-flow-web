export function formatMoney(amount: number, currency = 'EGP') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

export function formatCompact(amount: number, currency = 'EGP') {
  return `${currency} ${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(amount)}`
}

export function percent(part: number, whole: number) {
  return whole === 0 ? 0 : Math.round((part / whole) * 100)
}

const HOUR = 3_600_000

/** How long since an ISO time: "1 min", "25 min", "3h", "2d". */
export function elapsed(iso: string, now = Date.now()) {
  const diff = Math.max(0, now - new Date(iso).getTime())
  if (diff < HOUR) return `${Math.max(1, Math.round(diff / 60_000))} min`
  if (diff < 24 * HOUR) return `${Math.round(diff / HOUR)}h`
  return `${Math.round(diff / (24 * HOUR))}d`
}

/** "just now", "25 min ago", "3h ago", "2d ago". */
export function timeAgo(iso: string, now = Date.now()) {
  return now - new Date(iso).getTime() < 60_000 ? 'just now' : `${elapsed(iso, now)} ago`
}

/** Hours elapsed since an ISO time. */
export function hoursSince(iso: string, now = Date.now()) {
  return (now - new Date(iso).getTime()) / HOUR
}

/** A time of day, 12-hour: "9:30 AM", "2:00 PM". */
export function formatTime(iso: string | Date) {
  const date = new Date(iso)
  const hours = date.getHours()
  return `${hours % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`
}

/** "Today 2:00 PM", "Tomorrow 10:00 AM", "Yesterday 9:30 AM", or "Sat 3 Oct, 2:00 PM". */
export function formatWhen(iso: string, now = new Date()) {
  const date = new Date(iso)
  const time = formatTime(date)
  const dayDiff = Math.round((new Date(date).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / (24 * HOUR))
  if (dayDiff === 0) return `Today ${time}`
  if (dayDiff === 1) return `Tomorrow ${time}`
  if (dayDiff === -1) return `Yesterday ${time}`
  return `${date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`
}

/** When a thread's last reply came (spec 6.7): "today at 9:41 AM", "yesterday at 11:05 PM", or "5 days ago". */
export function lastReplyWhen(iso: string, now = new Date()) {
  const date = new Date(iso)
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / (24 * HOUR))
  if (days <= 0) return `today at ${formatTime(date)}`
  if (days === 1) return `yesterday at ${formatTime(date)}`
  return `${days} days ago`
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Value for an <input type="datetime-local"> from a Date. */
export function toLocalInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Next-action timing: "Overdue 3h", "Overdue 2d", or when it's due ("Today 2:00 PM", "Tomorrow 10:00 AM", "Sat 10 Oct, 9:00 AM"). */
export function formatDue(iso: string, now = Date.now()) {
  const diff = now - new Date(iso).getTime()
  if (diff <= 0) return formatWhen(iso, new Date(now))
  if (diff < HOUR) return `Overdue ${Math.max(1, Math.round(diff / 60_000))} min`
  if (diff < 24 * HOUR) return `Overdue ${Math.round(diff / HOUR)}h`
  return `Overdue ${Math.round(diff / (24 * HOUR))}d`
}

/** "12d", "3mo": how long since a time, e.g. days in a stage. */
export function daysSince(iso: string, now = Date.now()) {
  const days = Math.max(0, Math.floor((now - new Date(iso).getTime()) / (24 * HOUR)))
  return days < 60 ? `${days}d` : `${Math.round(days / 30)}mo`
}

/** Whether a time (or date) has already passed. */
export const isPast = (iso: string, now = Date.now()) => new Date(iso).getTime() < now

/** Whether a time falls on today's date. */
export const isToday = (iso: string, now = new Date()) => new Date(iso).toDateString() === now.toDateString()

/** How long a running timer has run: always from its start, so a reload or a sleeping laptop shows the true time. */
export const elapsedMs = (startedAt: string, now: Date) => Math.max(0, now.getTime() - new Date(startedAt).getTime())

/** A running clock: "1:05:09". */
export function formatClock(ms: number) {
  const total = Math.floor(ms / 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${Math.floor(total / 3600)}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
}

/** Hours with one decimal: "7.5h", "115h", "0h". */
export const formatHours = (hours: number) => `${Math.round(hours * 10) / 10}h`
