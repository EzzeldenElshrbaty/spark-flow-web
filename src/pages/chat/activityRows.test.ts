import { describe, expect, it } from 'vitest'
import type { ActivityItem } from '@/api/types'
import { activityKind, activityLink, shownActivity } from '@/pages/chat/activityRows'

let n = 0
const item = (over: Partial<ActivityItem> = {}): ActivityItem => ({
  id: `a${++n}`, kind: 'mention', read: false, createdAt: '2026-10-28T09:00:00.000Z', workspaceId: 'ws-eng', actorId: 'u-2', actorName: 'Nour El-Sayed',
  channelId: 'c-backend', messageId: 'm1', replyId: null, taskKey: null, projectId: null, excerpt: 'Can you look at this?', emoji: null, ...over,
})

describe('shownActivity (spec 6.12)', () => {
  const mention = item({ id: 'mention' })
  const reaction = item({ id: 'reaction', kind: 'reaction', emoji: '👍', read: true })
  const thread = item({ id: 'thread', kind: 'thread', replyId: 'r1' })
  const all = [mention, reaction, thread]

  it('All has every kind: the unread rows, then the read ones under Earlier', () => {
    expect(shownActivity(all, 'all', false)).toEqual({ unread: [mention, thread], earlier: [reaction] })
  })

  it('each tab has its own kind', () => {
    expect(shownActivity(all, 'mention', false)).toEqual({ unread: [mention], earlier: [] })
    expect(shownActivity(all, 'reaction', false)).toEqual({ unread: [], earlier: [reaction] })
    expect(shownActivity(all, 'thread', false)).toEqual({ unread: [thread], earlier: [] })
  })

  it('Unread only leaves Earlier out', () => {
    expect(shownActivity(all, 'all', true)).toEqual({ unread: [mention, thread], earlier: [] })
  })
})

describe('activityKind: the line above the text', () => {
  it('names what happened and where', () => {
    expect(activityKind(item(), '#backend')).toBe('Mentioned you in #backend')
    // The text under a reaction is mine, so the line names who reacted.
    expect(activityKind(item({ kind: 'reaction', emoji: '👍' }), '#backend')).toBe('Nour El-Sayed reacted 👍 to your message in #backend')
    expect(activityKind(item({ kind: 'reaction', emoji: '🎉', replyId: 'r1' }), '#backend')).toBe('Nour El-Sayed reacted 🎉 to your reply in #backend')
    expect(activityKind(item({ kind: 'thread', replyId: 'r1' }), '#backend')).toBe('Replied in a thread you follow in #backend')
  })

  it('a comment on a task names the task; a place it can no longer find is left out', () => {
    expect(activityKind(item({ channelId: null, messageId: null, taskKey: 'NEX-12', projectId: 'p1' }), null)).toBe('Mentioned you on NEX-12')
    expect(activityKind(item(), null)).toBe('Mentioned you')
  })
})

describe('activityLink: where opening a row goes', () => {
  it('a message opens on it in its channel; a reply opens its thread', () => {
    expect(activityLink(item(), 'engineering')).toBe('/w/engineering/c/c-backend?message=m1')
    expect(activityLink(item({ kind: 'reaction', emoji: '👍' }), 'engineering')).toBe('/w/engineering/c/c-backend?message=m1')
    expect(activityLink(item({ replyId: 'r1' }), 'engineering')).toBe('/w/engineering/c/c-backend?thread=m1')
    expect(activityLink(item({ kind: 'thread', replyId: 'r1' }), 'engineering')).toBe('/w/engineering/c/c-backend?thread=m1')
  })

  it("a comment opens its task in the project's Tasks tab", () => {
    expect(activityLink(item({ channelId: null, messageId: null, taskKey: 'NEX-12', projectId: 'p1' }), 'engineering')).toBe('/w/engineering/p/NEX/tasks?ticket=NEX-12')
  })

  it('with nowhere to go it stays on Activity', () => {
    expect(activityLink(item({ channelId: null, messageId: null }), 'engineering')).toBe('/w/engineering/activity')
  })
})
