import type { Api, Attachment, ChatMessage, FileDetails, ProjectFile, StoredFile } from '@/api/types'
import { fileDescriptionError, fileTitleError } from '@/lib/fileDetails'
import { isAcceptedFile, maxFileMb } from '@/lib/fileTypes'
import { checkCanWrite, findChannel, postMessage } from './chat'
import type { DbData, MockDb } from './db'
import { canRead } from './membership'
import { reachedBy } from './mentions'
import type { MockHub } from './realtime'
import { delay } from './latency'
import { findProject, openProject } from './projects'
import { ApiError } from '@/lib/apiError'
import { can } from '@/lib/permissions'
import { logActivity } from './activity'
import { CODE_LANGUAGES } from '@/lib/codeTokens'
import { badRequest, clone, currentUser, newId, notFound, requireCan } from './shared'

/** The upload rules (empty, too big, a type we don't take), with the sentence the form shows. */
/** A snippet is a .txt file in a language the card knows (spec 6.9). */
function checkSnippet(file: { name: string }, language: string) {
  if (!CODE_LANGUAGES.some((l) => l.id === language)) throw badRequest("That snippet type isn't supported.")
  if (!/\.txt$/i.test(file.name)) throw badRequest('A snippet is a .txt file.')
}

export function checkUpload(file: { size: number; name: string }) {
  if (file.size === 0) throw badRequest('That file is empty.')
  if (file.size > maxFileMb * 1024 * 1024) throw badRequest(`Files can be up to ${maxFileMb} MB.`)
  if (!isAcceptedFile(file.name)) throw badRequest("That type of file can't be added.")
}

/**
 * Saves the bytes, then runs the write that records them. Bytes first, so a record never points at bytes that weren't
 * saved; and if saving any of them or the write fails, the bytes saved so far are thrown away, so none are left behind.
 */
export async function withSavedBytes<T>(db: MockDb, bytes: [id: string, blob: Blob][], write: () => Promise<T>): Promise<T> {
  const saved: string[] = []
  try {
    for (const [id, blob] of bytes) {
      await db.putFile(id, blob)
      saved.push(id)
    }
    return await write()
  } catch (error) {
    await Promise.all(saved.map((id) => db.deleteFile(id)))
    throw error
  }
}

/** A new file's record: titled after itself, no description, checked clean (the prototype has no scanner). */
export function fileRecord(file: { name: string; type: string; size: number }, uploadedBy: string, at: string, snippet: Attachment['snippet'] = null): Attachment {
  return {
    id: newId('a'), name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, createdAt: at,
    uploadedBy, title: snippet ? file.name.replace(/\.txt$/i, '') : file.name, description: '', scanStatus: 'clean', thumbUrl: null, previewUrl: null, deletedAt: null, snippet,
  }
}

/** Whether I'm on a project, for its files (reading isn't frozen: an archived project's files still open). */
const onProject = (data: DbData, projectId: string) => {
  const me = currentUser(data)
  const project = data.projects.find((p) => p.id === projectId)
  return Boolean(project) && can('collab.post', { userId: me.id, role: me.role, project: { ...project!, archivedAt: null }, userTeamIds: me.teamIds })
}

/** Where a file is, as I may see it: messages and replies in channels I can read, task comments and project files. */
function placesOf(data: DbData, fileId: string): Omit<FileDetails, 'file'> {
  const me = data.currentUserId
  const has = (row: { attachments: Attachment[] }) => row.attachments.some((a) => a.id === fileId)
  const sharedIn = [
    ...data.messages.filter((m) => has(m) && canRead(data, m.channelId, me)).map((m) => ({ channelId: m.channelId, messageId: m.id, replyId: null, at: m.createdAt })),
    ...data.replies.filter((r) => has(r) && canRead(data, r.channelId, me)).map((r) => ({ channelId: r.channelId, messageId: r.messageId, replyId: r.id, at: r.createdAt })),
  ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  const taskKeys = data.comments
    .filter((c) => c.attachmentIds.includes(fileId) && onProject(data, c.projectId))
    .flatMap((c) => data.tickets.find((t) => t.id === c.taskId)?.key ?? [])
  const projectIds = data.projectFiles.filter((f) => f.attachmentId === fileId && onProject(data, f.projectId)).map((f) => f.projectId)
  return { sharedIn, taskKeys: [...new Set(taskKeys)], projectIds: [...new Set(projectIds)] }
}

/** Whether a file was ever sent: in a message or a reply, or in one deleted within the Undo window. */
const everSent = (data: DbData, fileId: string) =>
  [...data.messages, ...data.replies, ...data.trash.map((t) => t.snapshot)].some((row) => row.attachments?.some((a) => a.id === fileId))

/** A file I may see somewhere (or uploaded and haven't sent yet), not deleted: anything else is not found. */
function visibleFile(data: DbData, fileId: string): Attachment {
  const file = data.attachments.find((a) => a.id === fileId)
  if (!file || file.deletedAt) throw notFound('File', fileId)
  const places = placesOf(data, fileId)
  const unsent = file.uploadedBy === data.currentUserId && !everSent(data, fileId)
  if (!places.sharedIn.length && !places.taskKeys.length && !places.projectIds.length && !unsent) throw notFound('File', fileId)
  return file
}

/** Whoever uploaded it, or an Admin (spec §9). */
function requireFileManage(data: DbData, file: Attachment) {
  const me = currentUser(data)
  if (!can('file.manage', { userId: me.id, role: me.role, uploadedBy: file.uploadedBy })) {
    throw new ApiError({ title: 'Forbidden', status: 403, detail: 'Only whoever uploaded it, or an admin, can change this file.' })
  }
}

/**
 * Nothing where the file is may be archived: an archived project is frozen, and an archived channel is read-only, until
 * they're restored.
 */
function requireUnfrozen(data: DbData, fileId: string) {
  const projectIds = [
    ...data.projectFiles.filter((f) => f.attachmentId === fileId).map((f) => f.projectId),
    ...data.comments.filter((c) => c.attachmentIds.includes(fileId)).map((c) => c.projectId),
  ]
  for (const projectId of new Set(projectIds)) openProject(data, projectId)
  const channelIds = [...data.messages, ...data.replies].filter((row) => row.attachments.some((a) => a.id === fileId)).map((row) => row.channelId)
  if (channelIds.some((id) => data.channels.find((c) => c.id === id)?.archivedAt)) throw badRequest('This channel is archived.')
}

/** Applies a change to a file's record and to every copy of it in messages and replies; says which messages changed. */
function changeEverywhere(data: DbData, fileId: string, change: Partial<Attachment>): { channelId: string; messageId: string }[] {
  const changed: { channelId: string; messageId: string }[] = []
  Object.assign(data.attachments.find((a) => a.id === fileId)!, change)
  for (const row of [...data.messages, ...data.replies]) {
    const copy = row.attachments.find((a) => a.id === fileId)
    if (!copy) continue
    Object.assign(copy, change)
    changed.push({ channelId: row.channelId, messageId: 'messageId' in row ? row.messageId : row.id })
  }
  return changed
}

/** Throws the AbortError a cancelled upload rejects with. */
const throwIfCancelled = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
}

export function filesApi(db: MockDb, hub: MockHub, now: () => Date): Api['files'] {
  return {
    /** A blob: address for a stored file. The page that shows it frees it with URL.revokeObjectURL when done. */
    async url(id) {
      await delay()
      const [blob, data] = await Promise.all([db.getFile(id), db.read()])
      const file = data.attachments.find((a) => a.id === id)
      if (!blob || !file || file.deletedAt) throw notFound('File', id)
      // A chat file opens for whoever reads a channel it's in, or uploaded it and hasn't sent it yet.
      const places = placesOf(data, id)
      const unsent = file.uploadedBy === data.currentUserId && !everSent(data, id)
      if (!places.sharedIn.length && !unsent) {
        // Otherwise it's a project's: a project file, or a comment's attachment, for people on the project.
        const projectId = data.projectFiles.find((f) => f.attachmentId === id)?.projectId ?? data.comments.find((c) => c.attachmentIds.includes(id))?.projectId
        if (!projectId) throw notFound('File', id)
        // Reading isn't frozen: an archived project's files still open.
        requireCan(data, 'collab.post', { ...findProject(data, projectId), archivedAt: null })
      }
      if (file.scanStatus === 'blocked') throw badRequest('This file was blocked.')
      if (file.scanStatus === 'pending') throw badRequest('This file is still being checked.')
      return URL.createObjectURL(blob)
    },
    async list(projectId) {
      await delay()
      const data = await db.read()
      findProject(data, projectId)
      const byId = new Map(data.attachments.map((a) => [a.id, a]))
      return data.projectFiles
        .filter((f) => f.projectId === projectId && byId.has(f.attachmentId) && !byId.get(f.attachmentId)!.deletedAt)
        .map((f) => ({ ...f, attachment: byId.get(f.attachmentId)! }))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    },
    async upload(projectId, file, signal) {
      await delay()
      const before = await db.read()
      requireCan(before, 'collab.post', openProject(before, projectId))
      checkUpload(file)
      const at = now().toISOString()
      const attachment = fileRecord(file, currentUser(before).id, at)
      throwIfCancelled(signal)
      const stored: StoredFile = await withSavedBytes(db, [[attachment.id, file]], () => {
        // Cancelled while the bytes were saved: withSavedBytes throws them away.
        throwIfCancelled(signal)
        return db.update((data) => {
          const me = requireCan(data, 'collab.post', openProject(data, projectId))
          const record: ProjectFile = { id: newId('pf'), projectId, attachmentId: attachment.id, uploadedBy: me.id, createdAt: at }
          data.attachments.push(attachment)
          data.projectFiles.push(record)
          return { ...record, attachment }
        })
      })
      hub.publish({ type: 'filesChanged', projectId })
      return clone(stored)
    },
    async removeFromProject(projectId, fileId) {
      await delay()
      const { orphan } = await db.update((data) => {
        const record = data.projectFiles.find((f) => f.projectId === projectId && f.attachmentId === fileId)
        if (!record) throw notFound('File', fileId)
        const project = openProject(data, record.projectId)
        const me = currentUser(data)
        if (record.uploadedBy !== me.id && !can('phase.manage', { userId: me.id, role: me.role, project, userTeamIds: me.teamIds }))
          throw new ApiError({ title: 'Forbidden', status: 403, detail: 'You can only remove files you added.' })
        const name = data.attachments.find((a) => a.id === record.attachmentId)?.name ?? 'a file'
        data.projectFiles = data.projectFiles.filter((f) => f !== record)
        // Its bytes go too, unless something else (a comment, a message) still points at them.
        const inChat = [...data.messages, ...data.replies].some((row) => row.attachments.some((a) => a.id === fileId))
        const used = inChat || data.projectFiles.some((f) => f.attachmentId === fileId) || data.comments.some((c) => c.attachmentIds.includes(fileId))
        if (!used) data.attachments = data.attachments.filter((a) => a.id !== fileId)
        logActivity(data, { projectId: project.id, taskKey: null, kind: 'file.removed', subject: name, changes: [] }, now().toISOString())
        return { orphan: used ? null : fileId }
      })
      if (orphan) await db.deleteFile(orphan)
      hub.publish({ type: 'filesChanged', projectId })
    },
    async uploadForChat(channelId, file, { onProgress, signal, snippet } = {}) {
      await delay()
      // upload-url: whoever may post in the channel, under the files rules.
      const before = await db.read()
      const me = checkCanWrite(before, findChannel(before, channelId))
      checkUpload(file)
      if (snippet) checkSnippet(file, snippet.language)
      throwIfCancelled(signal)
      // The bytes go up in steps, as the browser reports them.
      for (const step of [0.25, 0.5, 0.75]) {
        onProgress?.(step)
        await delay()
        throwIfCancelled(signal)
      }
      const record = fileRecord(file, me.id, now().toISOString(), snippet ? { language: snippet.language } : null)
      // complete: the prototype has no scanner, so a finished upload is clean.
      const stored = await withSavedBytes(db, [[record.id, file]], () => {
        throwIfCancelled(signal)
        return db.update((data) => {
          checkCanWrite(data, findChannel(data, channelId))
          data.attachments.push(record)
          return record
        })
      })
      onProgress?.(1)
      return clone(stored)
    },
    async details(id) {
      await delay()
      const data = await db.read()
      return clone({ file: visibleFile(data, id), ...placesOf(data, id) })
    },
    async update(id, patch) {
      await delay()
      const { file, changed } = await db.update((data) => {
        const file = visibleFile(data, id)
        requireFileManage(data, file)
        requireUnfrozen(data, id)
        const title = (patch.title ?? file.title).trim()
        const description = (patch.description ?? file.description).trim()
        const wrong = fileTitleError(title) ?? fileDescriptionError(description)
        if (wrong) throw badRequest(wrong)
        const changed = changeEverywhere(data, id, { title, description })
        return { file: clone(file), changed }
      })
      hub.publish({ type: 'fileChanged', fileId: id })
      for (const { channelId, messageId } of changed) hub.publish({ type: 'messageChanged', channelId, messageId })
      return file
    },
    async delete(id) {
      await delay()
      const { changed, projectIds } = await db.update((data) => {
        const file = visibleFile(data, id)
        requireFileManage(data, file)
        requireUnfrozen(data, id)
        const projectIds = data.projectFiles.filter((f) => f.attachmentId === id).map((f) => f.projectId)
        // The record stays, marked, so where it was shared can say it was deleted; the bytes go.
        return { changed: changeEverywhere(data, id, { deletedAt: now().toISOString() }), projectIds }
      })
      await db.deleteFile(id)
      hub.publish({ type: 'fileChanged', fileId: id })
      for (const { channelId, messageId } of changed) hub.publish({ type: 'messageChanged', channelId, messageId })
      for (const projectId of new Set(projectIds)) hub.publish({ type: 'filesChanged', projectId })
    },
    async share(id, channelId, content = '') {
      await delay()
      const { message, mentioned } = await db.update((data) => {
        const file = visibleFile(data, id)
        // Only whoever uploaded it, or an Admin: nobody else carries a file from where it is to a wider channel.
        const me = currentUser(data)
        if (!can('file.manage', { userId: me.id, role: me.role, uploadedBy: file.uploadedBy })) {
          throw new ApiError({ title: 'Forbidden', status: 403, detail: 'Only whoever uploaded it, or an admin, can share this file.' })
        }
        if (file.scanStatus !== 'clean') throw badRequest(file.scanStatus === 'blocked' ? 'This file was blocked.' : 'This file is still being checked.')
        checkCanWrite(data, findChannel(data, channelId))
        const message: ChatMessage = postMessage(data, { channelId, content: content.trim(), attachments: [clone(file)] })
        return { message, mentioned: reachedBy(data, message, channelId, me.id) }
      })
      hub.publish({ type: 'messageReceived', message: clone(message) })
      hub.publish({ type: 'fileChanged', fileId: id })
      for (const userId of mentioned) hub.publish({ type: 'notificationCreated', userId })
      return clone(message)
    },
  }
}
