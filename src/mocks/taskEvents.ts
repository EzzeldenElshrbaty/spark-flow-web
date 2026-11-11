import type { ChatMessage, Project, SprintEvent, TaskEvent, Ticket } from '@/api/types'
import { categoryOf, columnLabel } from '@/lib/boardColumns'
import { postMessage } from './chat'
import type { DbData } from './db'

/**
 * What a task change says in its project's chat: created; assigned to a person; a new column (moving into a Done-type
 * column is its own kind). The column's name is kept on the card as it was then.
 */
export function taskEventOf(before: Ticket | null, after: Ticket, project: Pick<Project, 'board'> = {}): TaskEvent[] {
  if (!before) return [{ key: after.key, kind: 'created' }]
  const events: TaskEvent[] = []
  if (after.assigneeId && after.assigneeId !== before.assigneeId) events.push({ key: after.key, kind: 'assigned', assigneeId: after.assigneeId })
  if (after.status !== before.status) {
    // Done is its own card only when the task becomes done (not between two Done-type columns).
    const kind = categoryOf(project, after.status) === 'done' && categoryOf(project, before.status) !== 'done' ? 'done' : 'status'
    events.push({ key: after.key, kind, status: after.status, statusLabel: columnLabel(project, after.status) })
  }
  return events
}

/** The card's text, kept for search and excerpts, with the project's own column names. */
function textOf(data: DbData, event: TaskEvent, task: Ticket, project: Project): string {
  switch (event.kind) {
    case 'created':
      return `Created ${task.key}: ${task.title}`
    case 'assigned':
      return `Assigned ${task.key} to ${data.users.find((u) => u.id === event.assigneeId)?.name ?? 'someone'}`
    case 'status':
      return `Moved ${task.key} to ${event.statusLabel ?? columnLabel(project, event.status!)}`
    case 'done':
      return `Done: ${task.key} ${task.title}`
  }
}

/**
 * Posts one card per event in the task's project chat, inside the caller's transaction. Cards name their task but
 * mention nobody, so they don't ring the bell.
 */
export function postTaskEvents(data: DbData, before: Ticket | null, after: Ticket): ChatMessage[] {
  const project = data.projects.find((p) => p.id === after.projectId)
  if (!project) return []
  return taskEventOf(before, after, project).map((event) => {
    const card = postMessage(data, { channelId: project.channelId, content: textOf(data, event, after, project) }, { taskEvent: event })
    card.mentions = []
    card.linkedTicketKeys = [after.key]
    return card
  })
}

/**
 * Posts a sprint's card (started, completed) in its project's chat, inside the caller's transaction. `text` is kept for
 * search and excerpts; the card mentions nobody and names no task, whatever the goal says.
 */
export function postSprintEvent(data: DbData, project: Project, event: SprintEvent, text: string): ChatMessage {
  const card = postMessage(data, { channelId: project.channelId, content: text }, { sprintEvent: event })
  card.mentions = []
  card.linkedTicketKeys = []
  delete card.hereIds
  return card
}
