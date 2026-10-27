import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/api/types'
import { actionsFor } from './messageRights'

const m = (over: Partial<ChatMessage>): ChatMessage => ({ id: 'm1', senderId: 'me', content: 'hi', ...over }) as ChatMessage

describe('actionsFor', () => {
  it('my plain message: react, edit and delete', () => {
    expect(actionsFor(m({}), 'me', true)).toEqual({ react: true, edit: true, remove: true })
  })
  it("someone else's: react only", () => {
    expect(actionsFor(m({ senderId: 'other' }), 'me', true)).toEqual({ react: true, edit: false, remove: false })
  })
  it('a card: react only', () => {
    expect(actionsFor(m({ commentId: 'cm1' }), 'me', true)).toEqual({ react: true, edit: false, remove: false })
    expect(actionsFor(m({ taskEvent: { key: 'P-1', kind: 'created' } }), 'me', true)).toEqual({ react: true, edit: false, remove: false })
  })
  it('a deleted row: none', () => {
    expect(actionsFor(m({ deletedAt: '2026-10-28T10:00:00Z' }), 'me', true)).toEqual({ react: false, edit: false, remove: false })
  })
  it('where I can’t post: none', () => {
    expect(actionsFor(m({}), 'me', false)).toEqual({ react: false, edit: false, remove: false })
  })
})
