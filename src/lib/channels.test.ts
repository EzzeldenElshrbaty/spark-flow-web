import { describe, expect, it } from 'vitest'
import type { Channel, MentionItem } from '@/api/types'
import { FLOWBOT_ID } from '@/lib/flowbot'
import { channelLabel, chatCount, countNoun, onlyAdminsLine, cantWriteLine, inWorkspace, mutedLast, mustJoin, readOnlyFor, sidebarChannels, sidebarRowState, sortChannels, unreadMentions, unreadTaskMentions } from '@/lib/channels'
import { seed } from '@/mocks/seed'

const data = seed(new Date('2026-10-26T09:00:00Z')).data
const users = data.users
const me = users.find((u) => u.id === 'u-1')!
const other = users.find((u) => u.id === 'u-2')!

const dm = (memberIds: string[]): Channel => ({
  id: 'c-x', workspaceId: 'ws-eng', kind: 'dm', name: null, topic: '', memberIds, isPrivate: true, lastMessageAt: null, description: '', whoCanPost: 'everyone', isDefault: false, unreadCount: 0,
  lastSeq: 0, lastReadSeq: 0, starred: false, muted: false, notifyLevel: 'all',
})
const channel = (name: string, lastMessageAt: string | null = null): Channel => ({ ...dm([]), id: `c-${name}`, kind: 'channel', name, isPrivate: false, lastMessageAt, notifyLevel: 'mentions' })

describe('channelLabel', () => {
  it('names a channel after its name', () => {
    expect(channelLabel(channel('general'), users, me.id)).toBe('general')
  })

  it('names a DM after the other member', () => {
    expect(channelLabel(dm([me.id, other.id]), users, me.id)).toBe(other.name)
  })

  it('names Flowbot’s DM after Flowbot, who is not a person', () => {
    expect(channelLabel(dm([me.id, FLOWBOT_ID]), users, me.id)).toBe('Flowbot')
  })

  it('joins the other members of a group DM', () => {
    expect(channelLabel(dm([me.id, other.id, 'u-3']), users, me.id)).toBe(`${other.name}, ${users.find((u) => u.id === 'u-3')!.name}`)
  })

  it('names a DM with yourself "<name> (you)"', () => {
    expect(channelLabel(dm([me.id]), users, me.id)).toBe(`${me.name} (you)`)
  })

  it('names an unknown member "Unknown person"', () => {
    expect(channelLabel(dm([me.id, 'u-99']), users, me.id)).toBe('Unknown person')
  })
})

describe('sortChannels', () => {
  it('sorts channels A–Z and DMs by latest message', () => {
    const list = [
      channel('release'),
      { ...dm(['u-1', 'u-2']), id: 'c-old', lastMessageAt: '2026-10-24T10:00:00Z' },
      channel('backend'),
      { ...dm(['u-1', 'u-3']), id: 'c-new', lastMessageAt: '2026-10-26T08:00:00Z' },
      { ...dm(['u-1', 'u-4']), id: 'c-none', lastMessageAt: null },
    ]
    const { channels, dms } = sortChannels(list)
    expect(channels.map((c) => c.name)).toEqual(['backend', 'release'])
    expect(dms.map((c) => c.id)).toEqual(['c-new', 'c-old', 'c-none'])
  })

  it('lists Flowbot’s DM under Apps, not with the people (spec 5.1)', () => {
    const bot = { ...dm(['u-1', FLOWBOT_ID]), id: 'c-bot', lastMessageAt: '2026-10-27T08:00:00Z' }
    const { dms, apps } = sortChannels([bot, { ...dm(['u-1', 'u-2']), id: 'c-nour' }])
    expect(dms.map((c) => c.id)).toEqual(['c-nour'])
    expect(apps.map((c) => c.id)).toEqual(['c-bot'])
  })

  it('a muted channel or DM goes last in its group, in the same order among them (spec 6.11)', () => {
    const list = [
      { ...channel('api'), muted: true },
      channel('release'),
      { ...channel('ops'), muted: true },
      channel('backend'),
      { ...dm(['u-1', 'u-2']), id: 'c-quiet', lastMessageAt: '2026-10-26T09:00:00Z', muted: true },
      { ...dm(['u-1', 'u-3']), id: 'c-old', lastMessageAt: '2026-10-24T10:00:00Z' },
    ]
    const { channels, dms } = sortChannels(list)
    expect(channels.map((c) => c.name)).toEqual(['backend', 'release', 'api', 'ops'])
    expect(dms.map((c) => c.id)).toEqual(['c-old', 'c-quiet'])
  })

  it('mutedLast keeps a list in order with the muted ones at the end (the Starred group)', () => {
    const starred = [{ ...channel('api'), muted: true }, channel('backend'), { ...dm(['u-1', 'u-2']), id: 'c-dm' }]
    expect(mutedLast(starred, (c) => c.muted).map((c) => c.id)).toEqual(['c-backend', 'c-dm', 'c-api'])
  })
})

describe('inWorkspace', () => {
  it('accepts a channel of the workspace on screen', () => {
    expect(inWorkspace(channel('general'), 'ws-eng')).toBe(true)
  })

  it('rejects a channel of another workspace, or when the workspace is unknown', () => {
    expect(inWorkspace(channel('general'), 'ws-design')).toBe(false)
    expect(inWorkspace(channel('general'), undefined)).toBe(false)
  })
})

describe('onlyAdminsLine (spec §9)', () => {
  it('says who may post instead of the composer, the way the server refuses', () => {
    expect(onlyAdminsLine({ name: 'backend' })).toBe('Only admins can post in #backend.')
  })
})

describe('readOnlyFor', () => {
  it('says who can write, for a project channel or a private one', () => {
    expect(readOnlyFor(true)).toBe('You can read this channel. Only its project’s people can write here.')
    expect(readOnlyFor(false)).toBe('You can read this channel. Only its members can write here.')
  })
})

describe('sidebarChannels', () => {
  const ch = (id: string, memberIds: string[], archivedAt: string | null = null) => ({ id, kind: 'channel', name: id, memberIds, archivedAt }) as unknown as Channel
  it("keeps my channels and my projects' channels, not other public or archived ones", () => {
    const list = [ch('mine', ['u1']), ch('other', ['u2']), ch('proj', ['u2']), ch('old', ['u1'], '2026-10-01T00:00:00.000Z')]
    expect(sidebarChannels(list, 'u1', new Set(['proj'])).map((c) => c.id)).toEqual(['mine', 'proj'])
  })
})


describe('unreadMentions', () => {
  const item = (over: Partial<MentionItem>): MentionItem => ({
    id: 'm', source: 'message', authorId: 'u-2', authorName: 'Hala', excerpt: '', createdAt: '2026-10-26T09:00:00Z',
    read: false, workspaceId: 'ws-eng', channelId: 'c-general', messageId: 'x', taskKey: null, projectId: null, ...over,
  })

  it('counts my unread mentions per channel of the workspace on screen', () => {
    const counts = unreadMentions(
      [
        item({ id: '1' }),
        item({ id: '2', source: 'reply' }),
        item({ id: '3', read: true }),
        item({ id: '4', channelId: 'c-backend' }),
        item({ id: '5', workspaceId: 'ws-design', channelId: 'c-design' }),
        item({ id: '6', source: 'comment', channelId: null, taskKey: 'NEX-1' }),
      ],
      'ws-eng',
    )
    expect(counts.byChannel.get('c-general')).toBe(2)
    expect(counts.byChannel.get('c-backend')).toBe(1)
    expect(counts.byChannel.has('c-design')).toBe(false)
    // Activity has its own count (its unread items, spec 6.12): only the channel badges are worked out here.
    expect(Object.keys(counts)).toEqual(['byChannel'])
  })

  it('is empty before the mentions load', () => {
    expect(unreadMentions(undefined, 'ws-eng')).toEqual({ byChannel: new Map() })
  })
})

describe('sidebarRowState (spec §5.1 row rules, 6.11 levels)', () => {
  const state = { lastSeq: 5, lastReadSeq: 2, starred: false, muted: false }
  it('a channel at Mentions (its default) is bold with unread and counts only my mentions', () => {
    expect(sidebarRowState({ ...channel('a'), ...state, unreadCount: 3 }, 1)).toEqual({ bold: true, count: 1, muted: false })
    expect(sidebarRowState({ ...channel('a'), ...state, unreadCount: 3 }, 0)).toEqual({ bold: true, count: 0, muted: false })
  })
  it('a DM at All (its default) counts every unread message, and so does a channel at All', () => {
    expect(sidebarRowState({ ...dm([me.id, other.id]), ...state, unreadCount: 3 }, 0)).toEqual({ bold: true, count: 3, muted: false })
    expect(sidebarRowState({ ...channel('a'), ...state, notifyLevel: 'all', unreadCount: 3 }, 1)).toEqual({ bold: true, count: 3, muted: false })
  })
  it('a DM at Mentions counts only my mentions', () => {
    expect(sidebarRowState({ ...dm([me.id, other.id]), ...state, notifyLevel: 'mentions', unreadCount: 3 }, 0)).toEqual({ bold: true, count: 0, muted: false })
  })
  it('at Nothing the row is still bold with unread, with no count', () => {
    expect(sidebarRowState({ ...channel('a'), ...state, notifyLevel: 'none', unreadCount: 3 }, 2)).toEqual({ bold: true, count: 0, muted: false })
    expect(sidebarRowState({ ...dm([me.id, other.id]), ...state, notifyLevel: 'none', unreadCount: 3 }, 0)).toEqual({ bold: true, count: 0, muted: false })
  })
  it('a read row is plain', () => {
    expect(sidebarRowState({ ...channel('a'), ...state, unreadCount: 0 }, 0)).toEqual({ bold: false, count: 0, muted: false })
  })
  it('a muted row is never bold and never has a count', () => {
    expect(sidebarRowState({ ...channel('a'), ...state, muted: true, unreadCount: 3 }, 2)).toEqual({ bold: false, count: 0, muted: true })
    expect(sidebarRowState({ ...dm([me.id, other.id]), ...state, muted: true, unreadCount: 3 }, 0)).toEqual({ bold: false, count: 0, muted: true })
  })
})

describe('countNoun: what a row’s count is read out as', () => {
  it('at All it counts new messages (a DM’s default), else my mentions', () => {
    expect(countNoun({ ...channel('a'), notifyLevel: 'all' })).toEqual(['new message', 'new messages'])
    expect(countNoun(dm([me.id, other.id]))).toEqual(['new message', 'new messages'])
    expect(countNoun(channel('a'))).toEqual(['mention', 'mentions'])
    expect(countNoun({ ...dm([me.id, other.id]), notifyLevel: 'mentions' })).toEqual(['mention', 'mentions'])
  })
})

describe('mustJoin (post in a public channel: join it first)', () => {
  const projects = [{ channelId: 'c-p-nex' }]
  it('a public channel I’m not in, that no project owns', () => {
    expect(mustJoin({ ...channel('random'), memberIds: ['u-2'] }, 'u-1', projects)).toBe(true)
  })
  it('not when I’m in it, it’s private, a DM, or a project’s channel (its people follow the project)', () => {
    expect(mustJoin({ ...channel('random'), memberIds: ['u-1'] }, 'u-1', projects)).toBe(false)
    expect(mustJoin({ ...channel('random'), isPrivate: true }, 'u-1', projects)).toBe(false)
    expect(mustJoin(dm(['u-2']), 'u-1', projects)).toBe(false)
    expect(mustJoin({ ...channel('nex'), id: 'c-p-nex' }, 'u-1', projects)).toBe(false)
  })
  it('not before the projects are known (no flash of Join channel)', () => {
    expect(mustJoin({ ...channel('random'), memberIds: ['u-2'] }, 'u-1', undefined)).toBe(false)
  })
})

describe('cantWriteLine: what shows instead of the composer when I may post but not write', () => {
  it('Only admins in a restricted channel; Flowbot’s own line in its DM', () => {
    expect(cantWriteLine(channel('general'))).toBe('Only admins can post in #general.')
    expect(cantWriteLine(dm(['u-1', FLOWBOT_ID]))).toBe('Flowbot sends reminders here. It can’t read replies.')
  })
})

describe('the workspace switch badges (spec 5.5)', () => {
  const item = (over: Partial<MentionItem>): MentionItem => ({
    id: 'm', source: 'comment', authorId: 'u-2', authorName: 'Hala', excerpt: '', createdAt: '2026-10-26T09:00:00Z',
    read: false, workspaceId: 'ws-eng', channelId: null, messageId: null, taskKey: 'NEX-1', projectId: 'p-nex', ...over,
  })

  it('chatCount adds up the red count of every chat row, by the row rules', () => {
    const atMentions = { ...channel('backend'), unreadCount: 4 }
    const atAll = { ...dm(['u-1', 'u-2']), unreadCount: 2 }
    const quiet = { ...channel('general'), unreadCount: 6, notifyLevel: 'none' as const }
    const muted = { ...dm(['u-1', 'u-3']), unreadCount: 9, muted: true }
    expect(chatCount([{ channel: atMentions, mentions: 1 }, { channel: atAll, mentions: 0 }, { channel: quiet, mentions: 3 }, { channel: muted, mentions: 0 }])).toBe(3)
    expect(chatCount([])).toBe(0)
  })

  it('unreadTaskMentions counts my unread mentions in task comments of this workspace (the Projects dot)', () => {
    const items = [
      item({ id: '1' }),
      item({ id: '2', read: true }),
      item({ id: '3', workspaceId: 'ws-design' }),
      item({ id: '4', source: 'message', channelId: 'c-general', taskKey: null, projectId: null }),
    ]
    expect(unreadTaskMentions(items, 'ws-eng')).toBe(1)
    expect(unreadTaskMentions(undefined, 'ws-eng')).toBe(0)
  })
})
