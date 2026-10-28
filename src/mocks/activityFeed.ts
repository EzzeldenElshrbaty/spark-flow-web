import type { ActivityItem, Api } from '@/api/types'
import { canRead, silenced } from './membership'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import { mentionsFor } from './mentions'
import type { MockHub } from './realtime'
import { clone, currentUser, excerptOf } from './shared'

const MAX_ITEMS = 100

/** The workspace a channel is in. */
const workspaceOf = (data: DbData, channelId: string) => data.channels.find((c) => c.id === channelId)?.workspaceId

/**
 * This person's Activity in a workspace (spec 6.12), newest first: their mentions (as the bell has them, with its read
 * state), and the items kept for them (reactions to theirs, replies in threads they follow), whose text is read from
 * the message or reply now. Channels set to Nothing, and channels they can no longer read, are left out; a reply that
 * mentions them is its mention alone.
 */
export function activityFor(data: DbData, userId: string, workspaceId: string): ActivityItem[] {
  const quiet = silenced(data, userId)
  const read = new Set(data.mentionReads[userId] ?? [])
  const nameOf = (id: string) => data.users.find((u) => u.id === id)?.name ?? 'Someone'
  const mentions: ActivityItem[] = mentionsFor(data, userId, (m) => m.workspaceId === workspaceId && !quiet(m.channelId), MAX_ITEMS)
    .map((m) => ({
      id: m.id, kind: 'mention', read: read.has(m.id), createdAt: m.createdAt, workspaceId: m.workspaceId, actorId: m.authorId, actorName: m.authorName,
      channelId: m.channelId, messageId: m.messageId, replyId: m.source === 'reply' ? m.id : null, taskKey: m.taskKey, projectId: m.projectId, excerpt: m.excerpt, emoji: null,
    }))
  // A reply's mention id is the reply's id.
  const mentioned = new Set(mentions.map((m) => m.id))
  const kept: ActivityItem[] = []
  for (const n of data.notifications) {
    if (n.userId !== userId || workspaceOf(data, n.channelId) !== workspaceId || quiet(n.channelId) || !canRead(data, n.channelId, userId)) continue
    if (n.kind === 'thread' && n.replyId && mentioned.has(n.replyId)) continue
    const row = n.replyId ? data.replies.find((r) => r.id === n.replyId) : data.messages.find((m) => m.id === n.messageId)
    if (!row || row.deletedAt) continue
    kept.push({
      id: n.id, kind: n.kind, read: n.read, createdAt: n.at, workspaceId, actorId: n.actorId, actorName: nameOf(n.actorId),
      channelId: n.channelId, messageId: n.messageId, replyId: n.replyId, taskKey: null, projectId: null, excerpt: excerptOf(row.content), emoji: n.emoji,
    })
  }
  return [...mentions, ...kept].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)).slice(0, MAX_ITEMS)
}

/** Activity (spec 6.12): the list, and marking items read (a mention's read state is the bell's). */
export function inboxApi(db: MockDb, hub: MockHub): Api['inbox'] {
  return {
    async list(workspaceId) {
      await delay()
      const data = await db.read()
      return clone(activityFor(data, currentUser(data).id, workspaceId))
    },
    async markRead(workspaceId, ids) {
      await delay()
      const userId = await db.update((data) => {
        const me = currentUser(data)
        const wanted = new Set(ids ?? activityFor(data, me.id, workspaceId).map((item) => item.id))
        // Any mention of mine in this workspace, not only the newest (an older one can still be on screen); and only
        // this workspace's items, as the route says.
        const here = (m: { workspaceId: string }) => m.workspaceId === workspaceId
        const mentionIds = new Set(mentionsFor(data, me.id, here, Infinity).map((m) => m.id))
        data.mentionReads[me.id] = [...new Set([...(data.mentionReads[me.id] ?? []), ...[...wanted].filter((id) => mentionIds.has(id))])]
        for (const n of data.notifications) if (n.userId === me.id && wanted.has(n.id) && workspaceOf(data, n.channelId) === workspaceId) n.read = true
        return me.id
      })
      hub.publish({ type: 'readChanged', userId })
    },
  }
}
