import type { Api, ChatMessage, MentionItem, Mention, ThreadReply } from '@/api/types'
import { bodyText } from '@/lib/messageBody'
import { matchedKeyword } from '@/lib/searchQuery'
import type { DbData, MockDb } from './db'
import type { MockHub } from './realtime'
import { delay } from './latency'
import { clone, currentUser, excerptOf } from './shared'
import { projectPeopleIds } from '@/lib/projectPeople'
import { canRead, keywordsSinceOf, prefsOf, silenced, stateOf } from './membership'
import { keywordable } from '@/lib/notifyRules'

const MAX_ITEMS = 50

/** The people of a project (see projectPeople), or nobody when it's gone. */
function projectPeople(data: DbData, projectId: string): Set<string> {
  const project = data.projects.find((p) => p.id === projectId)
  return project ? projectPeopleIds(project, data.users) : new Set()
}

/**
 * Whether these mentions reach `userId`: by name, by @channel when they are among `everyone`, or by @here when they
 * were active (`active`: who the message's @here reached, spec 6.8). In a private channel or a DM only its members
 * can be reached, so its text never shows in anyone else's bell.
 */
const reaches = (mentions: Mention[], userId: string, everyone: () => Set<string>, closed = false, active: (id: string) => boolean = () => false) =>
  (!closed || everyone().has(userId)) &&
  mentions.some((m) => (m.kind === 'user' && m.id === userId) || (m.kind === 'all' && everyone().has(userId)) || (m.kind === 'here' && everyone().has(userId) && active(userId)))

/** Who @here reaches in a channel now: its members other than `senderId` who are active (spec 6.8). Kept on the row. */
export function hereReached(data: DbData, channelId: string, senderId: string): string[] {
  const members = data.channels.find((c) => c.id === channelId)?.memberIds ?? []
  return members.filter((id) => id !== senderId && data.users.find((u) => u.id === id)?.presence === 'active')
}

/** Who a new message or reply by `senderId` in a channel mentions (by name, @channel, or the @here it kept): they hear of it live. */
export function reachedBy(data: DbData, row: { mentions: Mention[]; hereIds?: string[] }, channelId: string, senderId: string): string[] {
  const channel = data.channels.find((c) => c.id === channelId)
  const everyone = () => new Set(channel?.memberIds ?? [])
  const here = (id: string) => row.hereIds?.includes(id) ?? false
  return data.users.filter((u) => u.id !== senderId && reaches(row.mentions, u.id, everyone, channel?.isPrivate ?? false, here)).map((u) => u.id)
}

/**
 * Messages, replies and task comments by someone else that mention `userId` (by name, or @all where they are a
 * channel member or one of the project's people), newest first. A comment counts once, not again as its chat card.
 * `keep` filters them before the newest `limit` are taken, so what's left out never uses up the window.
 */
export function mentionsFor(data: DbData, userId: string, keep: (item: Omit<MentionItem, 'read'>) => boolean = () => true, limit = MAX_ITEMS): Omit<MentionItem, 'read'>[] {
  const members = (channelId: string) => () => new Set(data.channels.find((c) => c.id === channelId)?.memberIds ?? [])
  const closed = (channelId: string) => data.channels.find((c) => c.id === channelId)?.isPrivate ?? false
  const items: Omit<MentionItem, 'read'>[] = []
  const nameOf = (id: string) => data.users.find((u) => u.id === id)?.name ?? 'Someone'
  const wsOfChannel = (channelId: string) => data.channels.find((c) => c.id === channelId)?.workspaceId ?? ''
  // My keywords (spec 6.11) count like a mention in channels I'm in and haven't muted, from when each was added; a
  // row that names me is a mention already.
  const keywords = prefsOf(data, userId).keywords
  const since = keywordsSinceOf(data, userId)
  const keywordIn = (row: ChatMessage | ThreadReply) => {
    if (!keywords.length || !data.channels.find((c) => c.id === row.channelId)?.memberIds.includes(userId) || stateOf(data, userId, row.channelId).muted) return null
    return matchedKeyword(bodyText(row.body), keywords.filter((k) => row.createdAt >= (since[k.toLowerCase()] ?? '')))
  }
  /** A row by someone else that names me (the mention) or, failing that, has one of my keywords; null otherwise. */
  const hit = (row: ChatMessage | ThreadReply, keywordable: boolean): { keyword: string | null } | null => {
    if (row.deletedAt || row.senderId === userId) return null
    if (reaches(row.mentions, userId, members(row.channelId), closed(row.channelId), (id) => row.hereIds?.includes(id) ?? false)) return { keyword: null }
    const keyword = keywordable ? keywordIn(row) : null
    return keyword ? { keyword } : null
  }
  for (const m of data.messages) {
    if (m.commentId) continue
    const found = hit(m, keywordable(m))
    if (!found) continue
    items.push({ id: m.id, source: 'message', workspaceId: wsOfChannel(m.channelId), authorId: m.senderId, authorName: nameOf(m.senderId), excerpt: excerptOf(m.content), createdAt: m.createdAt, channelId: m.channelId, messageId: m.id, taskKey: null, projectId: null, keyword: found.keyword })
  }
  for (const r of data.replies) {
    const found = hit(r, true)
    if (!found) continue
    items.push({ id: r.id, source: 'reply', workspaceId: wsOfChannel(r.channelId), authorId: r.senderId, authorName: nameOf(r.senderId), excerpt: excerptOf(r.content), createdAt: r.createdAt, channelId: r.channelId, messageId: r.messageId, taskKey: null, projectId: null, keyword: found.keyword })
  }
  for (const c of data.comments) {
    if (c.authorId === userId || c.deletedAt) continue
    // Comments keep their text; their mentions are read from it, like a message's.
    const card = data.messages.find((m) => m.commentId === c.id)
    const mentions = card?.mentions ?? []
    if (!reaches(mentions, userId, () => projectPeople(data, c.projectId))) continue
    const taskKey = data.tickets.find((t) => t.id === c.taskId)?.key ?? null
    items.push({ id: c.id, source: 'comment', workspaceId: data.projects.find((p) => p.id === c.projectId)?.workspaceId ?? '', authorId: c.authorId, authorName: nameOf(c.authorId), excerpt: excerptOf(c.body), createdAt: c.createdAt, channelId: null, messageId: null, taskKey, projectId: c.projectId, keyword: null })
  }
  // A channel's page (chat spec 6.14): each save stored whom it newly named; it shows while they can read the channel.
  for (const pm of data.pageMentions) {
    if (pm.userId !== userId || !canRead(data, pm.channelId, userId)) continue
    items.push({ id: pm.id, source: 'page', workspaceId: pm.workspaceId, authorId: pm.authorId, authorName: nameOf(pm.authorId), excerpt: pm.excerpt, createdAt: pm.createdAt, channelId: pm.channelId, messageId: null, taskKey: null, projectId: null, keyword: null })
  }
  return items.filter(keep).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit)
}

/**
 * Task news for `userId` (UX Phase 2, 2.3), worked out on read: someone else assigned them a task (the history line
 * that set them, so it stays theirs after the task moves on), moved a task assigned to them now, or commented on one
 * (a comment that mentions them is that mention alone). Only on projects they are on now, and only tasks that aren't
 * archived. Moves and comments count from when the task last became theirs: older ones aren't news to a new assignee.
 */
export function taskEventsFor(data: DbData, userId: string): Omit<MentionItem, 'read'>[] {
  const nameOf = (id: string) => data.users.find((u) => u.id === id)?.name ?? 'Someone'
  const byKey = new Map(data.tickets.map((t) => [t.key, t]))
  const workspaceOf = (projectId: string) => data.projects.find((p) => p.id === projectId)?.workspaceId ?? ''
  const people = new Map<string, Set<string>>()
  const onProject = (projectId: string) => {
    if (!people.has(projectId)) people.set(projectId, projectPeople(data, projectId))
    return people.get(projectId)!.has(userId)
  }
  const assignsMe = (e: DbData['activity'][number]) => (e.kind === 'task.created' || e.kind === 'task.changed') && e.changes.some((c) => c.field === 'assigneeId' && c.to === userId)
  // When each task last became mine: the history line's place (the history is kept in order) and its time. A task with
  // no such line (from before the history kept it) counts all its news.
  const mine = new Map<string, { index: number; at: string }>()
  data.activity.forEach((e, index) => {
    if (e.taskKey && assignsMe(e)) mine.set(e.taskKey, { index, at: e.at })
  })
  const items: Omit<MentionItem, 'read'>[] = []
  data.activity.forEach((e, index) => {
    if (e.actorId === userId || !e.taskKey || !onProject(e.projectId)) return
    const task = byKey.get(e.taskKey)
    if (!task || task.archivedAt) return
    const base = { id: `task-${e.id}`, workspaceId: workspaceOf(e.projectId), authorId: e.actorId, authorName: nameOf(e.actorId), excerpt: task.title, createdAt: e.at, channelId: null, messageId: null, taskKey: e.taskKey, projectId: e.projectId, keyword: null }
    if (assignsMe(e)) items.push({ ...base, source: 'assigned', statusLabel: null })
    else if (e.kind === 'task.moved' && task.assigneeId === userId && index > (mine.get(task.key)?.index ?? -1)) items.push({ ...base, source: 'status', statusLabel: e.changes[0]?.toLabel ?? null })
  })
  for (const c of data.comments) {
    if (c.authorId === userId || c.deletedAt || !onProject(c.projectId)) continue
    const task = data.tickets.find((t) => t.id === c.taskId)
    if (!task || task.archivedAt || task.assigneeId !== userId) continue
    const since = mine.get(task.key)?.at
    if (since && c.createdAt <= since) continue
    const card = data.messages.find((m) => m.commentId === c.id)
    if (reaches(card?.mentions ?? [], userId, () => projectPeople(data, c.projectId))) continue
    items.push({ id: `tcomment-${c.id}`, source: 'taskComment', workspaceId: workspaceOf(c.projectId), authorId: c.authorId, authorName: nameOf(c.authorId), excerpt: excerptOf(c.body), createdAt: c.createdAt, channelId: null, messageId: null, taskKey: task.key, projectId: c.projectId, keyword: null, statusLabel: null })
  }
  return items
}

const newestFirst = <T extends { createdAt: string }>(a: T, b: T) => (a.createdAt < b.createdAt ? 1 : -1)

/**
 * The newest `limit` mentions and the newest `limit` task news, together newest first: each kind keeps its own room, so
 * a busy day of task news never pushes mentions of me out of My work (UX Phase 6).
 */
export function capEach<T extends { createdAt: string }>(mentions: T[], news: T[], limit: number): T[] {
  return [...[...mentions].sort(newestFirst).slice(0, limit), ...[...news].sort(newestFirst).slice(0, limit)].sort(newestFirst)
}

/** Mentions of me and task news for me, newest first: the bell's list (UX Phase 2, 2.3). */
export function inboxFor(data: DbData, userId: string, keep: (item: Omit<MentionItem, 'read'>) => boolean = () => true, limit = MAX_ITEMS): Omit<MentionItem, 'read'>[] {
  return capEach(mentionsFor(data, userId, keep, Infinity), taskEventsFor(data, userId).filter(keep), limit)
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
      return clone(inboxFor(data, me.id, (item) => !quiet(item.channelId)).map((item) => ({ ...item, read: read.has(item.id) })))
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
