import { describe, expect, it } from 'vitest'
import type { MentionItem } from '@/api/types'
import { mentionLink } from './mentionLink'

const item = (over: Partial<MentionItem>): MentionItem => ({ id: 'x', source: 'message', authorId: 'u', excerpt: '', createdAt: '', read: false, channelId: null, messageId: null, taskKey: null, projectId: null, ...over })
const projects = [{ id: 'p-nex', key: 'NEX' }]

describe('mentionLink', () => {
  it('opens the channel, the thread, or the task in its project', () => {
    expect(mentionLink(item({ channelId: 'c-general', messageId: 'm1' }), 'engineering', projects)).toBe('/w/engineering/c/c-general')
    expect(mentionLink(item({ source: 'reply', channelId: 'c-general', messageId: 'm1' }), 'engineering', projects)).toBe('/w/engineering/c/c-general?thread=m1')
    expect(mentionLink(item({ source: 'comment', taskKey: 'NEX-105', projectId: 'p-nex' }), 'engineering', projects)).toBe('/w/engineering/p/NEX/tasks?ticket=NEX-105')
  })
  it('a comment whose project is gone falls back to Home', () => {
    expect(mentionLink(item({ source: 'comment', taskKey: 'X-1', projectId: 'p-gone' }), 'engineering', projects)).toBe('/w/engineering')
  })
})
