import type { ActivityEntry } from '@/api/types'

export type HistoryShow = 'all' | 'tasks' | 'board' | 'comments'

/** The project History tab's chips: tasks, the board (columns, phases, deliverables, the project) or comments. */
export function historyFilter(entries: ActivityEntry[], show: HistoryShow): ActivityEntry[] {
  if (show === 'tasks') return entries.filter((e) => e.kind.startsWith('task.'))
  if (show === 'comments') return entries.filter((e) => e.kind.startsWith('comment.'))
  if (show === 'board') return entries.filter((e) => /^(column|phase|deliverable)\./.test(e.kind) || e.kind === 'project.changed')
  return entries
}
