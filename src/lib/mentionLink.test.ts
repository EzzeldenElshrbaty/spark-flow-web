import { describe, expect, it } from 'vitest'
import type { MentionItem } from '@/api/types'
import { mentionLink } from './mentionLink'

const item = (over: Partial<MentionItem>): MentionItem => ({ id: 'x', source: 'message', authorId: 'u', excerpt: '', createdAt: '', read: false, workspaceId: 'ws-eng', authorName: 'A', channelId: null, messageId: null, taskKey: null, projectId: null, ...over })
const workspaces = [{ id: 'ws-eng', slug: 'engineering' }, { id: 'ws-design', slug: 'design' }]

describe('mentionLink', () => {
  it('a message mention opens its thread', () => {
    expect(mentionLink(item({ channelId: 'c-general', messageId: 'm1' }), workspaces, 'engineering')).toBe('/w/engineering/c/c-general?thread=m1')
  })
  it('a reply opens its thread; a comment its task on the project Tasks tab', () => {
    expect(mentionLink(item({ source: 'reply', channelId: 'c-general', messageId: 'm1' }), workspaces, 'engineering')).toBe('/w/engineering/c/c-general?thread=m1')
    expect(mentionLink(item({ source: 'comment', taskKey: 'NEX-105', projectId: 'p-nex' }), workspaces, 'engineering')).toBe('/w/engineering/p/NEX/tasks?ticket=NEX-105')
  })
  it('a mention from another workspace links into that workspace', () => {
    expect(mentionLink(item({ workspaceId: 'ws-design', channelId: 'c-design', messageId: 'm2' }), workspaces, 'engineering')).toBe('/w/design/c/c-design?thread=m2')
  })
  it('an unknown workspace, or a mention with nothing to open, falls back to Home here', () => {
    expect(mentionLink(item({ workspaceId: 'ws-gone', channelId: 'c-x', messageId: 'm' }), workspaces, 'engineering')).toBe('/w/engineering')
    expect(mentionLink(item({ source: 'comment' }), workspaces, 'engineering')).toBe('/w/engineering')
  })
})
