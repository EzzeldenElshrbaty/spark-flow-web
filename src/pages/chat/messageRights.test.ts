import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/api/types'
import { actionsFor, deleteNeedsConfirm, lastEditable } from './messageRights'

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

describe('actionsFor an Admin (spec §9: delete is author or admin)', () => {
  it('may delete someone else’s plain message, not edit it; never a card or a system message', () => {
    expect(actionsFor(m({ senderId: 'other' }), 'me', true, true)).toEqual({ react: true, edit: false, remove: true })
    expect(actionsFor(m({ senderId: 'other', commentId: 'k' }), 'me', true, true)).toEqual({ react: true, edit: false, remove: false })
    expect(actionsFor(m({ system: { kind: 'joined' } }), 'me', true, true)).toEqual({ react: false, edit: false, remove: false })
  })
})

describe('deleteNeedsConfirm (spec 6.3)', () => {
  it('asks first when the message has replies or files; otherwise it goes at once, with Undo', () => {
    expect(deleteNeedsConfirm(m({ threadCount: 2, attachments: [] }))).toBe(true)
    expect(deleteNeedsConfirm(m({ threadCount: 0, attachments: [{ id: 'a' }] as never }))).toBe(true)
    expect(deleteNeedsConfirm(m({ threadCount: 0, attachments: [] }))).toBe(false)
  })
})

describe('lastEditable (spec 6.3: Up in an empty composer)', () => {
  it('is my newest message I may edit: not a card, a system message or a deleted one', () => {
    const list = [
      m({ id: 'a', senderId: 'me' }),
      m({ id: 'b', senderId: 'other' }),
      m({ id: 'c', senderId: 'me', deletedAt: 'T' }),
      m({ id: 'd', senderId: 'me', taskEvent: { key: 'P-1', kind: 'created' } }),
      m({ id: 'e', senderId: 'other' }),
    ]
    expect(lastEditable(list, 'me')?.id).toBe('a')
    expect(lastEditable(list.slice(1), 'me')).toBeUndefined()
  })
})
