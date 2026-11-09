import type { ActivityEntry } from '@/api/types'
import { formatDayDivider } from '@/lib/format'

export type HistoryShow = 'all' | 'tasks' | 'board' | 'comments'

/** What an empty (filtered) history says: with older pages left, that there may be more; else that there is nothing. */
export function emptyNote(show: HistoryShow, hasMore: boolean): string {
  if (hasMore) return 'Nothing like this in what is loaded. Load older to see more.'
  return show === 'all' ? 'Nothing has happened here yet.' : 'Nothing like this here yet.'
}

/**
 * The project History tab's chips: tasks, the board (columns, phases, deliverables, the project) or comments; and
 * `who`, one person's entries (UX Phase 4, 4.10).
 */
export function historyFilter(entries: ActivityEntry[], show: HistoryShow, who = ''): ActivityEntry[] {
  const theirs = who ? entries.filter((e) => e.actorId === who) : entries
  if (show === 'tasks') return theirs.filter((e) => e.kind.startsWith('task.'))
  if (show === 'comments') return theirs.filter((e) => e.kind.startsWith('comment.'))
  if (show === 'board') return theirs.filter((e) => /^(column|phase|deliverable)\./.test(e.kind) || e.kind === 'project.changed')
  return theirs
}

/** History in days, as it comes (newest first): "Today", "Yesterday", "Wednesday 4 November" (UX Phase 4, 4.10). */
export function dayGroups(entries: ActivityEntry[], now: Date): { label: string; entries: ActivityEntry[] }[] {
  const groups: { label: string; entries: ActivityEntry[] }[] = []
  for (const entry of entries) {
    const label = formatDayDivider(new Date(entry.at), now)
    if (groups.at(-1)?.label === label) groups.at(-1)!.entries.push(entry)
    else groups.push({ label, entries: [entry] })
  }
  return groups
}
