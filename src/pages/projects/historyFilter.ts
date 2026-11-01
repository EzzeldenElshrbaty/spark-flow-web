import type { ActivityEntry } from '@/api/types'

export type HistoryShow = 'all' | 'tasks' | 'board' | 'comments'

/** What an empty (filtered) history says: with older pages left, that there may be more; else that there is nothing. */
export function emptyNote(show: HistoryShow, hasMore: boolean): string {
  if (hasMore) return 'Nothing like this in what is loaded. Load older to see more.'
  return show === 'all' ? 'Nothing has happened here yet.' : 'Nothing like this here yet.'
}

/** The project History tab's chips: tasks, the board (columns, phases, deliverables, the project) or comments. */
export function historyFilter(entries: ActivityEntry[], show: HistoryShow): ActivityEntry[] {
  if (show === 'tasks') return entries.filter((e) => e.kind.startsWith('task.'))
  if (show === 'comments') return entries.filter((e) => e.kind.startsWith('comment.'))
  if (show === 'board') return entries.filter((e) => /^(column|phase|deliverable)\./.test(e.kind) || e.kind === 'project.changed')
  return entries
}
