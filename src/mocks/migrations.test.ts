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

