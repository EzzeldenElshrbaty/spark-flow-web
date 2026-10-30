import { describe, expect, it } from 'vitest'
import { migrate } from './migrations'

describe('migrations', () => {
  it('3 → 4 gives every person the default person\'s read map', () => {
    const v3 = { version: 3, currentUserId: 'u1', users: [{ id: 'u1' }, { id: 'u2' }], reads: { c1: 'T1', c2: 'T2' } }
    const next = migrate(v3, 4)!
    expect(next.reads).toEqual({ u1: { c1: 'T1', c2: 'T2' }, u2: { c1: 'T1', c2: 'T2' } })
    // Each person owns their copy: one reading on doesn't move another's marker.
    const reads = next.reads as Record<string, Record<string, string>>
    reads.u2!.c1 = 'T9'
    expect(reads.u1!.c1).toBe('T1')
  })

  it("3 → 4 with users that isn't a list still gives the default person their map", () => {
    const next = migrate({ version: 3, currentUserId: 'u1', users: {}, reads: { c1: 'T1' } }, 4)!
    expect(next.reads).toEqual({ u1: { c1: 'T1' } })
  })

  it('5 → 6 gives every rate an id and the start of time', () => {
    const next = migrate({ version: 5, rates: [{ userId: 'u1', hourlyCost: 300, currency: 'EGP' }] }, 6)!
    expect(next.rates).toEqual([{ id: 'r-u1', userId: 'u1', hourlyCost: 300, currency: 'EGP', effectiveFrom: '1970-01-01T00:00:00.000Z' }])
  })

  it('6 → 7 numbers each channel\'s messages in time order and turns read times into read seqs', () => {
    const v6 = {
      version: 6,
      channels: [{ id: 'c1' }, { id: 'c2' }],
      messages: [
        { id: 'b', channelId: 'c1', createdAt: 'T2' },
        { id: 'a', channelId: 'c1', createdAt: 'T2' },
        { id: 'c', channelId: 'c1', createdAt: 'T1' },
        { id: 'd', channelId: 'c2', createdAt: 'T3' },
      ],
      reads: { u1: { c1: 'T1', c2: 'T0' }, u2: { c1: 'T9' } },
    }
    const next = migrate(v6, 7)!
    const seq = Object.fromEntries((next.messages as { id: string; seq: number }[]).map((m) => [m.id, m.seq]))
    expect(seq).toEqual({ c: 1, a: 2, b: 3, d: 1 })
    expect(next.reads).toBeUndefined()
    const fresh = { starred: false, muted: false, notifyLevel: 'all' }
    expect(next.channelState).toEqual({
      u1: { c1: { ...fresh, lastReadSeq: 1 }, c2: { ...fresh, lastReadSeq: 0 } },
      u2: { c1: { ...fresh, lastReadSeq: 3 } },
    })
  })

  it('6 → 7 with no messages or reads still gives an empty state map', () => {
    expect(migrate({ version: 6 }, 7)).toMatchObject({ messages: [], channelState: {} })
  })
})

describe('7 → 8', () => {
  it('gives every message and reply the body of its text; deleted ones get an empty body', () => {
    const next = migrate({ version: 7, messages: [{ id: 'm1', content: '*hi*' }, { id: 'm2', content: '', deletedAt: 'T' }], replies: [{ id: 'r1', content: 'NEX-1' }] }, 8)!
    expect((next.messages as { body: unknown }[]).map((m) => m.body)).toEqual([[{ type: 'p', children: [{ type: 'text', text: 'hi', marks: ['b'] }] }], []])
    expect((next.replies as { body: unknown }[])[0].body).toEqual([{ type: 'p', children: [{ type: 'task', key: 'NEX-1' }] }])
  })
})

describe('8 → 9', () => {
  it('adds an empty list of drafts', () => {
    expect(migrate({ version: 8 }, 9)).toMatchObject({ version: 9, drafts: [] })
  })
})

describe('9 → 10', () => {
  it('adds an empty trash (what deletes keep for Undo)', () => {
    expect(migrate({ version: 9 }, 10)).toMatchObject({ version: 10, trash: [] })
  })
})

describe('10 → 11', () => {
  it('adds no thread follows yet: everyone follows by the defaults (spec 6.7)', () => {
    expect(migrate({ version: 10 }, 11)).toMatchObject({ version: 11, threadFollows: [] })
  })
})

describe('11 → 12', () => {
  it('adds no activity items yet, and a channel’s level that was All (nobody could choose) becomes Mentions; a DM stays All', () => {
    const doc = {
      version: 11,
      channels: [{ id: 'c1', kind: 'channel' }, { id: 'd1', kind: 'dm' }],
      channelState: { u1: { c1: { lastReadSeq: 3, starred: true, muted: false, notifyLevel: 'all' }, d1: { lastReadSeq: 1, starred: false, muted: false, notifyLevel: 'all' } } },
    }
    expect(migrate(doc, 12)).toMatchObject({
      version: 12,
      notifications: [],
      channelState: { u1: { c1: { lastReadSeq: 3, starred: true, notifyLevel: 'mentions' }, d1: { notifyLevel: 'all' } } },
    })
  })
})

describe('12 → 13', () => {
  it('every channel gets an empty description and Everyone posting (spec 6.10, §9)', () => {
    const doc = { version: 12, channels: [{ id: 'c1', kind: 'channel' }, { id: 'd1', kind: 'dm', description: 'kept' }] }
    expect(migrate(doc, 13)).toMatchObject({
      version: 13,
      channels: [{ id: 'c1', description: '', whoCanPost: 'everyone' }, { id: 'd1', description: 'kept', whoCanPost: 'everyone' }],
    })
  })

  it('a value it can’t use becomes the default; a good one stays (review)', () => {
    const doc = { version: 12, channels: [{ id: 'c1', description: 7, whoCanPost: 'owner' }, { id: 'c2', description: 'Ops', whoCanPost: 'admins' }] }
    expect(migrate(doc, 13)).toMatchObject({
      channels: [{ id: 'c1', description: '', whoCanPost: 'everyone' }, { id: 'c2', description: 'Ops', whoCanPost: 'admins' }],
    })
  })
})

describe('13 → 14', () => {
  it('no invitations yet, and #general is the only default channel (spec 6.10)', () => {
    const doc = { version: 13, channels: [{ id: 'c-general', isPrivate: false }, { id: 'c1', isPrivate: false, isDefault: 'yes' }] }
    expect(migrate(doc, 14)).toMatchObject({ version: 14, invitations: [], channels: [{ id: 'c-general', isDefault: true }, { id: 'c1', isDefault: false }] })
  })
})

describe('14 → 15', () => {
  it('every file gets its uploader, a title, no description, a clean scan; copies in messages and replies too (spec 6.9)', () => {
    const doc = {
      version: 14,
      currentUserId: 'u-1',
      attachments: [{ id: 'a1', name: 'scope.pdf' }, { id: 'a2', name: 'shot.png' }, { id: 'a3', name: 'log.txt' }],
      projectFiles: [{ id: 'pf1', attachmentId: 'a1', uploadedBy: 'u-4' }],
      comments: [{ id: 'cm1', authorId: 'u-2', attachmentIds: ['a2'] }],
      messages: [{ id: 'm1', attachments: [{ id: 'a2', name: 'shot.png' }] }],
      replies: [{ id: 'r1', attachments: [{ id: 'a9', name: 'old.txt' }] }],
    }
    const clean = { description: '', scanStatus: 'clean', thumbUrl: null, previewUrl: null, deletedAt: null }
    expect(migrate(doc, 15)).toMatchObject({
      version: 15,
      attachments: [
        { id: 'a1', uploadedBy: 'u-4', title: 'scope.pdf', ...clean },
        { id: 'a2', uploadedBy: 'u-2', title: 'shot.png', ...clean },
        { id: 'a3', uploadedBy: 'u-1', title: 'log.txt', ...clean },
      ],
      messages: [{ attachments: [{ id: 'a2', uploadedBy: 'u-2', title: 'shot.png', ...clean }] }],
      replies: [{ attachments: [{ id: 'a9', uploadedBy: 'u-1', title: 'old.txt', ...clean }] }],
    })
  })
})

describe('15 → 16', () => {
  it('no reminders or scheduled messages yet (spec §7)', () => {
    expect(migrate({ version: 15, currentUserId: 'u-1' }, 16)).toMatchObject({ version: 16, reminders: [], scheduled: [] })
  })
})

describe('16 → 17', () => {
  it('each reminder becomes a saved item In progress with its time (spec 6.5)', () => {
    const target = { kind: 'message', id: 'm1' }
    const doc = { version: 16, currentUserId: 'u-1', reminders: [{ id: 'r1', userId: 'u-1', workspaceId: 'ws', target, remindAt: '2030-01-01T09:00:00.000Z', firedAt: null }] }
    const out = migrate(doc, 17)!
    expect(out.saved).toEqual([{ id: 'r1', userId: 'u-1', workspaceId: 'ws', target, status: 'inProgress', remindAt: '2030-01-01T09:00:00.000Z', firedAt: null, savedAt: '2030-01-01T09:00:00.000Z' }])
    expect(out).not.toHaveProperty('reminders')
  })
})

describe('17 → 18', () => {
  it('files say they are not snippets (spec 6.9), wherever they are kept', () => {
    const doc = { version: 17, currentUserId: 'u-1', attachments: [{ id: 'a1' }], messages: [{ attachments: [{ id: 'a1' }] }], replies: [{ attachments: [{ id: 'a2' }] }] }
    const out = migrate(doc, 18) as { attachments: { snippet: unknown }[]; messages: { attachments: { snippet: unknown }[] }[]; replies: { attachments: { snippet: unknown }[] }[] }
    expect(out.attachments[0].snippet).toBeNull()
    expect(out.messages[0].attachments[0].snippet).toBeNull()
    expect(out.replies[0].attachments[0].snippet).toBeNull()
  })
})
