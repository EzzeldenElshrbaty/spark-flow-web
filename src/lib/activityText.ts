import type { ActivityEntry, FieldChange } from '@/api/types'
import { formatDate } from '@/lib/format'
import { CATEGORIES } from '@/lib/statuses'

export type ActivityContext = {
  nameOf: (userId: string) => string
  /** The column's name today, or undefined if it's gone (then the line's snapshot is used). */
  columnLabel: (status: string) => string | undefined
  phaseName: (id: string) => string | undefined
  /** False inside a task's own history: "moved it", "changed the title". */
  withKey: boolean
}

const FIELD_NAMES: Record<string, string> = {
  title: 'title',
  status: 'status',
  priority: 'priority',
  assigneeId: 'assignee',
  phaseId: 'phase',
  sprintId: 'sprint',
  dueAt: 'due date',
  estimateHours: 'estimate',
  type: 'type',
  storyPoints: 'story points',
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const typeName = (category: string | null) => CATEGORIES.find((c) => c.category === category)?.label ?? '—'

/** One side of a change, as a person reads it; — when empty. */
function valueOf(change: FieldChange, side: 'from' | 'to', ctx: ActivityContext): string {
  const v = change[side]
  const snapshot = side === 'from' ? change.fromLabel : change.toLabel
  if (v === null || v === '') return '—'
  switch (change.field) {
    case 'status':
    case 'moveTo':
      return ctx.columnLabel(v) ?? snapshot ?? '—'
    case 'assigneeId':
      return ctx.nameOf(v)
    case 'phaseId':
      return ctx.phaseName(v) ?? snapshot ?? '—'
    case 'sprintId':
      return snapshot ?? '—'
    case 'dueAt':
      return formatDate(v)
    case 'estimateHours':
      return `${v} h`
    case 'priority':
    case 'type':
      return cap(v)
    default:
      return v
  }
}

/** The detail lines of a change to several fields: "Priority: Low → High". */
export function changeLines(entry: ActivityEntry, ctx: ActivityContext): string[] {
  if (entry.kind !== 'task.changed' || entry.changes.length < 2) return []
  return entry.changes.map((c) =>
    c.field === 'description' ? 'Description changed' : `${cap(FIELD_NAMES[c.field] ?? c.field)}: ${valueOf(c, 'from', ctx)} → ${valueOf(c, 'to', ctx)}`,
  )
}

/** One history line as a sentence: "Nour moved NEX-101 from To do to Testing". */
export function describeActivity(entry: ActivityEntry, ctx: ActivityContext): string {
  const who = ctx.nameOf(entry.actorId)
  const key = entry.taskKey ?? ''
  const on = ctx.withKey ? ` on ${key}` : ''
  const of = ctx.withKey ? ` of ${key}` : ''
  const it = ctx.withKey ? key : 'it'
  const first = entry.changes[0]
  switch (entry.kind) {
    case 'task.created':
      return `${who} created ${it}`
    case 'task.archived':
      return `${who} archived ${it}`
    case 'task.restored':
      return `${who} restored ${it}`
    case 'task.moved':
      return `${who} moved ${it} from ${first ? valueOf(first, 'from', ctx) : '—'} to ${first ? valueOf(first, 'to', ctx) : '—'}`
    case 'task.changed': {
      if (entry.changes.length > 1) return `${who} changed ${entry.changes.length} fields${of}`
      if (!first) return `${who} changed ${it}`
      if (first.field === 'description') return `${who} changed the description${of}`
      return `${who} changed the ${FIELD_NAMES[first.field] ?? first.field}${of} from ${valueOf(first, 'from', ctx)} to ${valueOf(first, 'to', ctx)}`
    }
    case 'comment.added':
      return entry.subject === 'bug' ? `${who} reported a bug${on}` : `${who} commented${ctx.withKey ? ` on ${key}` : ''}`
    case 'comment.edited':
      return `${who} edited a comment${on}`
    case 'comment.deleted':
      return `${who} deleted a comment${on}`
    case 'column.added':
      return `${who} added the column ${entry.subject} (${typeName(first?.to ?? null)})`
    case 'column.renamed':
      return `${who} renamed the column ${first?.from ?? '—'} to ${first?.to ?? entry.subject}`
    case 'column.moved':
      return `${who} moved the column ${entry.subject}`
    case 'column.typed':
      return `${who} changed the column ${entry.subject} to ${typeName(first?.to ?? null)}`
    case 'column.deleted': {
      const n = entry.count ?? 0
      return `${who} deleted the column ${entry.subject} and moved ${n} ${n === 1 ? 'task' : 'tasks'} to ${first ? valueOf(first, 'to', ctx) : '—'}`
    }
    case 'phase.added':
      return `${who} added the phase ${entry.subject}`
    case 'phase.changed':
      return `${who} changed the phase ${entry.subject}`
    case 'phase.removed':
      return `${who} removed the phase ${entry.subject}`
    case 'project.changed':
      return `${who} edited the project`
    case 'deliverable.added':
      return `${who} added the deliverable ${entry.subject}`
    case 'deliverable.changed':
      return `${who} changed the deliverable ${entry.subject}`
  }
}
