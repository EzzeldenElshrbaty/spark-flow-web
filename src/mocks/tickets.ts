import type { Api, NewTicket, Priority, TaskType, Ticket, TicketPatch } from '@/api/types'
import { taskView } from './derive'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import type { MockHub } from './realtime'
import { categoryOf, columnOf, columnsOf, startColumn } from '@/lib/boardColumns'
import { entryEnd } from '@/lib/hours'
import { badRequest, clone, isDate, notFound, pickPatch, requireCan, stamp } from './shared'
import { projectPeopleIds } from '@/lib/projectPeople'

/** In board order (the project's columns), then by rank within a column; a column that's gone sorts last. */
const byColumnThenRank = (order: string[]) => (a: Ticket, b: Ticket) => {
  const at = (t: Ticket) => (order.includes(t.status) ? order.indexOf(t.status) : order.length)
  return at(a) - at(b) || a.rank - b.rank
}

const ticketNumber = (t: Ticket) => Number(t.key.split('-')[1])

import { findProject, openProject } from './projects'
import { logActivity, logTaskUpdate } from './activity'
import { postTaskEvents } from './taskEvents'

function findTicket(data: DbData, key: string): Ticket {
  const ticket = data.tickets.find((t) => t.key === key)
  if (!ticket) throw notFound('Ticket', key)
  return ticket
}

export function ticketsApi(db: MockDb, now: () => Date, projects: Api['tickets']['projects']): Api['tickets'] {
  return {
    projects,
    async sprints(projectId) {
      await delay()
      const data = await db.read()
      findProject(data, projectId)
      return data.sprints.filter((s) => s.projectId === projectId)
    },
    async list(projectId, opts) {
      await delay()
      const data = await db.read()
      const project = findProject(data, projectId)
      const archived = Boolean(opts?.archived)
      return data.tickets
        .filter((t) => t.projectId === projectId && Boolean(t.archivedAt) === archived)
        .sort(byColumnThenRank(columnsOf(project).map((c) => c.id)))
        .map((t) => taskView(t, data, now(), project))
    },
    async get(key) {
      await delay()
      const data = await db.read()
      return taskView(findTicket(data, key), data, now())
    },
  }
}

const EDITABLE_BY_ASSIGNEE = new Set(['status', 'rank'])

/** The fields a task patch may carry (TicketPatch); anything else is refused. */
const TASK_FIELDS = [
  'title', 'description', 'status', 'priority', 'storyPoints', 'assigneeId', 'sprintId', 'rank', 'phaseId', 'type', 'dueAt', 'estimateHours',
] as const satisfies readonly (keyof TicketPatch)[]
const PRIORITIES: readonly Priority[] = ['urgent', 'high', 'medium', 'low']
const TYPES: readonly TaskType[] = ['task', 'bug']

/**
 * The values of a new task or a patch. The assignee is one of the project's people, or the one the task already has
 * (someone taken off the project keeps their tasks until they're reassigned).
 */
function checkTaskInput(data: DbData, projectId: string, input: Partial<TicketPatch>, ticket?: Ticket) {
  const project = findProject(data, projectId)
  if (input.title !== undefined && !input.title.trim()) throw badRequest('Give the task a title.')
  if (input.priority !== undefined && !PRIORITIES.includes(input.priority)) throw badRequest("That isn't a priority.")
  if (input.type !== undefined && !TYPES.includes(input.type)) throw badRequest("That isn't a task type.")
  if (input.assigneeId != null && input.assigneeId !== ticket?.assigneeId && !projectPeopleIds(project, data.users).has(input.assigneeId))
    throw badRequest('Pick someone on the project.')
  if (input.sprintId != null && data.sprints.find((s) => s.id === input.sprintId)?.projectId !== projectId) throw badRequest('That sprint belongs to another project.')
  if (input.storyPoints != null && (!Number.isFinite(input.storyPoints) || input.storyPoints < 0)) throw badRequest('Story points are a number, 0 or more.')
  if (input.dueAt != null && !isDate(input.dueAt)) throw badRequest('Pick a due date.')
  if (input.rank !== undefined && !Number.isFinite(input.rank)) throw badRequest('That position on the board is not a number.')
  // A status is a column of the project's board ('' on create means where new tasks start: To do).
  if (input.status && !columnOf(project, input.status)) throw badRequest('That column no longer exists.')
  if (input.phaseId && data.phases.find((p) => p.id === input.phaseId)?.projectId !== projectId) throw badRequest('That phase belongs to another project.')
  if (input.estimateHours != null && (input.estimateHours < 0 || !Number.isFinite(input.estimateHours))) throw badRequest('The estimate is a number of hours, 0 or more.')
}

/** Task writes, checked against the permission table (spec §4.3). */
export function tasksApi(db: MockDb, hub: MockHub, now: () => Date): Api['tasks'] {
  /** Archives or restores, in one write; archiving also stops the timers running on the task. */
  const setArchived = async (key: string, archive: boolean) => {
    await delay()
    const { ticket, stopped } = await db.update((data) => {
      const ticket = findTicket(data, key)
      requireCan(data, 'task.manage', openProject(data, ticket.projectId))
      const at = now()
      const stopped: string[] = []
      if (archive) {
        for (const e of data.timeEntries.filter((e) => e.taskId === ticket.id && e.endedAt === null)) {
          e.endedAt = new Date(entryEnd(e, at)).toISOString()
          stopped.push(e.userId)
        }
      }
      ticket.archivedAt = archive ? at.toISOString() : null
      ticket.updatedAt = stamp(ticket.updatedAt)
      logActivity(data, { projectId: ticket.projectId, taskKey: ticket.key, kind: archive ? 'task.archived' : 'task.restored', changes: [] }, at.toISOString())
      return { ticket: clone(ticket), stopped }
    })
    hub.publish({ type: 'ticketUpdated', ticket })
    for (const userId of stopped) hub.publish({ type: 'timeLogged', userId, projectId: ticket.projectId })
    return taskView(ticket, await db.read(), now())
  }
  return {
    archive: (key) => setArchived(key, true),
    restore: (key) => setArchived(key, false),
    async create(input) {
      await delay()
      const before = await db.read()
      const project = openProject(before, input.projectId)
      requireCan(before, 'task.manage', project)
      checkTaskInput(before, input.projectId, input)
      // A task made from a chat message: that message is in this project's chat, and still there.
      if (input.linkedMessageId) {
        const message = before.messages.find((m) => m.id === input.linkedMessageId)
        if (!message || message.channelId !== project.channelId || message.deletedAt) throw badRequest("This message isn't in the project's chat.")
      }
      const created = await createTicket(db, hub, input, now)
      return taskView(created, await db.read(), now())
    },
    async update(key, patch) {
      await delay()
      const clean = pickPatch(patch, TASK_FIELDS) as TicketPatch
      const onlyStatus = Object.keys(clean).every((field) => EDITABLE_BY_ASSIGNEE.has(field))
      // Rights and values are checked on the data this write sees, not an earlier read: someone may have reassigned it.
      const updated = await updateTicket(db, hub, key, clean, now, (data, ticket) => {
        const project = openProject(data, ticket.projectId)
        try {
          requireCan(data, 'task.manage', project)
        } catch (error) {
          if (!onlyStatus) throw error
          requireCan(data, 'task.updateOwnStatus', project, { taskAssigneeId: ticket.assigneeId })
        }
        checkTaskInput(data, ticket.projectId, clean, ticket)
      })
      return taskView(updated, await db.read(), now())
    },
  }
}

// ── Mutations (not on Api until Phase 4) ──────────────────────────────────

/** Opens a ticket as the current user: next key for the project, last in its column; posts a Created card. */
export async function createTicket(db: MockDb, hub: MockHub, input: NewTicket, clock: () => Date = () => new Date()): Promise<Ticket> {
  const { ticket, cards, source } = await db.update((data) => {
    const project = openProject(data, input.projectId)
    const own = data.tickets.filter((t) => t.projectId === project.id)
    const number = data.counters[project.id] ?? Math.max(0, ...own.map(ticketNumber)) + 1
    const status = input.status || startColumn(project)
    if (!columnOf(project, status)) throw badRequest('That column no longer exists.')
    const lastRank = Math.max(0, ...own.filter((t) => t.status === status).map((t) => t.rank))
    const now = stamp()
    const key = `${project.key}-${number}`
    const created: Ticket = {
      id: `t-${key.toLowerCase()}`,
      key,
      projectId: project.id,
      title: input.title,
      description: input.description,
      status,
      priority: input.priority,
      storyPoints: input.storyPoints,
      assigneeId: input.assigneeId,
      reporterId: data.currentUserId,
      sprintId: input.sprintId,
      rank: lastRank + 1000,
      linkedChannelId: input.linkedChannelId ?? null,
      linkedMessageId: input.linkedMessageId ?? null,
      createdAt: now,
      updatedAt: now,
      phaseId: input.phaseId ?? null,
      type: input.type ?? 'task',
      dueAt: input.dueAt ?? null,
      estimateHours: input.estimateHours ?? null,
    }
    data.tickets.push(created)
    data.counters[project.id] = number + 1
    logActivity(data, { projectId: project.id, taskKey: key, kind: 'task.created', changes: [] }, clock().toISOString())
    // The message it was made from names it from now on (its task chip).
    const source = created.linkedMessageId ? data.messages.find((m) => m.id === created.linkedMessageId) : undefined
    if (source && !source.linkedTicketKeys.includes(key)) source.linkedTicketKeys.push(key)
    return { ticket: created, cards: clone(postTaskEvents(data, null, created)), source: source && { channelId: source.channelId, messageId: source.id } }
  })
  hub.publish({ type: 'ticketUpdated', ticket: clone(ticket) })
  if (source) hub.publish({ type: 'messageChanged', ...source })
  for (const message of cards) hub.publish({ type: 'messageReceived', message })
  return ticket
}

/**
 * Changes the given fields of a ticket and bumps updatedAt; an assignee or status change posts its card (taskEvents).
 * `check` runs first, in the same write, and may throw to refuse it.
 */
export async function updateTicket(
  db: MockDb,
  hub: MockHub,
  key: string,
  patch: TicketPatch,
  now: () => Date = () => new Date(),
  check?: (data: DbData, ticket: Ticket) => void,
): Promise<Ticket> {
  const { ticket, cards, stopped } = await db.update((data) => {
    const ticket = findTicket(data, key)
    check?.(data, ticket)
    // Archived tasks are read-only until restored (restore doesn't come through here).
    if (ticket.archivedAt) throw badRequest('This task is archived. Restore it first.')
    // The column is checked here, in this write: another tab may have deleted it since the caller looked.
    if (patch.status !== undefined && !columnOf(findProject(data, ticket.projectId), patch.status)) throw badRequest('That column no longer exists.')
    const before = clone(ticket)
    for (const [field, value] of Object.entries(patch)) {
      if (value !== undefined) (ticket as Record<string, unknown>)[field] = value
    }
    ticket.updatedAt = stamp(ticket.updatedAt)
    logTaskUpdate(data, before, ticket, now().toISOString())
    // Done (any Done-type column, whatever it's called): the timers running on it stop, as no more time goes on it.
    const stopped: string[] = []
    const project = findProject(data, ticket.projectId)
    if (patch.status !== undefined && categoryOf(project, ticket.status) === 'done' && categoryOf(project, before.status) !== 'done') {
      for (const e of data.timeEntries.filter((e) => e.taskId === ticket.id && e.endedAt === null)) {
        e.endedAt = new Date(entryEnd(e, now())).toISOString()
        stopped.push(e.userId)
      }
    }
    // The change, its history and its cards in the project's chat are one write.
    return { ticket, cards: clone(postTaskEvents(data, before, ticket)), stopped }
  })
  hub.publish({ type: 'ticketUpdated', ticket: clone(ticket) })
  for (const userId of stopped) hub.publish({ type: 'timeLogged', userId, projectId: ticket.projectId })
  for (const message of cards) hub.publish({ type: 'messageReceived', message })
  return ticket
}
