import type { Api, ChannelTask, TaskListEntry, Ticket } from '@/api/types'
import { ApiError } from '@/lib/apiError'
import { columnsOf } from '@/lib/boardColumns'
import { checkCanWrite, readableChannel } from './chat'
import type { DbData, MockDb } from './db'
import { isOverdue } from './derive'
import { delay } from './latency'
import { openProject } from './projects'
import type { MockHub } from './realtime'
import { badRequest, clone } from './shared'

/** The most tasks one channel's list holds (task list §4.2). */
export const TASK_LIST_MAX = 200

/** The channel a list belongs to: one I may read (404/403 as today), and a channel, not a DM. */
export function listChannel(data: DbData, channelId: string) {
  const channel = readableChannel(data, channelId)
  if (channel.kind !== 'channel') throw badRequest('Task lists are for channels.')
  return channel
}

/** Room on the channel's list for this task: not on it yet, and under the limit. */
export function checkRoom(data: DbData, channelId: string, task: Pick<Ticket, 'id'>) {
  const rows = data.channelTasks.filter((r) => r.channelId === channelId)
  if (rows.some((r) => r.taskId === task.id)) throw new ApiError({ title: 'Conflict', status: 409, detail: 'That task is already on this list.' })
  if (rows.length >= TASK_LIST_MAX) throw badRequest(`A task list holds up to ${TASK_LIST_MAX} tasks.`)
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
        checkRoom(data, channelId, task)
        const row: ChannelTask = { id: crypto.randomUUID(), channelId, taskId: task.id, addedBy: me.id, addedAt: now().toISOString() }
        data.channelTasks.push(row)
        return entryOf(data, row, now())!
      })
      changed(channelId)
      return clone(entry)
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
