import type { Api, NewTicket, Priority, Project, TaskType, Ticket, TicketPatch } from '@/api/types'
import { liveFiles, taskView } from './derive'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import type { MockHub } from './realtime'
import { categoryOf, columnLabel, columnOf, columnsOf, startColumn } from '@/lib/boardColumns'
import { badRequest, clone, isDate, notFound, pickPatch, requireActive, requireCan, stamp, text } from './shared'
import { fileInUse } from './files'
import { ApiError } from '@/lib/apiError'
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
import { endEntry, stopTimersOn } from './timers'
import { audit, changesBetween, recordOf } from './audit'
import { archiveReason, setArchivedFields } from './archive'
import { descriptionText, MAX_DESCRIPTION, validDescription } from '@/lib/messageBody'

/** What the audit log records of a task's edit: everything but its place in a column; the column is "status". */
const TASK_LOGGED = ['title', 'description', 'priority', 'storyPoints', 'assigneeId', 'sprintId', 'phaseId', 'type', 'dueAt', 'estimateHours'] as const

/** A task's column change as the log shows it, by the columns' names; none when it stayed. */
function statusChanges(project: Project, from: string | null, to: string) {
  return from === to ? [] : [{ field: 'Status', from: from === null ? null : columnLabel(project, from), to: columnLabel(project, to) }]
}

function findTicket(data: DbData, key: string): Ticket {
  const ticket = data.tickets.find((t) => t.key === key)
  if (!ticket) throw notFound('Ticket', key)
  return ticket
}

export function ticketsApi(db: MockDb, now: () => Date): Api['tickets'] {
  return {
    async list(projectId, opts) {
      await delay()
      const data = await db.read()
      const project = findProject(data, projectId)
      const archived = Boolean(opts?.archived)
      const files = liveFiles(data.attachments)
      return data.tickets
        .filter((t) => t.projectId === projectId && Boolean(t.archivedAt) === archived)
        .sort(byColumnThenRank(columnsOf(project).map((c) => c.id)))
        .map((t) => taskView(t, data, now(), project, files))
    },
    async get(key) {
      await delay()
      const data = await db.read()
      return taskView(findTicket(data, key), data, now())
    },
    async resolve(keys) {
      await delay()
      if (keys.length === 0) return []
      const data = await db.read()
      const wanted = new Set(keys)
      return data.tickets
        .filter((t) => wanted.has(t.key))
        .map((t) => {
          const project = data.projects.find((p) => p.id === t.projectId)!
          const column = columnsOf(project).find((c) => c.id === t.status)
          return {
            key: t.key, title: t.title, status: t.status, statusLabel: column?.label ?? t.status, category: column?.category ?? 'todo',
            projectKey: project.key, projectName: project.name, assigneeId: t.assigneeId,
          }
        })
    },
  }
}

const EDITABLE_BY_ASSIGNEE = new Set(['status', 'rank'])

/** The fields a task patch may carry (TicketPatch); anything else is refused. */
const TASK_FIELDS = [
  'title', 'descriptionBody', 'attachmentIds', 'status', 'priority', 'storyPoints', 'assigneeId', 'sprintId', 'rank', 'phaseId', 'type', 'dueAt', 'estimateHours',
] as const satisfies readonly (keyof TicketPatch)[]
const PRIORITIES: readonly Priority[] = ['urgent', 'high', 'medium', 'low']
const TYPES: readonly TaskType[] = ['task', 'bug']

const MAX_TASK_FILES = 20

/**
 * A task's files as sent (spec §4.2), each once, in order: at most 20, each a file that exists, and each one new to the
 * task uploaded by me and used nowhere yet; every one clean. The checks go row by row, so the first rule broken is the
 * one reported.
 */
function checkAttachments(data: DbData, ticket: Ticket | undefined, ids: unknown, meId: string): string[] {
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) throw badRequest("That isn’t a list of files.")
  const unique = [...new Set(ids)]
  if (unique.length > MAX_TASK_FILES) throw badRequest('Attach up to 20 files to a task.')
  const files = unique.map((id) => {
    const file = data.attachments.find((a) => a.id === id)
    if (!file || file.deletedAt) throw notFound('File', id)
    return file
  })
  const had = new Set(ticket?.attachmentIds ?? [])
  for (const file of files.filter((f) => !had.has(f.id))) {
    if (file.uploadedBy !== meId) throw new ApiError({ title: 'Forbidden', status: 403, detail: 'You can only attach files you uploaded.' })
    if (fileInUse(data, file.id)) throw badRequest('Upload that file again to attach it here.')
  }
  for (const file of files) {
    if (file.scanStatus === 'pending') throw badRequest(`${file.title} is still being checked.`)
    if (file.scanStatus === 'blocked') throw badRequest(`${file.title} was blocked.`)
  }
  return unique
}

/** A task's files by their titles, for the audit log: "a.pdf, b.png", or null for none. */
const fileTitles = (data: DbData, ids: string[]) => ids.map((id) => data.attachments.find((a) => a.id === id)?.title ?? 'a file').join(', ') || null

/**
 * The values of a new task or a patch. The assignee is one of the project's people, or the one the task already has
 * (someone taken off the project keeps their tasks until they're reassigned). A description is replaced by its checked
 * copy (unknown fields dropped) and the files by their checked list.
 */
function checkTaskInput(data: DbData, projectId: string, input: Partial<TicketPatch>, ticket?: Ticket) {
  const project = findProject(data, projectId)
  if (input.title !== undefined && !text(input.title, 'Title')) throw badRequest('Give the task a title.')
  // The files first: the description may show only the task's files as they'll be.
  if (input.attachmentIds !== undefined) input.attachmentIds = checkAttachments(data, ticket, input.attachmentIds, data.currentUserId)
  if (input.descriptionBody !== undefined) {
    const body = validDescription(input.descriptionBody, new Set(input.attachmentIds ?? ticket?.attachmentIds ?? []))
    if (!body) throw badRequest("The description couldn’t be read. Try again.")
    if (descriptionText(body).length > MAX_DESCRIPTION) throw badRequest('Keep the description under 20,000 characters.')
    input.descriptionBody = body
  }
  if (input.priority !== undefined && !PRIORITIES.includes(input.priority)) throw badRequest("That isn’t a priority.")
  if (input.type !== undefined && !TYPES.includes(input.type)) throw badRequest("That isn’t a task type.")
  if (input.assigneeId != null && input.assigneeId !== ticket?.assigneeId) {
    requireActive(data, [input.assigneeId])
    if (!projectPeopleIds(project, data.users).has(input.assigneeId)) throw badRequest('Pick someone on the project.')
  }
  if (input.sprintId != null) {
    const sprint = data.sprints.find((s) => s.id === input.sprintId)
    if (sprint?.projectId !== projectId) throw badRequest('That sprint belongs to another project.')
    // Into a closed sprint, from the task sheet or a stale tab; a task done in it keeps it through other edits.
    if (sprint.state === 'closed' && input.sprintId !== ticket?.sprintId) throw badRequest('That sprint is closed. Pick a planned or running one.')
  }
  if (input.storyPoints != null && (!Number.isFinite(input.storyPoints) || input.storyPoints < 0)) throw badRequest('Story points are a number, 0 or more.')
  if (input.dueAt != null && !isDate(input.dueAt)) throw badRequest('Pick a due date.')
  if (input.rank !== undefined && !Number.isFinite(input.rank)) throw badRequest('That position on the board is not a number.')
  // A status is a column of the project's board ('' on create means where new tasks start: To do).
  if (input.status && !columnOf(project, input.status)) throw badRequest('That column no longer exists.')
  if (input.phaseId) {
    const phase = data.phases.find((p) => p.id === input.phaseId)
    if (!phase) throw badRequest('That phase no longer exists.')
    if (phase.projectId !== projectId) throw badRequest('That phase belongs to another project.')
  }
  if (input.estimateHours != null && (input.estimateHours < 0 || !Number.isFinite(input.estimateHours))) throw badRequest('The estimate is a number of hours, 0 or more.')
}

/** Task writes, checked against the permission table (spec §4.3). */
export function tasksApi(db: MockDb, hub: MockHub, now: () => Date): Api['tasks'] {
  /** Archives or restores, in one write; archiving also stops the timers running on the task. */
  const setArchived = async (key: string, archive: boolean, reason?: string) => {
    await delay()
    const { ticket, stopped, same } = await db.update((data) => {
      const ticket = findTicket(data, key)
      const me = requireCan(data, 'task.manage', openProject(data, ticket.projectId))
      // Already so (a double click, two tabs): nothing changes, nothing is logged or sent.
      if (Boolean(ticket.archivedAt) === archive) return { ticket: clone(ticket), stopped: [] as string[], same: true }
      const why = archive ? archiveReason(reason) : null
      const at = now()
      const stopped: string[] = []
      if (archive) {
        for (const e of data.timeEntries.filter((e) => e.taskId === ticket.id && e.endedAt === null)) {
          endEntry(e, at, 'flow')
          stopped.push(e.userId)
        }
      }
      audit(data, { action: archive ? 'archived' : 'restored', group: 'status', record: recordOf.task(ticket), detail: why })
      setArchivedFields(ticket, archive, at.toISOString(), me.id, why)
      ticket.updatedAt = stamp(ticket.updatedAt)
      logActivity(data, { projectId: ticket.projectId, taskKey: ticket.key, kind: archive ? 'task.archived' : 'task.restored', changes: [] }, at.toISOString())
      return { ticket: clone(ticket), stopped, same: false }
    })
    if (same) return taskView(ticket, await db.read(), now())
    hub.publish({ type: 'ticketUpdated', ticket })
    for (const userId of stopped) hub.publish({ type: 'timeLogged', userId, projectId: ticket.projectId })
    return taskView(ticket, await db.read(), now())
  }
  return {
    archive: (key, reason) => setArchived(key, true, reason),
    restore: (key) => setArchived(key, false),
    async create(given) {
      await delay()
      const input = { ...given } // its description is swapped for the checked copy
      // Rights and values are checked in the write that creates it, on the data it sees.
      const created = await createTicket(db, hub, input, now, (data) => checkNewTask(data, input))
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
    async moveTo(key, status, index, visibleKeys) {
      await delay()
      // Placed and its column renumbered in one write, so no other card needs its own (maybe refused) save.
      const patch: TicketPatch = { status }
      const updated = await updateTicket(db, hub, key, patch, now, (data, ticket) => {
        const project = openProject(data, ticket.projectId)
        try {
          requireCan(data, 'task.manage', project)
        } catch {
          requireCan(data, 'task.updateOwnStatus', project, { taskAssigneeId: ticket.assigneeId })
        }
        checkTaskInput(data, ticket.projectId, { status }, ticket)
        const column = data.tickets.filter((t) => t.projectId === ticket.projectId && t.status === status && !t.archivedAt && t.key !== key).sort((a, b) => a.rank - b.rank)
        // Right before the visible card at `index`, or right after the last visible one (hidden cards keep their places).
        const visible = visibleKeys ? column.filter((t) => visibleKeys.includes(t.key)) : column
        const at = Math.max(0, Math.min(index, visible.length))
        const place = at < visible.length ? column.indexOf(visible[at]!) : visible.length ? column.indexOf(visible.at(-1)!) + 1 : column.length
        const order = [...column.slice(0, place), ticket, ...column.slice(place)]
        order.forEach((t, i) => {
          if (t === ticket) patch.rank = (i + 1) * 1000
          else t.rank = (i + 1) * 1000
        })
      })
      return taskView(updated, await db.read(), now())
    },
  }
}

// ── Mutations (not on Api until Phase 4) ──────────────────────────────────

/**
 * Whether I may make this task, on the data the write sees: an open project I manage, values that pass, and a source
 * message (if any) in this project's chat and still there. `tasks.create` and `taskLists.addNew` both check it.
 */
export function checkNewTask(data: DbData, input: NewTicket) {
  const project = openProject(data, input.projectId)
  requireCan(data, 'task.manage', project)
  checkTaskInput(data, input.projectId, input)
  if (input.linkedMessageId) {
    const message = data.messages.find((m) => m.id === input.linkedMessageId)
    // A reply also sent to the chat is listed there, but it's a reply: tasks are made from messages.
    if (message?.broadcast) throw badRequest("A task can’t be made from a thread reply.")
    if (!message || message.channelId !== project.channelId || message.deletedAt) throw badRequest("This message isn’t in the project’s chat.")
  }
}

/**
 * Opens a ticket as the current user: next key for the project, last in its column; posts a Created card. `check` runs
 * first and `then` after the task is in, both inside the same write, so a refusal from either leaves nothing.
 */
export async function createTicket(
  db: MockDb,
  hub: MockHub,
  input: NewTicket,
  clock: () => Date = () => new Date(),
  check?: (data: DbData) => void,
  then?: (data: DbData, created: Ticket) => void,
): Promise<Ticket> {
  const { ticket, cards, source } = await db.update((data) => {
    check?.(data)
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
      descriptionBody: input.descriptionBody ?? [],
      description: descriptionText(input.descriptionBody ?? []),
      attachmentIds: input.attachmentIds ?? [],
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
    // Who it was made for counts as assigning them (UX Phase 2, 2.3: their bell says so).
    const assigned = created.assigneeId ? [{ field: 'assigneeId', from: null, to: created.assigneeId }] : []
    logActivity(data, { projectId: project.id, taskKey: key, kind: 'task.created', changes: assigned }, clock().toISOString())
    const files = created.attachmentIds.length ? [{ field: 'Files', from: null, to: fileTitles(data, created.attachmentIds) }] : []
    audit(data, { action: 'created', group: 'data', record: recordOf.task(created), changes: [...statusChanges(project, null, status), ...changesBetween(data, {}, created, TASK_LOGGED), ...files] })
    // The message it was made from names it from now on (its task chip).
    const source = created.linkedMessageId ? data.messages.find((m) => m.id === created.linkedMessageId) : undefined
    if (source && !source.linkedTicketKeys.includes(key)) source.linkedTicketKeys.push(key)
    then?.(data, created)
    return { ticket: created, cards: clone(postTaskEvents(data, null, created)), source: source && { channelId: source.channelId, messageId: source.id } }
  })
  hub.publish({ type: 'ticketUpdated', ticket: clone(ticket) })
  if (ticket.attachmentIds.length) hub.publish({ type: 'filesChanged', projectId: ticket.projectId })
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
  const { ticket, cards, stopped, orphans, filesMoved } = await db.update((data) => {
    const ticket = findTicket(data, key)
    // Archived tasks are read-only until restored (restore doesn't come through here); that comes first, for anyone.
    if (ticket.archivedAt) throw badRequest('This task is archived. Restore it first.')
    check?.(data, ticket)
    // The column is checked here, in this write: another tab may have deleted it since the caller looked.
    if (patch.status !== undefined && !columnOf(findProject(data, ticket.projectId), patch.status)) throw badRequest('That column no longer exists.')
    const before = clone(ticket)
    for (const [field, value] of Object.entries(patch)) {
      if (value !== undefined) (ticket as Record<string, unknown>)[field] = value
    }
    // Files taken off the task leave its description too, so it never shows a file the task doesn't have.
    if (patch.attachmentIds !== undefined && patch.descriptionBody === undefined) {
      const kept = new Set(ticket.attachmentIds)
      ticket.descriptionBody = ticket.descriptionBody.filter((b) => b.type !== 'file' || kept.has(b.id))
    }
    if (patch.attachmentIds !== undefined || patch.descriptionBody !== undefined) ticket.description = descriptionText(ticket.descriptionBody)
    const filesMoved = JSON.stringify(before.attachmentIds) !== JSON.stringify(ticket.attachmentIds)
    const fileChanges = filesMoved ? [{ field: 'Files', from: fileTitles(data, before.attachmentIds), to: fileTitles(data, ticket.attachmentIds) }] : []
    // A file that left the task and is used nowhere else goes, with its bytes (after this write).
    const orphans = before.attachmentIds.filter((id) => !ticket.attachmentIds.includes(id) && !fileInUse(data, id))
    data.attachments = data.attachments.filter((a) => !orphans.includes(a.id))
    ticket.updatedAt = stamp(ticket.updatedAt)
    logTaskUpdate(data, before, ticket, now().toISOString())
    // Done (any Done-type column, whatever it's called): the timers running on it stop, as no more time goes on it.
    const project = findProject(data, ticket.projectId)
    const edits = [...changesBetween(data, before, ticket, TASK_LOGGED), ...fileChanges]
    const moved = statusChanges(project, before.status, ticket.status)
    if (edits.length) audit(data, { action: 'changed', group: 'data', record: recordOf.task(ticket), changes: edits })
    if (moved.length) audit(data, { action: 'changed', group: 'status', record: recordOf.task(ticket), changes: moved })
    const intoDone = patch.status !== undefined && categoryOf(project, ticket.status) === 'done' && categoryOf(project, before.status) !== 'done'
    const stopped = intoDone ? stopTimersOn(data, [ticket.id], now()) : []
    // The change, its history and its cards in the project's chat are one write.
    return { ticket, cards: clone(postTaskEvents(data, before, ticket)), stopped, orphans, filesMoved }
  })
  for (const fileId of orphans) await db.deleteFile(fileId)
  hub.publish({ type: 'ticketUpdated', ticket: clone(ticket) })
  if (filesMoved) hub.publish({ type: 'filesChanged', projectId: ticket.projectId })
  for (const userId of stopped) hub.publish({ type: 'timeLogged', userId, projectId: ticket.projectId })
  for (const message of cards) hub.publish({ type: 'messageReceived', message })
  return ticket
}
