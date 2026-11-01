/** A task as a time row or a picker names it: "NEX-101 · Title", with "(archived)" once it is; — when unknown. */
export function taskLabel(task: { key: string; title: string; archivedAt?: string | null } | undefined): string {
  if (!task) return '—'
  return `${task.key} · ${task.title}${task.archivedAt ? ' (archived)' : ''}`
}
