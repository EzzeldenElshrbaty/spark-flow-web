import type { Api, MentionItem, Mention } from '@/api/types'
import type { DbData, MockDb } from './db'
import type { MockHub } from './realtime'
import { delay } from './latency'
import { clone, currentUser, excerptOf } from './shared'
import { projectPeopleIds } from '@/lib/projectPeople'
import { silenced } from './membership'

const MAX_ITEMS = 50

/** The people of a project (see projectPeople), or nobody when it's gone. */
function projectPeople(data: DbData, projectId: string): Set<string> {
  const project = data.projects.find((p) => p.id === projectId)
  return project ? projectPeopleIds(project, data.users) : new Set()
}

/**
 * Whether these mentions reach `userId`: by name, by @channel when they are among `everyone`, or by @here when they
 * are also active (spec 6.8). In a private channel or a DM only its members can be reached, so its text never shows
 * in anyone else's bell.
 */
const reaches = (mentions: Mention[], userId: string, everyone: () => Set<string>, closed = false, active: (id: string) => boolean = () => false) =>
  (!closed || everyone().has(userId)) &&
  mentions.some((m) => (m.kind === 'user' && m.id === userId) || (m.kind === 'all' && everyone().has(userId)) || (m.kind === 'here' && everyone().has(userId) && active(userId)))

/** Who a new message or reply by `senderId` in a channel mentions (by name, or @all for its members): they hear of it live. */
export function reachedBy(data: DbData, mentions: Mention[], channelId: string, senderId: string): string[] {
  const channel = data.channels.find((c) => c.id === channelId)
  const everyone = () => new Set(channel?.memberIds ?? [])
  const active = (id: string) => data.users.find((u) => u.id === id)?.presence === 'active'
  return data.users.filter((u) => u.id !== senderId && reaches(mentions, u.id, everyone, channel?.isPrivate ?? false, active)).map((u) => u.id)
}

/**
 * Messages, replies and task comments by someone else that mention `userId` (by name, or @all where they are a
 * channel member or one of the project's people), newest first. A comment counts once, not again as its chat card.
 * `keep` filters them before the newest `limit` are taken, so what's left out never uses up the window.
 */
export function mentionsFor(data: DbData, userId: string, keep: (item: Omit<MentionItem, 'read'>) => boolean = () => true, limit = MAX_ITEMS): Omit<MentionItem, 'read'>[] {
  const members = (channelId: string) => () => new Set(data.channels.find((c) => c.id === channelId)?.memberIds ?? [])
  const closed = (channelId: string) => data.channels.find((c) => c.id === channelId)?.isPrivate ?? false
  // @here reached whoever was active; the mock keeps only presence now, so that stands in for then.
  const active = (id: string) => data.users.find((u) => u.id === id)?.presence === 'active'
  const items: Omit<MentionItem, 'read'>[] = []
  const nameOf = (id: string) => data.users.find((u) => u.id === id)?.name ?? 'Someone'
  const wsOfChannel = (channelId: string) => data.channels.find((c) => c.id === channelId)?.workspaceId ?? ''
  for (const m of data.messages) {
    if (m.commentId || m.deletedAt || m.senderId === userId || !reaches(m.mentions, userId, members(m.channelId), closed(m.channelId), active)) continue
    items.push({ id: m.id, source: 'message', workspaceId: wsOfChannel(m.channelId), authorId: m.senderId, authorName: nameOf(m.senderId), excerpt: excerptOf(m.content), createdAt: m.createdAt, channelId: m.channelId, messageId: m.id, taskKey: null, projectId: null })
  }
  for (const r of data.replies) {
    if (r.deletedAt || r.senderId === userId || !reaches(r.mentions, userId, members(r.channelId), closed(r.channelId), active)) continue
    items.push({ id: r.id, source: 'reply', workspaceId: wsOfChannel(r.channelId), authorId: r.senderId, authorName: nameOf(r.senderId), excerpt: excerptOf(r.content), createdAt: r.createdAt, channelId: r.channelId, messageId: r.messageId, taskKey: null, projectId: null })
  }
  for (const c of data.comments) {
    if (c.authorId === userId || c.deletedAt) continue
    // Comments keep their text; their mentions are read from it, like a message's.
    const card = data.messages.find((m) => m.commentId === c.id)
    const mentions = card?.mentions ?? []
    if (!reaches(mentions, userId, () => projectPeople(data, c.projectId))) continue
    const taskKey = data.tickets.find((t) => t.id === c.taskId)?.key ?? null
    items.push({ id: c.id, source: 'comment', workspaceId: data.projects.find((p) => p.id === c.projectId)?.workspaceId ?? '', authorId: c.authorId, authorName: nameOf(c.authorId), excerpt: excerptOf(c.body), createdAt: c.createdAt, channelId: null, messageId: null, taskKey, projectId: c.projectId })
  }
  return items.filter(keep).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit)
}

/** Mentions of me, for the bell and Home, with their read state (kept per person). */
export function mentionsApi(db: MockDb, hub: MockHub): Api['mentions'] {
  return {
    async mine() {
      await delay()
      const data = await db.read()
      const me = currentUser(data)
      const read = new Set(data.mentionReads[me.id] ?? [])
      // Channels I set to Nothing (spec 6.11) stay out of the bell.
      const quiet = silenced(data, me.id)
      return clone(mentionsFor(data, me.id, (item) => !quiet(item.channelId)).map((item) => ({ ...item, read: read.has(item.id) })))
    },
    async markRead(ids) {
      await delay()
      const userId = await db.update((data) => {
        const me = currentUser(data)
        data.mentionReads[me.id] = [...new Set([...(data.mentionReads[me.id] ?? []), ...ids])]
        return me.id
      })
      hub.publish({ type: 'readChanged', userId })
    },
  }
}
