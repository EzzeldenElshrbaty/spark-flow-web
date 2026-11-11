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
    expect(keysForEvent({ type: 'commentAdded', taskKey: 'NEX-1', projectId: 'p1' })).toEqual([qk.comments('NEX-1'), qk.mentions(), qk.activityAll(), qk.taskHistory('NEX-1'), qk.projectHistory('p1'), qk.files('p1')])
    expect(keysForEvent({ type: 'ticketUpdated', ticket: { ...t, projectId: 'p1', key: 'NEX-1' } })).toEqual([
      qk.tickets('p1'), qk.archivedTickets('p1'), qk.ticket('NEX-1'), qk.taskHistory('NEX-1'), qk.projectHistory('p1'),
      ['tickets', 'projects'], ['tickets', 'project'], ['dashboard'], qk.taskRefsAll(), qk.taskListAll(), qk.mentions(), qk.activityAll(), qk.auditAll(), qk.archiveAll(),
    ])
    expect(keysForEvent({ type: 'timeLogged', userId: 'u1', projectId: 'p1' })).toEqual([qk.myDay(), ['tickets'], ['projects', 'time'], ['dashboard'], ['time', 'report'], ['attendance'], qk.auditAll()])
    expect(keysForEvent({ type: 'userTyping', channelId: 'c1', userId: 'u2' })).toEqual([])
    expect(keysForEvent({ type: 'messageChanged', channelId: 'c1', messageId: 'm1' })).toEqual([qk.messages('c1'), qk.message('m1'), qk.replies('m1'), qk.mentions(), qk.activityAll(), qk.sentAll(), qk.pins('c1'), qk.channelFiles('c1'), qk.threadsAll(), ['projects', 'files'], qk.auditAll()])
    // Leaving, removal, archiving and privacy decide what my mentions and Activity may show.
    // Inviting and revoking change the channel's Invited list (spec 6.10) too.
    expect(keysForEvent({ type: 'pageSaved', channelId: 'c1', version: 2, userId: 'u-1' })).toEqual([qk.page('c1'), qk.pageHistory('c1'), qk.pageVersions('c1')])
    expect(keysForEvent({ type: 'pageEditing', channelId: 'c1', userId: null, until: null })).toEqual([qk.page('c1')])
    expect(keysForEvent({ type: 'channelChanged', channelId: 'c1' })).toEqual([qk.channelsAll(), qk.channel('c1'), qk.mentions(), qk.activityAll(), qk.invitations('c1'), qk.pins('c1'), qk.bookmarks('c1'), qk.taskList('c1'), qk.threadsAll(), qk.auditAll(), qk.archiveAll()])
    // Activity (spec 6.12) refreshes when something is stored for me, a mention included, not on every new message.
    expect(keysForEvent({ type: 'notificationCreated', userId: 'u1' })).toEqual([qk.activityAll(), qk.mentions()])
    // A file's title, description or deletion changes its details; the messages showing it get messageChanged too.
    expect(keysForEvent({ type: 'fileChanged', fileId: 'a1' })).toEqual([qk.fileDetails('a1'), ['chat', 'files'], ['folders'], ['projects', 'files'], ['tickets'], qk.auditAll()])
    expect(keysForEvent({ type: 'projectChanged', projectId: 'p1' })).toEqual([['tickets'], ['projects'], ['dashboard'], qk.projectHistory('p1'), qk.auditAll(), qk.archiveAll()])
  })
})

describe('keysForEvent and a project’s Files tab', () => {
  it('a comment, a message with a file, or a file’s change refreshes the project files', () => {
    expect(qk.projectFilesAll('p1', { from: 'chat' })).toEqual(['projects', 'files', 'p1', 'all', { from: 'chat' }])
    expect(keysForEvent({ type: 'commentAdded', taskKey: 'NEX-1', projectId: 'p1' })).toContainEqual(qk.files('p1'))
    const withFile = { ...m, channelId: 'c1', attachments: [{ id: 'a1' }] } as ChatMessage
    expect(keysForEvent({ type: 'messageReceived', message: withFile })).toContainEqual(['projects', 'files'])
    expect(keysForEvent({ type: 'messageReceived', message: { ...m, channelId: 'c1', attachments: [] } })).not.toContainEqual(['projects', 'files'])
    expect(keysForEvent({ type: 'fileChanged', fileId: 'a1' })).toContainEqual(['projects', 'files'])
  })

  it('a message deleted or brought back refreshes the Files tab; a file’s change refreshes the tasks that hold it', () => {
    // messageChanged doesn't say whether the message had files, so every Files tab.
    expect(keysForEvent({ type: 'messageChanged', channelId: 'c1', messageId: 'm1' })).toContainEqual(['projects', 'files'])
    // A task's panel shows its files' titles; a deleted one leaves it. Tasks and their lists are under 'tickets'.
    const keys = keysForEvent({ type: 'fileChanged', fileId: 'a1' })
    expect(keys).toContainEqual(['tickets'])
    expect(qk.ticket('NEX-1').slice(0, 1)).toEqual(['tickets'])
    expect(qk.tickets('p1').slice(0, 1)).toEqual(['tickets'])
  })
})

describe('keysForEvent and the audit log (Admin and help, slice 2)', () => {
  it('a write the server logs refreshes the log; a message, a read or typing does not', () => {
    expect(keysForEvent({ type: 'projectChanged', projectId: 'p1' })).toContainEqual(qk.auditAll())
    expect(keysForEvent({ type: 'messageReceived', message: { ...m, channelId: 'c1' } })).not.toContainEqual(qk.auditAll())
    expect(keysForEvent({ type: 'readChanged', userId: 'u1' })).not.toContainEqual(qk.auditAll())
    expect(qk.auditList({ q: 'x' }).slice(0, 1)).toEqual(qk.auditAll())
    expect(qk.auditSummary('2026-10-31T00:00:00.000Z').slice(0, 1)).toEqual(qk.auditAll())
  })
})

describe('keysForEvent (M10)', () => {
  it('a task change also refreshes project summaries and the dashboard', () => {
    const keys = keysForEvent({ type: 'ticketUpdated', ticket: { ...t, projectId: 'p1', key: 'NEX-1' } })
    expect(keys).toEqual(expect.arrayContaining([['tickets', 'projects'], ['tickets', 'project'], ['dashboard']]))
  })
  it('rates, files, read state and a reset name what they make stale', () => {
    // Project summaries' cost (under 'tickets') too.
    expect(keysForEvent({ type: 'ratesChanged' })).toEqual([qk.rates(), ['time', 'report'], ['dashboard'], qk.timeAll(), ['tickets'], qk.auditAll()])
    expect(keysForEvent({ type: 'filesChanged', projectId: 'p1' })).toEqual([qk.files('p1'), qk.auditAll()])
    expect(keysForEvent({ type: 'readChanged', userId: 'u1' })).toEqual([qk.channelsAll(), qk.mentions(), qk.activityAll(), qk.threadsAll()])
    // The empty key matches every query.
    // My preferences changed: the default level (every channel's own level), keywords (mentions, Activity).
    expect(keysForEvent({ type: 'preferencesChanged', userId: 'u1' })).toEqual([qk.preferences(), qk.channelsAll(), qk.everyChannel(), qk.mentions(), qk.activityAll(), qk.threadsAll()])
    // One key reaches every open channel, and none of the lists.
    expect(qk.channel('c1').slice(0, 2)).toEqual(qk.everyChannel())
    expect(qk.channelsAll()).not.toEqual(qk.everyChannel())
    // My sidebar order (spec 5.1) changed, here or on another device.
    expect(keysForEvent({ type: 'sidebarChanged', userId: 'u1' })).toEqual([qk.sidebarOrderAll()])
    // Threads (spec 6.12) sit under one prefix, so one key reaches every workspace's pages.
    expect(qk.threads('ws1')).toEqual([...qk.threadsAll(), 'ws1'])
    expect(keysForEvent({ type: 'dataReset' })).toEqual([[]])
    // Roles changed: anyone's rights, so everything (slice 1).
    expect(keysForEvent({ type: 'rolesChanged' })).toEqual([[]])
    // Someone added, edited or deactivated (slice 3): names and pickers show everywhere.
    expect(keysForEvent({ type: 'peopleChanged' })).toEqual([[]])
  })
})

describe('keysForEvent and channel task lists (task list §4.3)', () => {
  it('a channel’s change refreshes its list; a change to any task refreshes every list', () => {
    expect(qk.taskList('c1')).toEqual(['chat', 'taskList', 'c1'])
    expect(qk.taskListAll()).toEqual(['chat', 'taskList'])
    expect(keysForEvent({ type: 'channelChanged', channelId: 'c1' })).toContainEqual(qk.taskList('c1'))
    expect(keysForEvent({ type: 'ticketUpdated', ticket: { ...t, projectId: 'p1', key: 'NEX-1' } })).toContainEqual(qk.taskListAll())
  })
})
