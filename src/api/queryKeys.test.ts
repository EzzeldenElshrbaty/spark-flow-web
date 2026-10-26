import { describe, expect, it } from 'vitest'
import { keysForEvent, qk } from '@/api/queryKeys'
import type { ChatMessage, ThreadReply, Ticket } from '@/api/types'

const m = { id: 'm1' } as ChatMessage
const r = { id: 'r1' } as ThreadReply
const t = { id: 't1' } as Ticket

describe('qk', () => {
  it('builds stable keys, with the parent key as a prefix of its children', () => {
    expect(qk.workspaces()).toEqual(['workspaces'])
    expect(qk.me()).toEqual(['users', 'me'])
    expect(qk.users('w1')).toEqual(['users', 'w1'])
    expect(qk.channels('w1')).toEqual([...qk.channelsAll(), 'w1'])
    expect(qk.messages('c1')).toEqual(['chat', 'messages', 'c1'])
    expect(qk.ticket('NEX-1')).toEqual(['tickets', 'one', 'NEX-1'])
  })
})

describe('keysForEvent', () => {
  it('maps events to the keys to invalidate', () => {
    expect(keysForEvent({ type: 'messageReceived', message: { ...m, channelId: 'c1' } })).toEqual([
      qk.messages('c1'), qk.channelsAll(), qk.channel('c1'), qk.mentions(),
    ])
    expect(keysForEvent({ type: 'replyReceived', reply: { ...r, channelId: 'c1', messageId: 'm1' } })).toEqual([
      qk.replies('m1'), qk.message('m1'), qk.messages('c1'), qk.channelsAll(), qk.channel('c1'), qk.mentions(),
    ])
    expect(keysForEvent({ type: 'commentAdded', taskKey: 'NEX-1', projectId: 'p1' })).toEqual([qk.comments('NEX-1'), qk.mentions()])
    expect(keysForEvent({ type: 'ticketUpdated', ticket: { ...t, projectId: 'p1', key: 'NEX-1' } })).toEqual([
      qk.tickets('p1'), qk.ticket('NEX-1'),
    ])
    expect(keysForEvent({ type: 'timeLogged', userId: 'u1', projectId: 'p1' })).toEqual([qk.myDay(), ['tickets'], ['projects', 'time']])
    expect(keysForEvent({ type: 'userTyping', channelId: 'c1', userId: 'u2' })).toEqual([])
  })
})
