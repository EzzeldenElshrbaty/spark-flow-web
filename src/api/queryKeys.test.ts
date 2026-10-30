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
    expect(qk.activity('w1')).toEqual([...qk.activityAll(), 'w1'])
  })
})

describe('keysForEvent', () => {
  it('maps events to the keys to invalidate', () => {
    expect(keysForEvent({ type: 'messageReceived', message: { ...m, channelId: 'c1' } })).toEqual([
      qk.messages('c1'), qk.channelsAll(), qk.channel('c1'), qk.mentions(), qk.sentAll(), qk.channelFiles('c1'),
    ])
    expect(keysForEvent({ type: 'replyReceived', reply: { ...r, channelId: 'c1', messageId: 'm1' } })).toEqual([
      qk.replies('m1'), qk.message('m1'), qk.messages('c1'), qk.channelsAll(), qk.channel('c1'), qk.mentions(), qk.sentAll(), qk.channelFiles('c1'), qk.threadsAll(),
    ])
    // A scheduled message made, changed, sent or failed: the Scheduled tab and Sent (spec 6.12).
    expect(keysForEvent({ type: 'scheduledChanged', userId: 'u-1' })).toEqual([qk.scheduledAll(), qk.sentAll()])
    expect(keysForEvent({ type: 'commentAdded', taskKey: 'NEX-1', projectId: 'p1' })).toEqual([qk.comments('NEX-1'), qk.mentions(), qk.activityAll(), qk.taskHistory('NEX-1'), qk.projectHistory('p1')])
    expect(keysForEvent({ type: 'ticketUpdated', ticket: { ...t, projectId: 'p1', key: 'NEX-1' } })).toEqual([
      qk.tickets('p1'), qk.archivedTickets('p1'), qk.ticket('NEX-1'), qk.taskHistory('NEX-1'), qk.projectHistory('p1'),
      ['tickets', 'projects'], ['tickets', 'project'], ['dashboard'], qk.taskRefsAll(),
    ])
    expect(keysForEvent({ type: 'timeLogged', userId: 'u1', projectId: 'p1' })).toEqual([qk.myDay(), ['tickets'], ['projects', 'time'], ['dashboard'], ['time', 'report']])
    expect(keysForEvent({ type: 'userTyping', channelId: 'c1', userId: 'u2' })).toEqual([])
    expect(keysForEvent({ type: 'messageChanged', channelId: 'c1', messageId: 'm1' })).toEqual([qk.messages('c1'), qk.message('m1'), qk.replies('m1'), qk.mentions(), qk.activityAll(), qk.sentAll(), qk.pins('c1'), qk.channelFiles('c1'), qk.threadsAll()])
    // Leaving, removal, archiving and privacy decide what my mentions and Activity may show.
    // Inviting and revoking change the channel's Invited list (spec 6.10) too.
    expect(keysForEvent({ type: 'channelChanged', channelId: 'c1' })).toEqual([qk.channelsAll(), qk.channel('c1'), qk.mentions(), qk.activityAll(), qk.invitations('c1'), qk.pins('c1'), qk.bookmarks('c1'), qk.threadsAll()])
    // Activity (spec 6.12) refreshes when something is stored for me, a mention included, not on every new message.
    expect(keysForEvent({ type: 'notificationCreated', userId: 'u1' })).toEqual([qk.activityAll()])
    // A file's title, description or deletion changes its details; the messages showing it get messageChanged too.
    expect(keysForEvent({ type: 'fileChanged', fileId: 'a1' })).toEqual([qk.fileDetails('a1'), ['chat', 'files'], ['folders']])
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
    expect(keysForEvent({ type: 'readChanged', userId: 'u1' })).toEqual([qk.channelsAll(), qk.mentions(), qk.activityAll(), qk.threadsAll()])
    // The empty key matches every query.
    // My sidebar order (spec 5.1) changed, here or on another device.
    expect(keysForEvent({ type: 'sidebarChanged', userId: 'u1' })).toEqual([qk.sidebarOrderAll()])
    // Threads (spec 6.12) sit under one prefix, so one key reaches every workspace's pages.
    expect(qk.threads('ws1')).toEqual([...qk.threadsAll(), 'ws1'])
    expect(keysForEvent({ type: 'dataReset' })).toEqual([[]])
  })
})
