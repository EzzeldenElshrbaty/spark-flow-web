import type { AuditAction, AuditChainState, AuditEvent, AuditFilter, AuditGroup, AuditResult } from '@/api/types'
import type { BadgeTone } from '@/components/ui/Badge'

// How the audit log page names and reads its entries (slice 2); the page and its tests share these.

export const GROUPS: { id: AuditGroup; label: string }[] = [
  { id: 'data', label: 'Data changes' },
  { id: 'status', label: 'Status and archive' },
  { id: 'access', label: 'Sign-in and access' },
  { id: 'settings', label: 'Settings and users' },
  { id: 'exports', label: 'Exports and downloads' },
]
export const groupLabel = (group: AuditGroup) => GROUPS.find((g) => g.id === group)!.label

export const ACTIONS: Record<AuditAction, { label: string; tone: BadgeTone }> = {
  created: { label: 'Created', tone: 'success' },
  changed: { label: 'Changed', tone: 'info' },
  deleted: { label: 'Deleted', tone: 'danger' },
  archived: { label: 'Archived', tone: 'warning' },
  restored: { label: 'Restored', tone: 'success' },
  signedIn: { label: 'Signed in', tone: 'neutral' },
  signInFailed: { label: 'Sign-in failed', tone: 'danger' },
  denied: { label: 'Access denied', tone: 'danger' },
  exported: { label: 'Exported', tone: 'brand' },
  downloaded: { label: 'Downloaded', tone: 'brand' },
  imported: { label: 'Imported', tone: 'warning' },
  reset: { label: 'Reset', tone: 'warning' },
}

export const RESULTS: Record<AuditResult, { label: string; tone: BadgeTone }> = {
  done: { label: 'Done', tone: 'success' },
  refused: { label: 'Refused', tone: 'danger' },
  failed: { label: 'Failed', tone: 'danger' },
}

export const PERIODS = [
  { id: '', label: 'Any time' },
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
] as const
export type Period = (typeof PERIODS)[number]['id']

/** The start of my day `daysBack` days ago, as an ISO time. */
export function dayStart(now: Date, daysBack = 0): string {
  const day = new Date(now)
  day.setDate(day.getDate() - daysBack)
  day.setHours(0, 0, 0, 0)
  return day.toISOString()
}

/** Where a period starts: today's, or the last 7 or 30 days counting today; null for any time. */
export function periodSince(period: string, now: Date): string | null {
  if (period === 'today') return dayStart(now)
  if (period === '7d') return dayStart(now, 6)
  if (period === '30d') return dayStart(now, 29)
  return null
}

/** The filter the address asks for (?q=&period=&person=&type=&result=&group=), anything unknown left out. */
export function filterFrom(params: URLSearchParams, now: Date): AuditFilter {
  const group = params.get('group')
  const result = params.get('result')
  return {
    q: params.get('q')?.trim() || undefined,
    since: periodSince(params.get('period') ?? '', now),
    actorId: params.get('person') || null,
    recordType: params.get('type') || null,
    result: result && result in RESULTS ? (result as AuditResult) : null,
    group: GROUPS.some((g) => g.id === group) ? (group as AuditGroup) : null,
  }
}

/** One change as a line: "Due date: 1 Nov 2026 → 8 Nov 2026"; an empty side is "—". */
export const changeLine = (c: AuditEvent['changes'][number]) => `${c.field}: ${c.from ?? '—'} → ${c.to ?? '—'}`

/** What a row shows of an entry's changes: the first, "and N more", or its detail when it changed no field. */
export function changeSummary(event: AuditEvent): string {
  const [first, ...rest] = event.changes
  if (!first) return event.detail ?? '—'
  return rest.length ? `${changeLine(first)} · ${rest.length} more` : changeLine(first)
}

/** The tamper check as the page says it. */
export function chainText(chain: AuditChainState): { ok: boolean; value: string; note: string } {
  const entries = `${chain.checked} ${chain.checked === 1 ? 'entry' : 'entries'}`
  if (chain.intact) return { ok: true, value: 'Intact', note: `${entries} checked` }
  const why = { edited: 'changed', removed: 'one before it is missing', reordered: 'out of order' }[chain.reason]
  return { ok: false, value: 'Broken', note: `At #${chain.brokenAt}: ${why}` }
}

/** Why the chain breaks at this entry, for its detail sheet; null when it doesn't. */
export function breakHere(chain: AuditChainState | undefined, seq: number): string | null {
  if (!chain || chain.intact || chain.brokenAt !== seq) return null
  return {
    edited: 'This entry doesn’t match its hash: it was changed after it was written.',
    removed: 'The entry before this one is missing: it was removed.',
    reordered: 'This entry is out of order.',
  }[chain.reason]
}
