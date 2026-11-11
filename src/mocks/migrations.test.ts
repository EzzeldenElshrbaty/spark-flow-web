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

describe('18 → 19', () => {
  it('saved items can now be /remind notes; nothing stored changes', () => {
    const doc = { version: 18, currentUserId: 'u-1', saved: [{ id: 's1', target: { kind: 'message', id: 'm1' } }] }
    expect(migrate(doc, 19)).toEqual({ ...doc, version: 19 })
  })
})

describe('26 → 27 (attendance)', () => {
  it('starts with no visits and Sunday to Thursday, 9 to 5, Cairo time; old check-ins stay as they were', () => {
    const out = migrate({ version: 26, currentUserId: 'u-1', settings: { archiveRetentionDays: 90 }, checkIns: [{ id: 'ci-1' }] }, 27) as {
      settings: Record<string, unknown>
      visits: unknown[]
      checkIns: unknown[]
    }
    expect(out.visits).toEqual([])
    expect(out.settings).toEqual({ archiveRetentionDays: 90, workHours: { days: [0, 1, 2, 3, 4], start: '09:00', end: '17:00', timeZone: 'Africa/Cairo' } })
    expect(out.checkIns).toEqual([{ id: 'ci-1' }])
  })
})

describe('25 → 26 (archived records)', () => {
  it('keeps archived records a year by default, and the built-in Admin role may manage them', () => {
    const out = migrate({ version: 25, currentUserId: 'u-1', roles: [{ id: 'admin', builtIn: true, grants: ['audit.view'] }, { id: 'member', builtIn: true, grants: [] }] }, 26) as {
      settings: { archiveRetentionDays: number }
      roles: { grants: string[] }[]
    }
    expect(out.settings).toEqual({ archiveRetentionDays: 365 })
    expect(out.roles[0].grants).toEqual(['audit.view', 'archive.manage'])
    expect(out.roles[1].grants).toEqual([])
  })
})

describe('24 → 25 (the audit log)', () => {
  it('starts an empty log, and the built-in Admin role may read it', () => {
    const out = migrate({ version: 24, currentUserId: 'u-1', roles: [{ id: 'admin', builtIn: true, grants: ['settings.manage'] }, { id: 'sales', builtIn: true, grants: [] }] }, 25) as { audit: unknown[]; roles: { grants: string[] }[] }
    expect(out.audit).toEqual([])
    expect(out.roles[0].grants).toEqual(['settings.manage', 'audit.view'])
    expect(out.roles[1].grants).toEqual([])
  })
})

describe('23 → 24 (roles become records)', () => {
  it('stores the four built-in roles with today’s rights, and each person holds the role they had', () => {
    const out = migrate(
      { version: 23, currentUserId: 'u-1', users: [{ id: 'u-1', role: 'admin' }, { id: 'u-2', role: 'sales' }, { id: 'u-3', role: 'pm' }, { id: 'u-4', role: 'odd' }, { id: 'u-5' }] },
      24,
    ) as { roles: { id: string; builtIn: boolean; grants: string[] }[]; users: Record<string, unknown>[] }
    expect(out.roles.map((r) => [r.id, r.builtIn])).toEqual([['admin', true], ['sales', true], ['pm', true], ['member', true]])
    expect(out.roles.find((r) => r.id === 'sales')!.grants).toEqual(['dashboard.all', 'projects.create', 'projects.editAll', 'projects.postAll'])
    expect(out.users.map((u) => u.roleIds)).toEqual([['admin'], ['sales'], ['pm'], ['member'], ['member']])
    expect(out.users.every((u) => !('role' in u))).toBe(true)
  })

  it('keeps the four roles as they were on that day, whatever later permissions add, and roles already given', () => {
    const out = migrate({ version: 23, currentUserId: 'u-1', users: [{ id: 'u-1', roleIds: ['sales', 'pm'] }] }, 24) as { roles: { id: string; grants: string[] }[]; users: Record<string, unknown>[] }
    expect(out.users[0].roleIds).toEqual(['sales', 'pm'])
    expect(out.roles.find((r) => r.id === 'admin')!.grants).toHaveLength(19)
  })
})

describe('22 → 23', () => {
  it('no preferences yet; a channel level equal to its old default now follows the default', () => {
    const out = migrate(
      {
        version: 22,
        currentUserId: 'u-1',
        channels: [{ id: 'c1', kind: 'channel' }, { id: 'c2', kind: 'channel' }, { id: 'd1', kind: 'dm' }, { id: 'd2', kind: 'dm' }],
        channelState: { 'u-1': { c1: { notifyLevel: 'mentions' }, c2: { notifyLevel: 'all' }, d1: { notifyLevel: 'all' }, d2: { notifyLevel: 'none' } } },
      },
      23,
    ) as { notificationPrefs: unknown[]; channelState: Record<string, Record<string, { notifyLevel: unknown }>> }
    expect(out.notificationPrefs).toEqual([])
    expect(Object.fromEntries(Object.entries(out.channelState['u-1']).map(([id, s]) => [id, s.notifyLevel]))).toEqual({ c1: null, c2: 'all', d1: null, d2: 'none' })
  })
})

describe('21 → 22', () => {
  it('a sidebar order holds `ids` (channels or projects) instead of `channelIds`', () => {
    const out = migrate({ version: 21, currentUserId: 'u-1', sidebarOrders: [{ id: 'u-1:ws:channels', userId: 'u-1', workspaceId: 'ws', section: 'channels', channelIds: ['c1'] }] }, 22)
    expect(out).toMatchObject({ version: 22, sidebarOrders: [{ id: 'u-1:ws:channels', section: 'channels', ids: ['c1'] }] })
    expect((out as { sidebarOrders: Record<string, unknown>[] }).sidebarOrders[0]).not.toHaveProperty('channelIds')
  })
})

describe('20 → 21', () => {
  it('nobody has ordered their sidebar yet', () => {
    expect(migrate({ version: 20, currentUserId: 'u-1' }, 21)).toMatchObject({ version: 21, sidebarOrders: [] })
  })
})

describe('19 → 20', () => {
  it('no pins or folders yet; every file is in no folder', () => {
    const out = migrate({ version: 19, currentUserId: 'u-1', attachments: [{ id: 'a1' }], messages: [{ attachments: [{ id: 'a1' }] }] }, 20) as { pins: unknown[]; folders: unknown[]; attachments: { folderId: unknown }[]; messages: { attachments: { folderId: unknown }[] }[] }
    expect(out).toMatchObject({ version: 20, pins: [], folders: [], bookmarks: [] })
    expect(out.attachments[0].folderId).toBeNull()
    expect(out.messages[0].attachments[0].folderId).toBeNull()
  })
})

describe('27 → 28', () => {
  it("sets endReason 'stopped' on ended timer entries and null on running and manual ones", () => {
    const out = migrate({
      version: 27, currentUserId: 'u-1',
      timeEntries: [
        { id: 'a', source: 'timer', endedAt: '2026-11-01T10:00:00.000Z' },
        { id: 'b', source: 'timer', endedAt: null },
        { id: 'c', source: 'manual', endedAt: '2026-11-01T11:00:00.000Z' },
      ],
    }, 28) as { version: number; timeEntries: { id: string; endReason: unknown }[] }
    expect(out.version).toBe(28)
    expect(out.timeEntries.map((e) => [e.id, e.endReason])).toEqual([['a', 'stopped'], ['b', null], ['c', null]])
  })
})

describe('28 → 29', () => {
  it('timers pause after 4 hours unless the company says otherwise', () => {
    expect(migrate({ version: 28, currentUserId: 'u-1', settings: { archiveRetentionDays: 90 } }, 29)).toMatchObject({ version: 29, settings: { archiveRetentionDays: 90, timerTimeoutHours: 4 } })
  })
})

describe('29 → 30', () => {
  it('check-ins go (timer slice 3): attendance comes from timer entries', () => {
    const out = migrate({ version: 29, currentUserId: 'u-1', checkIns: [{ id: 'ci-1' }], timeEntries: [{ id: 'te-1' }] }, 30)
    expect(out).toEqual({ version: 30, currentUserId: 'u-1', timeEntries: [{ id: 'te-1' }] })
  })
})

describe('30 → 31 (task files, formatted descriptions)', () => {
  it('a plain description becomes paragraphs, and every task gets an empty file list', () => {
    const p = (t: string) => ({ type: 'p', children: [{ type: 'text', text: t }] })
    expect(migrate({ version: 30, tickets: [{ id: 't1', description: 'a\n\nb' }] }, 31)).toEqual({
      version: 31, tickets: [{ id: 't1', description: 'a\n\nb', descriptionBody: [p('a'), p('b')], attachmentIds: [] }],
    })
  })
})

describe('31 → 32 (single-key shortcuts, UX Phase 5A 5.13)', () => {
  it('every stored preferences record gets single-key shortcuts on', () => {
    expect(migrate({ version: 31, notificationPrefs: [{ id: 'u-1', desktop: true }] }, 32)).toEqual({
      version: 32, notificationPrefs: [{ id: 'u-1', desktop: true, singleKeyShortcuts: true }],
    })
  })
})

describe('32 → 33 (channel pages, chat spec 6.14)', () => {
  it('32 → 33 adds pages, pageVersions and pageMentions', () => {
    expect(migrate({ version: 32, bookmarks: [] }, 33)).toEqual({ version: 33, bookmarks: [], pages: [], pageVersions: [], pageMentions: [] })
  })
})

describe('33 → 34 (who made a channel)', () => {
  it('a channel is dated by its first message; the creator is unknown', () => {
    const doc = migrate(
      {
        version: 33,
        channels: [{ id: 'c1' }, { id: 'c2' }],
        messages: [
          { channelId: 'c1', createdAt: '2026-10-02T09:00:00.000Z' },
          { channelId: 'c1', createdAt: '2026-10-01T09:00:00.000Z' },
        ],
      },
      34,
    )!
    expect(doc.channels).toEqual([
      { id: 'c1', createdAt: '2026-10-01T09:00:00.000Z', createdBy: null },
      { id: 'c2', createdAt: null, createdBy: null },
    ])
  })
})

describe('34 → 35', () => {
  it('files say they are not voice or video messages (chat spec 6.9), wherever they are kept', () => {
    const doc = { version: 34, currentUserId: 'u-1', attachments: [{ id: 'a1' }], messages: [{ attachments: [{ id: 'a1' }] }], replies: [{ attachments: [{ id: 'a2' }] }] }
    const out = migrate(doc, 35) as { attachments: { clip: unknown }[]; messages: { attachments: { clip: unknown }[] }[]; replies: { attachments: { clip: unknown }[] }[] }
    expect(out.attachments[0].clip).toBeNull()
    expect(out.messages[0].attachments[0].clip).toBeNull()
    expect(out.replies[0].attachments[0].clip).toBeNull()
  })
})
