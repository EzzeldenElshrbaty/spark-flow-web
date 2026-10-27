import type { Api, Attachment, Comment, CommentView, Ticket } from '@/api/types'
import { postMessage } from './chat'
import type { DbData, MockDb } from './db'
import { checkUpload } from './files'
import { delay } from './latency'
import { findProject } from './projects'
import type { MockHub } from './realtime'
import { ApiError } from '@/lib/apiError'
import { badRequest, clone, currentUser, newId, notFound, requireCan } from './shared'
import { parseMentions } from './text'
import { logActivity } from './activity'

const MAX_BODY = 4000
const MAX_FILES = 5

function findTask(data: DbData, key: string): Ticket {
  const task = data.tickets.find((t) => t.key === key)
  if (!task) throw notFound('Ticket', key)
  return task
}

/** The text of a comment's card in the project's chat. */
const cardText = (kind: Comment['kind'], key: string, body: string) => {
  const label = kind === 'bug' ? 'Bug' : 'Comment'
  return body ? `${label} on ${key}: ${body}` : `${label} on ${key}`
}

/** A comment I may change: mine, on a project I can still post in, and not deleted. */
function ownComment(data: DbData, id: string): { comment: Comment; task: Ticket } {
  const comment = data.comments.find((c) => c.id === id)
  if (!comment) throw notFound('Comment', id)
  const task = data.tickets.find((t) => t.id === comment.taskId)
  if (!task) throw notFound('Ticket', comment.taskId)
  requireCan(data, 'collab.post', findProject(data, task.projectId))
  if (comment.authorId !== currentUser(data).id) throw new ApiError({ title: 'Forbidden', status: 403, detail: 'You can only change your own comments.' })
  if (comment.deletedAt) throw badRequest("This comment can't be changed.")
  return { comment, task }
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
        const card = postMessage(data, { channelId: project.channelId, content: cardText(kind, task.key, text), attachments }, { commentId: comment.id })
        // History says a comment or bug was added, never what it says.
        logActivity(data, { projectId: project.id, taskKey: task.key, kind: 'comment.added', subject: kind, changes: [] })
        // The card names its task even when the body doesn't.
        card.linkedTicketKeys = [task.key]
        return { comment: withAttachments(data, comment), card: clone(card) }
      })
      hub.publish({ type: 'messageReceived', message: card })
      hub.publish({ type: 'commentAdded', taskKey: task.key, projectId: comment.projectId })
      return clone(comment)
    },

    async update(id, body) {
      await delay()
      const text = body.trim()
      const { view, card, taskKey } = await db.update((data) => {
        const { comment, task } = ownComment(data, id)
        if (!text && comment.attachmentIds.length === 0) throw badRequest('Write a comment first.')
        if (text.length > MAX_BODY) throw badRequest(`Keep the comment under ${MAX_BODY} characters.`)
        const at = now().toISOString()
        comment.body = text
        comment.editedAt = at
        logActivity(data, { projectId: comment.projectId, taskKey: task.key, kind: 'comment.edited', subject: comment.kind, changes: [] })
        // The card in the chat says the same, with its mentions worked out again.
        const card = data.messages.find((m) => m.commentId === comment.id)
        if (card) {
          card.content = cardText(comment.kind, task.key, text)
          card.mentions = parseMentions(text)
          card.editedAt = at
        }
        return { view: withAttachments(data, comment), card: card && { channelId: card.channelId, messageId: card.id }, taskKey: task.key }
      })
      if (card) hub.publish({ type: 'messageChanged', ...card })
      hub.publish({ type: 'commentAdded', taskKey, projectId: view.projectId })
      return clone(view)
    },

    async remove(id) {
      await delay()
      const { card, taskKey, projectId } = await db.update((data) => {
        const { comment, task } = ownComment(data, id)
        const at = now().toISOString()
        Object.assign(comment, { body: '', attachmentIds: [], deletedAt: at })
        logActivity(data, { projectId: comment.projectId, taskKey: task.key, kind: 'comment.deleted', subject: comment.kind, changes: [] })
        const card = data.messages.find((m) => m.commentId === comment.id)
        if (card) Object.assign(card, { content: '', attachments: [], mentions: [], reactions: [], deletedAt: at })
        return { card: card && { channelId: card.channelId, messageId: card.id }, taskKey: task.key, projectId: comment.projectId }
      })
      if (card) hub.publish({ type: 'messageChanged', ...card })
      hub.publish({ type: 'commentAdded', taskKey, projectId })
    },
  }
}
