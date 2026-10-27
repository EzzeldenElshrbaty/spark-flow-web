import type { Api, Attachment, ProjectFile, StoredFile } from '@/api/types'
import { isAcceptedFile, maxFileMb } from '@/lib/fileTypes'
import type { MockDb } from './db'
import type { MockHub } from './realtime'
import { delay } from './latency'
import { findProject } from './projects'
import { badRequest, clone, newId, notFound, requireCan } from './shared'

/** The upload rules (empty, too big, a type we don't take), with the sentence the form shows. */
export function checkUpload(file: { size: number; name: string }) {
  if (file.size === 0) throw badRequest('That file is empty.')
  if (file.size > maxFileMb * 1024 * 1024) throw badRequest(`Files can be up to ${maxFileMb} MB.`)
  if (!isAcceptedFile(file.name)) throw badRequest("That type of file can't be added.")
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
    async upload(projectId, file) {
      await delay()
      const before = await db.read()
      requireCan(before, 'collab.post', findProject(before, projectId))
      checkUpload(file)
      const at = now().toISOString()
      const attachment: Attachment = { id: newId('a'), name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, createdAt: at }
      // Bytes first, then the record: a record never points at bytes that weren't saved.
      await db.putFile(attachment.id, file)
      const stored: StoredFile = await db.update((data) => {
        const me = requireCan(data, 'collab.post', findProject(data, projectId))
        const record: ProjectFile = { id: newId('pf'), projectId, attachmentId: attachment.id, uploadedBy: me.id, createdAt: at }
        data.attachments.push(attachment)
        data.projectFiles.push(record)
        return { ...record, attachment }
      })
      hub.publish({ type: 'filesChanged', projectId })
      return clone(stored)
    },
  }
}
