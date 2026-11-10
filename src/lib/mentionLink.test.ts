import { describe, expect, it } from 'vitest'
import type { MentionItem } from '@/api/types'
import { mentionLink, notificationLine } from './mentionLink'

const item = (over: Partial<MentionItem>): MentionItem => ({ id: 'x', source: 'message', authorId: 'u', excerpt: '', createdAt: '', read: false, workspaceId: 'ws-eng', authorName: 'A', channelId: null, messageId: null, taskKey: null, projectId: null, keyword: null, ...over })
const workspaces = [{ id: 'ws-eng', slug: 'engineering' }, { id: 'ws-design', slug: 'design' }]

describe('mentionLink', () => {
  it('a message mention opens its thread', () => {
    expect(mentionLink(item({ channelId: 'c-general', messageId: 'm1' }), workspaces, 'engineering')).toBe('/w/engineering/c/c-general?thread=m1')
  })
  it('a reply opens its thread; a comment its task on the project Tasks tab', () => {
    expect(mentionLink(item({ source: 'reply', channelId: 'c-general', messageId: 'm1' }), workspaces, 'engineering')).toBe('/w/engineering/c/c-general?thread=m1')
    expect(mentionLink(item({ source: 'comment', taskKey: 'NEX-105', projectId: 'p-nex', keyword: null }), workspaces, 'engineering')).toBe('/w/engineering/p/NEX/tasks?ticket=NEX-105')
  })
  it('a mention from another workspace links into that workspace', () => {
    expect(mentionLink(item({ workspaceId: 'ws-design', channelId: 'c-design', messageId: 'm2' }), workspaces, 'engineering')).toBe('/w/design/c/c-design?thread=m2')
  })
  it('an unknown workspace, or a mention with nothing to open, falls back to Home here', () => {
    expect(mentionLink(item({ workspaceId: 'ws-gone', channelId: 'c-x', messageId: 'm' }), workspaces, 'engineering')).toBe('/w/engineering')
    expect(mentionLink(item({ source: 'comment' }), workspaces, 'engineering')).toBe('/w/engineering')
  })
})

describe('task news (UX Phase 2, 2.3)', () => {
  it('opens the task on its project’s Tasks tab, in its own workspace', () => {
    for (const source of ['assigned', 'status', 'taskComment'] as const) {
      expect(mentionLink(item({ source, taskKey: 'NEX-106', projectId: 'p-nex', workspaceId: 'ws-design' }), workspaces, 'engineering')).toBe('/w/design/p/NEX/tasks?ticket=NEX-106')
    }
  })

  it('says what happened in one line', () => {
    const who = { authorName: 'Nour El-Sayed', taskKey: 'NEX-106' }
    expect(notificationLine(item({ ...who, source: 'message' }))).toBe('Nour El-Sayed mentioned you')
    expect(notificationLine(item({ ...who, source: 'assigned' }))).toBe('Nour El-Sayed assigned you NEX-106')
    expect(notificationLine(item({ ...who, source: 'status', statusLabel: 'In review' }))).toBe('Nour El-Sayed moved NEX-106 to In review')
    expect(notificationLine(item({ ...who, source: 'status', statusLabel: null }))).toBe('Nour El-Sayed moved NEX-106')
    expect(notificationLine(item({ ...who, source: 'taskComment' }))).toBe('Nour El-Sayed commented on NEX-106')
  })
})

describe('a mention on a channel’s page (chat spec 6.14)', () => {
  it('opens the page, and the bell says so', () => {
    expect(mentionLink(item({ source: 'page', channelId: 'c-general' }), workspaces, 'engineering')).toBe('/w/engineering/c/c-general?tab=page')
    expect(notificationLine({ source: 'page', authorName: 'Nour El-Sayed', taskKey: null, statusLabel: null })).toBe('Nour El-Sayed mentioned you on the page')
  })
})
