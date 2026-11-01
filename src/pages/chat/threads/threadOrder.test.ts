import { describe, expect, it } from 'vitest'
import type { ThreadCard } from '@/api/types'
import { orderThreads } from './threadOrder'

const card = (id: string, lastReplyAt: string, unreadCount = 0) => ({ root: { id }, lastReplyAt, unreadCount }) as unknown as ThreadCard
const ids = (cards: ThreadCard[]) => cards.map((c) => c.root.id)

describe('orderThreads (spec 6.12: unread first, newest reply first; nothing jumps while I read)', () => {
  it('puts unread threads first, each group newest reply first', () => {
    expect(ids(orderThreads([card('a', '01'), card('b', '03', 2), card('c', '04'), card('d', '02', 1)], new Set()))).toEqual(['b', 'd', 'c', 'a'])
  })
  it('a thread unread when I came keeps its place after I read it', () => {
    expect(ids(orderThreads([card('a', '04'), card('b', '02')], new Set(['b'])))).toEqual(['b', 'a'])
  })
  it('a new reply moves its thread up', () => {
    expect(ids(orderThreads([card('a', '05', 1), card('b', '04', 1)], new Set(['a', 'b'])))).toEqual(['a', 'b'])
  })
})
