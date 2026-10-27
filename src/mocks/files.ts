import type { Api, Attachment, ProjectFile, StoredFile } from '@/api/types'
import { isAcceptedFile, maxFileMb } from '@/lib/fileTypes'
import type { MockDb } from './db'
import type { MockHub } from './realtime'
import { delay } from './latency'
import { findProject, openProject } from './projects'
import { ApiError } from '@/lib/apiError'
import { can } from '@/lib/permissions'
import { logActivity } from './activity'
import { badRequest, clone, currentUser, newId, notFound, requireCan } from './shared'

/** The upload rules (empty, too big, a type we don't take), with the sentence the form shows. */
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
      if (!blob || !data.attachments.some((a) => a.id === id)) throw notFound('File', id)
      return URL.createObjectURL(blob)
    },
    async list(projectId) {
      await delay()
      const data = await db.read()
      findProject(data, projectId)
      const byId = new Map(data.attachments.map((a) => [a.id, a]))
      return data.projectFiles
        .filter((f) => f.projectId === projectId && byId.has(f.attachmentId))
        .map((f) => ({ ...f, attachment: byId.get(f.attachmentId)! }))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    },
    async upload(projectId, file, signal) {
      await delay()
      const before = await db.read()
      requireCan(before, 'collab.post', openProject(before, projectId))
      checkUpload(file)
      const at = now().toISOString()
      const attachment: Attachment = { id: newId('a'), name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, createdAt: at }
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
    async remove(id) {
      await delay()
      const { projectId, orphan } = await db.update((data) => {
        const record = data.projectFiles.find((f) => f.id === id)
        if (!record) throw notFound('File', id)
        const project = openProject(data, record.projectId)
        const me = currentUser(data)
        if (record.uploadedBy !== me.id && !can('phase.manage', { userId: me.id, role: me.role, project, userTeamIds: me.teamIds }))
          throw new ApiError({ title: 'Forbidden', status: 403, detail: 'You can only remove files you added.' })
        const name = data.attachments.find((a) => a.id === record.attachmentId)?.name ?? 'a file'
        data.projectFiles = data.projectFiles.filter((f) => f.id !== id)
        // Its bytes go too, unless something else (a comment) still points at them.
        const used = data.projectFiles.some((f) => f.attachmentId === record.attachmentId) || data.comments.some((c) => c.attachmentIds.includes(record.attachmentId))
        if (!used) data.attachments = data.attachments.filter((a) => a.id !== record.attachmentId)
        logActivity(data, { projectId: project.id, taskKey: null, kind: 'file.removed', subject: name, changes: [] }, now().toISOString())
        return { projectId: project.id, orphan: used ? null : record.attachmentId }
      })
      if (orphan) await db.deleteFile(orphan)
      hub.publish({ type: 'filesChanged', projectId })
    },
  }
}
