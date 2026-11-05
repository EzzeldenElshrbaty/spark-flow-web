import type { Api, ArchivedRecord, ArchivedType, Project, StoredChannel } from '@/api/types'
import { formatDate } from '@/lib/format'
import { can } from '@/lib/permissions'
import { audit, recordOf } from './audit'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import type { MockHub } from './realtime'
import { grantsFor } from './roles'
import { badRequest, clone, currentUser, forbidden, notFound, text } from './shared'

// Archived records (Admin and help, slice 4): one list of what's archived, how long it's kept, and deleting for good.

const DAY = 86_400_000
const MAX_REASON = 200
export const MIN_RETENTION = 30
export const MAX_RETENTION = 3650

/** The optional "Why?" of an archive, tidied: null when empty; refused past 200 characters. */
export function archiveReason(value: unknown): string | null {
  const why = text(value ?? '', 'Reason').trim()
  if (why.length > MAX_REASON) throw badRequest(`Keep the reason under ${MAX_REASON} characters.`)
  return why || null
}

/** Marks a record archived (by whom, why) or restored, in the caller's write. */
export function setArchivedFields(record: { archivedAt?: string | null; archivedBy?: string | null; archiveReason?: string | null }, archive: boolean, at: string, by: string, reason: string | null) {
  record.archivedAt = archive ? at : null
  record.archivedBy = archive ? by : null
  record.archiveReason = archive ? reason : null
}

function requireManage(data: DbData) {
  const me = currentUser(data)
  if (!can('archive.manage', { userId: me.id, grants: grantsFor(data, me) })) throw forbidden('archived records')
  return me
}

const nothing = { tasks: 0, files: 0, comments: 0, phases: 0, deliverables: 0 }

/** Why the viewer can't restore a record, by the same rules as each type's own restore; null when they can. */
function restoreBlockedFor(data: DbData) {
  const me = currentUser(data)
  const ctx = { userId: me.id, grants: grantsFor(data, me), userTeamIds: me.teamIds }
  return {
    project: () => (can('project.archive', ctx) ? null : 'You can’t restore projects.'),
    task: (project: Project) => (project.archivedAt ? 'Restore its project first.' : can('task.manage', { ...ctx, project }) ? null : 'You can’t restore tasks in this project.'),
    channel: (channel: StoredChannel) => (can('channel.manage', { ...ctx, channel }) && can('channel.archive', { ...ctx, channel }) ? null : 'Only admins can restore channels.'),
  }
}

/**
 * Every archived project, task and channel in a workspace, newest archive first, with whether and when it may go and
 * whether the viewer may restore it.
 */
export function archivedIn(data: DbData, workspaceId: string): ArchivedRecord[] {
  const blocked = restoreBlockedFor(data)
  const days = data.settings.archiveRetentionDays
  const from = (archivedAt: string) => new Date(Date.parse(archivedAt) + days * DAY).toISOString()
  const projects = data.projects.filter((p) => p.workspaceId === workspaceId)
  const out: ArchivedRecord[] = []
  for (const p of projects.filter((p) => p.archivedAt)) {
    const timed = data.timeEntries.some((e) => e.projectId === p.id)
    out.push({
      type: 'project', id: p.id, name: p.name, ref: p.key, projectId: p.id,
      archivedAt: p.archivedAt!, archivedBy: p.archivedBy ?? null, reason: p.archiveReason ?? null,
      deletableFrom: timed ? null : from(p.archivedAt!), keptBecause: timed ? 'time' : null,
      includes: {
        tasks: data.tickets.filter((t) => t.projectId === p.id).length,
        files: data.projectFiles.filter((f) => f.projectId === p.id).length,
        comments: data.comments.filter((c) => c.projectId === p.id && !c.deletedAt).length,
        phases: data.phases.filter((ph) => ph.projectId === p.id).length,
        deliverables: data.deliverables.filter((d) => d.projectId === p.id).length,
      },
      restoreBlocked: blocked.project(),
    })
  }
  for (const t of data.tickets.filter((t) => t.archivedAt && projects.some((p) => p.id === t.projectId))) {
    const timed = data.timeEntries.some((e) => e.taskId === t.id)
    out.push({
      type: 'task', id: t.key, name: t.title, ref: t.key, projectId: t.projectId,
      archivedAt: t.archivedAt!, archivedBy: t.archivedBy ?? null, reason: t.archiveReason ?? null,
      deletableFrom: timed ? null : from(t.archivedAt!), keptBecause: timed ? 'time' : null,
      // A comment's files stay: the project chat's card for that comment still shows them.
      includes: { ...nothing, comments: data.comments.filter((c) => c.taskId === t.id && !c.deletedAt).length },
      restoreBlocked: blocked.task(projects.find((p) => p.id === t.projectId)!),
    })
  }
  // A project's channel is archived with its project and listed with it; the others are restored only (chat spec §13).
  for (const c of data.channels.filter((c) => c.workspaceId === workspaceId && c.kind === 'channel' && c.archivedAt && !projects.some((p) => p.channelId === c.id))) {
    out.push({
      type: 'channel', id: c.id, name: `#${c.name ?? ''}`, ref: c.name ?? '', projectId: null,
      archivedAt: c.archivedAt!, archivedBy: c.archivedBy ?? null, reason: c.archiveReason ?? null,
      deletableFrom: null, keptBecause: 'channel', includes: nothing,
      restoreBlocked: blocked.channel(c),
    })
  }
  return out.sort((a, b) => (a.archivedAt < b.archivedAt ? 1 : a.archivedAt > b.archivedAt ? -1 : 0))
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function archiveApi(db: MockDb, hub: MockHub, now: () => Date = () => new Date()): Api['archive'] {
  return {
    async list(workspaceId) {
      await delay()
      const data = await db.read()
      requireManage(data)
      if (!data.workspaces.some((w) => w.id === workspaceId)) throw notFound('Workspace', workspaceId)
      return clone({ items: archivedIn(data, workspaceId), retentionDays: data.settings.archiveRetentionDays })
    },
    async setRetention(days) {
      await delay()
      return db.update((data) => {
        requireManage(data)
        if (!Number.isInteger(days) || days < MIN_RETENTION || days > MAX_RETENTION) throw badRequest(`Keep them between ${MIN_RETENTION} and ${MAX_RETENTION} days.`)
        const was = data.settings.archiveRetentionDays
        if (was !== days) {
          data.settings.archiveRetentionDays = days
          audit(data, { action: 'changed', group: 'settings', record: { type: 'settings', id: 'archiveRetention', name: 'Archived records' }, changes: [{ field: 'Kept for (days)', from: String(was), to: String(days) }] })
        }
        return days
      })
    },
    async deleteForGood(type: ArchivedType, id) {
      await delay()
      const { projectId, orphans } = await db.update((data) => {
        requireManage(data)
        if (type === 'channel') throw badRequest('Channels are restored, not deleted for good.')
        const project = type === 'project' ? data.projects.find((p) => p.id === id) : undefined
        const task = type === 'task' ? data.tickets.find((t) => t.key === id) : undefined
        if (type === 'project' && !project) throw notFound('Project', id)
        if (type === 'task' && !task) throw notFound('Ticket', id)
        if (type !== 'project' && type !== 'task') throw badRequest("That isn't something that can be archived.")
        const row = archivedIn(data, (project ?? data.projects.find((p) => p.id === task!.projectId))!.workspaceId).find((r) => r.type === type && r.id === id)
        if (!row) throw badRequest('Only archived records can be deleted for good.')
        if (row.keptBecause === 'time') throw badRequest('It has time logged on it, so it’s kept: its hours and cost stay in reports.')
        if (row.deletableFrom && row.deletableFrom > now().toISOString()) throw badRequest(`It can be deleted for good from ${formatDate(row.deletableFrom)}.`)
        const { tasks, files, comments } = row.includes
        const detail = ['Deleted for good', tasks && plural(tasks, 'task'), files && plural(files, 'file'), comments && plural(comments, 'comment')].filter(Boolean).join(' · ')
        let orphans: string[] = []
        if (project) {
          const fileIds = data.projectFiles.filter((f) => f.projectId === project.id).map((f) => f.attachmentId)
          audit(data, { action: 'deleted', group: 'status', record: recordOf.project(project), detail })
          data.tickets = data.tickets.filter((t) => t.projectId !== project.id)
          data.comments = data.comments.filter((c) => c.projectId !== project.id)
          data.phases = data.phases.filter((p) => p.projectId !== project.id)
          data.deliverables = data.deliverables.filter((d) => d.projectId !== project.id)
          data.sprints = data.sprints.filter((s) => s.projectId !== project.id)
          data.projectFiles = data.projectFiles.filter((f) => f.projectId !== project.id)
          data.activity = data.activity.filter((a) => a.projectId !== project.id)
          delete data.counters[project.id]
          data.projects = data.projects.filter((p) => p.id !== project.id)
          // Its key is never used again: the log and old links still name its tasks.
          data.settings.retiredKeys = [...(data.settings.retiredKeys ?? []), project.key]
          // Its channel stays, archived, as a channel of its own: channels are restored only.
          // A file goes with it unless a message, a comment or another project still uses it.
          const used = (fileId: string) =>
            [...data.messages, ...data.replies].some((row) => row.attachments.some((a) => a.id === fileId)) ||
            data.projectFiles.some((f) => f.attachmentId === fileId) ||
            data.comments.some((c) => c.attachmentIds.includes(fileId))
          orphans = fileIds.filter((f) => !used(f))
          data.attachments = data.attachments.filter((a) => !orphans.includes(a.id))
          return { projectId: project.id, orphans }
        }
        audit(data, { action: 'deleted', group: 'status', record: recordOf.task(task!), detail })
        data.tickets = data.tickets.filter((t) => t.id !== task!.id)
        data.comments = data.comments.filter((c) => c.taskId !== task!.id)
        data.activity = data.activity.filter((a) => a.taskKey !== task!.key)
        return { projectId: task!.projectId, orphans }
      })
      for (const fileId of orphans) await db.deleteFile(fileId)
      hub.publish({ type: 'projectChanged', projectId })
    },
  }
}
