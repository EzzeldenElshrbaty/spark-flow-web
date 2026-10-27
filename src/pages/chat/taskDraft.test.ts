import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/api/types'
import { taskDraft } from './taskDraft'

const m = (content: string): ChatMessage => ({ id: 'm1', channelId: 'c-p-nex', content }) as ChatMessage

describe('taskDraft', () => {
  it('title is the first line, trimmed to 120', () => {
    expect(taskDraft(m('  Fix the login page  \nIt fails on Safari.'), 'p-nex').title).toBe('Fix the login page')
    expect(taskDraft(m('x'.repeat(200)), 'p-nex').title).toHaveLength(120)
  })
  it('description is the whole text, and the draft links back to the message', () => {
    expect(taskDraft(m('Fix it\nOn Safari.'), 'p-nex')).toEqual({
      projectId: 'p-nex', title: 'Fix it', description: 'Fix it\nOn Safari.', linkedChannelId: 'c-p-nex', linkedMessageId: 'm1',
    })
  })
  it('mention markup in the title reads as names', () => {
    expect(taskDraft(m('Ask @[Salma Ibrahim](u-6) about NEX-101'), 'p-nex').title).toBe('Ask @Salma Ibrahim about NEX-101')
  })
})
