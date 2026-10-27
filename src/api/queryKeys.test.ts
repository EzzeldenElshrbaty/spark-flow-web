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
    expect(keysForEvent({ type: 'commentAdded', taskKey: 'NEX-1', projectId: 'p1' })).toEqual([qk.comments('NEX-1'), qk.mentions(), qk.taskHistory('NEX-1'), qk.projectHistory('p1')])
    expect(keysForEvent({ type: 'ticketUpdated', ticket: { ...t, projectId: 'p1', key: 'NEX-1' } })).toEqual([
      qk.tickets('p1'), qk.archivedTickets('p1'), qk.ticket('NEX-1'), qk.taskHistory('NEX-1'), qk.projectHistory('p1'),
      ['tickets', 'projects'], ['tickets', 'project'], ['dashboard'],
    ])
    expect(keysForEvent({ type: 'timeLogged', userId: 'u1', projectId: 'p1' })).toEqual([qk.myDay(), ['tickets'], ['projects', 'time'], ['dashboard'], ['time', 'report']])
    expect(keysForEvent({ type: 'userTyping', channelId: 'c1', userId: 'u2' })).toEqual([])
    expect(keysForEvent({ type: 'messageChanged', channelId: 'c1', messageId: 'm1' })).toEqual([qk.messages('c1'), qk.message('m1'), qk.replies('m1'), qk.mentions()])
    expect(keysForEvent({ type: 'channelChanged', channelId: 'c1' })).toEqual([qk.channelsAll(), qk.channel('c1')])
    expect(keysForEvent({ type: 'projectChanged', projectId: 'p1' })).toEqual([['tickets'], ['projects'], ['dashboard'], qk.projectHistory('p1')])
  })
})

describe('keysForEvent (M10)', () => {
  it('a task change also refreshes project summaries and the dashboard', () => {
    const keys = keysForEvent({ type: 'ticketUpdated', ticket: { ...t, projectId: 'p1', key: 'NEX-1' } })
    expect(keys).toEqual(expect.arrayContaining([['tickets', 'projects'], ['tickets', 'project'], ['dashboard']]))
  })
  it('rates, files, read state and a reset name what they make stale', () => {
    // Project summaries' cost (under 'tickets') too.
    expect(keysForEvent({ type: 'ratesChanged' })).toEqual([qk.rates(), ['time', 'report'], ['dashboard'], qk.timeAll(), ['tickets']])
    expect(keysForEvent({ type: 'filesChanged', projectId: 'p1' })).toEqual([qk.files('p1')])
    expect(keysForEvent({ type: 'readChanged', userId: 'u1' })).toEqual([qk.channelsAll(), qk.mentions()])
    // The empty key matches every query.
    expect(keysForEvent({ type: 'dataReset' })).toEqual([[]])
  })
})
