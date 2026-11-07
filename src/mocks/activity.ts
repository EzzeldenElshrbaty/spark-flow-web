import type { ActivityEntry, Api, FieldChange, Project, Ticket } from '@/api/types'
import { columnLabel } from '@/lib/boardColumns'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import { clone, newId, notFound } from './shared'

const PAGE_SIZE = 30

/** The fields a task's history follows; rank and timestamps are bookkeeping, not changes. */
const FIELDS = ['title', 'description', 'priority', 'assigneeId', 'phaseId', 'sprintId', 'dueAt', 'estimateHours', 'type', 'storyPoints'] as const

const text = (v: unknown) => (v === null || v === undefined ? null : String(v))

/**
 * Appends one line to the project's history, inside the caller's transaction, as the current person. Times only go
 * forward, so "newest first" holds even for lines written in the same millisecond.
 */
export function logActivity(data: DbData, entry: Omit<ActivityEntry, 'id' | 'at' | 'actorId'>, now: string = new Date().toISOString()): ActivityEntry {
  const last = data.activity.at(-1)?.at
  const at = last && last >= now ? new Date(new Date(last).getTime() + 1).toISOString() : now
  const line: ActivityEntry = { id: newId('act'), at, actorId: data.currentUserId, ...entry }
  data.activity.push(line)
  return line
}

/** A status change, with the columns' names as they are now (the column may be gone when the line is read). */
export function statusChange(project: Pick<Project, 'board'>, from: string, to: string): FieldChange {
  return { field: 'status', from, to, fromLabel: columnLabel(project, from), toLabel: columnLabel(project, to) }
}

/** What changed between two versions of a task, field by field; a description change says so without its text. */
export function diffTask(data: DbData, before: Ticket, after: Ticket): FieldChange[] {
  const changes: FieldChange[] = []
  for (const field of FIELDS) {
    if (field === 'description') {
      // Formatting counts: the body changed even when its plain text didn't.
      if (JSON.stringify(before.descriptionBody) !== JSON.stringify(after.descriptionBody)) changes.push({ field, from: null, to: null })
      continue
    }
    if (text(before[field]) === text(after[field])) continue
    const change: FieldChange = { field, from: text(before[field]), to: text(after[field]) }
    // Names that can disappear (a phase, a sprint) are kept as they were.
    if (field === 'phaseId' || field === 'sprintId') {
      const nameOf = (id: string | null) => (id ? (field === 'phaseId' ? data.phases : data.sprints).find((x) => x.id === id)?.name : undefined)
      const fromLabel = nameOf(change.from)
      const toLabel = nameOf(change.to)
      if (fromLabel) change.fromLabel = fromLabel
      if (toLabel) change.toLabel = toLabel
    }
    changes.push(change)
  }
  return changes
}

/** Logs a task's update: a move (its column) and the other fields as separate lines, nothing for a rank-only change. */
export function logTaskUpdate(data: DbData, before: Ticket, after: Ticket, now?: string) {
  const project = data.projects.find((p) => p.id === after.projectId)
  if (!project) return
  if (before.status !== after.status) logActivity(data, { projectId: project.id, taskKey: after.key, kind: 'task.moved', changes: [statusChange(project, before.status, after.status)] }, now)
  const changes = diffTask(data, before, after)
  if (changes.length) logActivity(data, { projectId: project.id, taskKey: after.key, kind: 'task.changed', changes }, now)
}

type SortKey = Pick<ActivityEntry, 'at' | 'id'>
const compareDesc = (a: SortKey, b: SortKey) => (a.at === b.at ? (a.id < b.id ? 1 : a.id > b.id ? -1 : 0) : a.at < b.at ? 1 : -1)

/** History reads: a task's (all of it) and a project's (newest first, in pages). Everyone who can open the project. */
export function activityApi(db: MockDb): Api['activity'] {
  return {
    async forTask(key) {
      await delay()
      const data = await db.read()
      const task = data.tickets.find((t) => t.key === key)
      if (!task) throw notFound('Ticket', key)
      return clone(data.activity.filter((a) => a.taskKey === key && a.projectId === task.projectId).sort(compareDesc))
    },
    async forProject(projectId, cursor) {
      await delay()
      const data = await db.read()
      if (!data.projects.some((p) => p.id === projectId)) throw notFound('Project', projectId)
      const at = cursor ? cursor.indexOf('|') : -1
      const before = at < 0 ? null : { at: cursor!.slice(0, at), id: cursor!.slice(at + 1) }
      const older = data.activity.filter((a) => a.projectId === projectId && (before === null || compareDesc(before, a) < 0)).sort(compareDesc)
      const items = older.slice(0, PAGE_SIZE)
      const last = items.at(-1)
      return clone({ items, nextCursor: older.length > PAGE_SIZE && last ? `${last.at}|${last.id}` : null })
    },
  }
}
