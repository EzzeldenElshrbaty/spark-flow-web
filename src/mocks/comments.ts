import type { Api, Attachment, Comment, CommentView, Ticket } from '@/api/types'
import { postMessage } from './chat'
import type { DbData, MockDb } from './db'
import { checkUpload } from './files'
import { delay } from './latency'
import { findProject } from './projects'
import type { MockHub } from './realtime'
import { badRequest, clone, newId, notFound, requireCan } from './shared'

const MAX_BODY = 4000
const MAX_FILES = 5

function findTask(data: DbData, key: string): Ticket {
  const task = data.tickets.find((t) => t.key === key)
  if (!task) throw notFound('Ticket', key)
  return task
}

const withAttachments = (data: DbData, comment: Comment): CommentView => ({
  ...comment,
  attachments: comment.attachmentIds.map((id) => data.attachments.find((a) => a.id === id)).filter((a): a is Attachment => Boolean(a)),
})

/**
 * Task comments and bugs (spec §2): each is stored on its task and also posts a card in the project's chat, with the
 * same files and mentions. Files are checked before anything is written, their bytes saved before the records.
 */
export function commentsApi(db: MockDb, hub: MockHub, now: () => Date): Api['comments'] {
  return {
    async list(taskKey) {
      await delay()
      const data = await db.read()
      const task = findTask(data, taskKey)
      return clone(
        data.comments
          .filter((c) => c.taskId === task.id)
          .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
          .map((c) => withAttachments(data, c)),
      )
    },

    async create({ taskKey, kind, body, files }) {
      await delay()
      const text = body.trim()
      const before = await db.read()
      const task = findTask(before, taskKey)
      requireCan(before, 'collab.post', findProject(before, task.projectId))
      // A bug can be just a screenshot; with no file, there must be words.
      if (!text && files.length === 0) throw badRequest('Write a comment first.')
      if (text.length > MAX_BODY) throw badRequest(`Keep the comment under ${MAX_BODY} characters.`)
      if (files.length > MAX_FILES) throw badRequest(`Add up to ${MAX_FILES} files at a time.`)
      files.forEach(checkUpload)

      const at = now().toISOString()
      const attachments: Attachment[] = files.map((f) => ({ id: newId('a'), name: f.name, mimeType: f.type || 'application/octet-stream', size: f.size, createdAt: at }))
      // Bytes first, then the records: a record never points at bytes that weren't saved.
      for (const [i, f] of files.entries()) await db.putFile(attachments[i]!.id, f)

      const { comment, card } = await db.update((data) => {
        const project = findProject(data, findTask(data, taskKey).projectId)
        const me = requireCan(data, 'collab.post', project)
        const comment: Comment = { id: newId('cm'), taskId: task.id, projectId: project.id, authorId: me.id, kind, body: text, attachmentIds: attachments.map((a) => a.id), createdAt: at }
        data.attachments.push(...attachments)
        data.comments.push(comment)
        const label = kind === 'bug' ? 'Bug' : 'Comment'
        const card = postMessage(data, { channelId: project.channelId, content: text ? `${label} on ${task.key}: ${text}` : `${label} on ${task.key}`, attachments }, { commentId: comment.id })
        // The card names its task even when the body doesn't.
        card.linkedTicketKeys = [task.key]
        return { comment: withAttachments(data, comment), card: clone(card) }
      })
      hub.publish({ type: 'messageReceived', message: card })
      hub.publish({ type: 'commentAdded', taskKey: task.key, projectId: comment.projectId })
      return clone(comment)
    },
  }
}
