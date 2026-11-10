import type { ArchivedRecord, ArchivedType } from '@/api/types'
import { formatDate } from '@/lib/format'

// How Settings → Archived records reads its list (Admin and help, slice 4).

export const TYPES: { id: ArchivedType; label: string; one: string }[] = [
  { id: 'project', label: 'Projects', one: 'Project' },
  { id: 'task', label: 'Tasks', one: 'Task' },
  { id: 'channel', label: 'Channels', one: 'Channel' },
]
export const typeLabel = (type: ArchivedType) => TYPES.find((t) => t.id === type)!.one

/** The records a search and a type keep: words match a name, its key or name, or the reason. */
export function filterArchived(items: readonly ArchivedRecord[], q: string, type: string): ArchivedRecord[] {
  const words = q.trim().toLowerCase()
  return items.filter((r) => (!type || r.type === type) && (!words || [r.name, r.ref, r.reason ?? ''].some((t) => t.toLowerCase().includes(words))))
}

/** "Can be deleted": now, from a day, or never and why. */
export function deletableText(r: ArchivedRecord, now: Date): { text: string; now: boolean } {
  if (r.keptBecause === 'channel') return { text: 'Restore only', now: false }
  if (r.keptBecause === 'time') return { text: 'Always kept · time logged', now: false }
  if (!r.deletableFrom || r.deletableFrom <= now.toISOString()) return { text: 'Now', now: true }
  return { text: `From ${formatDate(r.deletableFrom)}`, now: false }
}

/** What goes with a record deleted for good, one part each: "12 tasks", "1 file"; nothing for none. */
export function goesWithParts(r: ArchivedRecord): string[] {
  return (
    [
      [r.includes.tasks, 'task'],
      [r.includes.files, 'file'],
      [r.includes.comments, 'comment'],
      [r.includes.phases, 'phase'],
      [r.includes.deliverables, 'deliverable'],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, word]) => `${n} ${word}${n === 1 ? '' : 's'}`)
}

/**
 * What deleting a record takes with it, as a sentence: "its 12 tasks, 3 files and 5 phases", or null. The page lists
 * the parts (`goesWithParts`); this sentence form is kept for a confirm that says it in words.
 */
export function goesWith(r: ArchivedRecord): string | null {
  const parts = goesWithParts(r)
  if (parts.length === 0) return null
  return `its ${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`}`
}
