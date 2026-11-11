import type { Api, ChannelTask, TaskListEntry } from '@/api/types'
import { ApiError } from '@/lib/apiError'
import { columnsOf } from '@/lib/boardColumns'
import { checkCanWrite, readableChannel } from './chat'
import type { DbData, MockDb } from './db'
import { isOverdue, taskView } from './derive'
import { delay } from './latency'
import { openProject } from './projects'
import type { MockHub } from './realtime'
import { badRequest, clone } from './shared'
import { checkNewTask, createTicket } from './tickets'

/** The most tasks one channel's list holds (task list §4.2). */
export const TASK_LIST_MAX = 200

/** The channel a list belongs to: one I may read (404/403 as today), and a channel, not a DM. */
export function listChannel(data: DbData, channelId: string) {
  const channel = readableChannel(data, channelId)
  if (channel.kind !== 'channel') throw badRequest('Task lists are for channels.')
  return channel
}

/** Whether the row's task shows on the list: it exists, and neither it nor its project is archived. */
const shows = (data: DbData, row: ChannelTask) => {
  const task = data.tickets.find((t) => t.id === row.taskId)
  return Boolean(task && !task.archivedAt && !data.projects.find((p) => p.id === task.projectId)?.archivedAt)
}

/**
 * Room on the channel's list: under the limit, counting only the tasks it shows (final review: hidden archived ones
 * don't fill it), and this task (when it exists yet) not on it.
 */
export function checkRoom(data: DbData, channelId: string, taskId: string | null) {
  const rows = data.channelTasks.filter((r) => r.channelId === channelId)
  if (taskId && rows.some((r) => r.taskId === taskId)) throw new ApiError({ title: 'Conflict', status: 409, detail: 'That task is already on this list.' })
  if (rows.filter((r) => shows(data, r)).length >= TASK_LIST_MAX) throw badRequest(`A task list holds up to ${TASK_LIST_MAX} tasks.`)
}

/** Whether a check passes, for a join that is only wanted when allowed (`addNew`'s `optional`). */
const passes = (check: () => unknown) => {
  try {
    check()
    return true
  } catch (error) {
    if (error instanceof ApiError) return false
    throw error
  }
}

/** A row as the list shows it, with its task's live fields; null while the task (or its project) is archived or gone. */
function entryOf(data: DbData, row: ChannelTask, now: Date): TaskListEntry | null {
  const task = data.tickets.find((t) => t.id === row.taskId)
  const project = task && data.projects.find((p) => p.id === task.projectId)
  if (!task || !project || task.archivedAt || project.archivedAt) return null
  const column = columnsOf(project).find((c) => c.id === task.status)
  const category = column?.category ?? 'todo'
  return {
    id: row.id, addedBy: row.addedBy, addedAt: row.addedAt,
    task: {
      id: task.id, key: task.key, title: task.title, status: task.status, statusLabel: column?.label ?? task.status, category,
      projectId: project.id, projectKey: project.key, projectName: project.name, assigneeId: task.assigneeId,
      dueAt: task.dueAt, overdue: isOverdue(task, now, category),
    },
  }
}

/**
 * Channel task lists (chat spec 6.14): rows that point at real tasks. Anyone who can read the channel reads its list;
 * whoever may post in it adds and removes tasks; removing never touches the task. Writes tell the channel.
 */
export function taskListsApi(db: MockDb, hub: MockHub, now: () => Date): Api['taskLists'] {
  const changed = (channelId: string) => hub.publish({ type: 'channelChanged', channelId })
  return {
    async get(channelId) {
      await delay()
      const data = await db.read()
      listChannel(data, channelId)
      const at = now()
      const entries = data.channelTasks.filter((r) => r.channelId === channelId).flatMap((r) => entryOf(data, r, at) ?? [])
      return { channelId, entries }
    },
    async add(channelId, taskKey) {
      await delay()
      const entry = await db.update((data) => {
        const channel = listChannel(data, channelId)
        const me = checkCanWrite(data, channel)
        const task = data.tickets.find((t) => t.key === taskKey)
        if (!task) throw new ApiError({ title: 'Not Found', status: 404, detail: 'That task no longer exists.' })
        if (task.archivedAt) throw badRequest('This task is archived. Restore it first.')
        const project = openProject(data, task.projectId)
        if (project.workspaceId !== channel.workspaceId) throw badRequest('That task is in another workspace.')
        checkRoom(data, channelId, task.id)
        const row: ChannelTask = { id: crypto.randomUUID(), channelId, taskId: task.id, addedBy: me.id, addedAt: now().toISOString() }
        data.channelTasks.push(row)
        return entryOf(data, row, now())!
      })
      changed(channelId)
      return clone(entry)
    },
    async addNew(channelId, input, options) {
      await delay()
      // The task and its row are one write: a refusal from either part leaves neither (task list §4.2, R2). With
      // `optional` (/task, Create task) the row is made only where it may be: a full list, or a channel I may not post
      // in, still gets the task, just not on the list (final review).
      let join = true
      const created = await createTicket(
        db,
        hub,
        { ...input, linkedChannelId: channelId },
        now,
        (data) => {
          const channel = listChannel(data, channelId)
          checkNewTask(data, input)
          // A list holds its own workspace's tasks, whichever way they come (security review).
          if (openProject(data, input.projectId).workspaceId !== channel.workspaceId) throw badRequest('That task is in another workspace.')
          const joining = () => {
            checkCanWrite(data, channel)
            checkRoom(data, channelId, null)
          }
          if (options?.optional) join = passes(joining)
          else joining()
        },
        (data, task) => {
          if (join) data.channelTasks.push({ id: crypto.randomUUID(), channelId, taskId: task.id, addedBy: data.currentUserId, addedAt: now().toISOString() })
        },
      )
      changed(channelId)
      return taskView(created, await db.read(), now())
    },
    async remove(channelId, taskKey) {
      await delay()
      await db.update((data) => {
        checkCanWrite(data, listChannel(data, channelId))
        const task = data.tickets.find((t) => t.key === taskKey)
        const at = task ? data.channelTasks.findIndex((r) => r.channelId === channelId && r.taskId === task.id) : -1
        if (at < 0) throw new ApiError({ title: 'Not Found', status: 404, detail: 'That task isn’t on this list.' })
        data.channelTasks.splice(at, 1)
      })
      changed(channelId)
    },
  }
}
