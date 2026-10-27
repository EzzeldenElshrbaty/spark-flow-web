import { describe, expect, it } from 'vitest'
import type { ChatMessage, ThreadReply } from '@/api/types'
import { buildRows, canContinue, dayLabel, jumpSince, unreadSummary } from './messageRows'

// Local times (the viewer's time zone), so the day rules hold in any TZ the tests run in.
const at = (day: number, h: number, m: number, s = 0) => new Date(2026, 9, day, h, m, s).toISOString()
let n = 0
const msg = (over: Partial<ChatMessage> = {}): ChatMessage => {
  n++
  return {
    id: `m${n}`, channelId: 'c1', seq: n, senderId: 'u-2', content: `hi ${n}`, attachments: [], reactions: [], threadCount: 0, lastReplyAt: null,
    linkedTicketKeys: [], mentions: [], body: [], editedAt: null, createdAt: at(27, 10, 0), ...over,
  }
}
const now = new Date(2026, 9, 28, 12, 0)

describe('canContinue (spec 6.2 grouping rule)', () => {
  it('same author, same day, up to 5 minutes apart', () => {
    const a = msg({ createdAt: at(27, 10, 0) })
    expect(canContinue(a, msg({ createdAt: at(27, 10, 5) }))).toBe(true)
    expect(canContinue(a, msg({ createdAt: at(27, 10, 5, 1) }))).toBe(false)
  })
  it('another author breaks the group', () => {
    expect(canContinue(msg(), msg({ senderId: 'u-3' }))).toBe(false)
  })
  it('a new day breaks the group even within 5 minutes', () => {
    expect(canContinue(msg({ createdAt: at(27, 23, 58) }), msg({ createdAt: at(28, 0, 1) }))).toBe(false)
  })
  it('a message with thread replies ends its group', () => {
    expect(canContinue(msg({ threadCount: 2 }), msg())).toBe(false)
  })
  it('cards (task events, comments) never group, before or after', () => {
    const card = msg({ taskEvent: { key: 'NEX-1', kind: 'created' } })
    expect(canContinue(card, msg())).toBe(false)
    expect(canContinue(msg(), card)).toBe(false)
    expect(canContinue(msg(), msg({ commentId: 'k1' }))).toBe(false)
  })
  it('thread replies group by the same rule', () => {
    const reply = (over: Partial<ThreadReply>): ThreadReply => ({
      id: 'r', messageId: 'm', channelId: 'c1', senderId: 'u-2', content: 'x', body: [], attachments: [], reactions: [], mentions: [], createdAt: at(28, 9, 0), ...over,
    })
    expect(canContinue(reply({}), reply({ createdAt: at(28, 9, 4) }))).toBe(true)
    expect(canContinue(reply({}), reply({ createdAt: at(28, 9, 6) }))).toBe(false)
    expect(canContinue(reply({}), reply({ createdAt: at(28, 9, 1), deletedAt: at(28, 9, 2) }))).toBe(false)
  })
  it('system messages never group', () => {
    expect(canContinue(msg(), msg({ system: { kind: 'joined' } }))).toBe(false)
    expect(canContinue(msg({ system: { kind: 'left' } }), msg())).toBe(false)
  })
})

describe('dayLabel', () => {
  it('says Today, Yesterday, else the weekday and date, with the year only when it differs', () => {
    expect(dayLabel(new Date(2026, 9, 28, 1), now)).toBe('Today')
    expect(dayLabel(new Date(2026, 9, 27, 23), now)).toBe('Yesterday')
    expect(dayLabel(new Date(2026, 9, 23), now)).toBe('Friday, October 23')
    expect(dayLabel(new Date(2025, 9, 23), now)).toBe('Thursday, October 23, 2025')
  })
})

describe('buildRows', () => {
  const kinds = (rows: ReturnType<typeof buildRows>) =>
    rows.map((r) => (r.kind === 'day' ? `day:${r.label}` : r.kind === 'new' ? 'new' : `${r.message.id}${r.continuation ? '+' : ''}`))

  it('wraps each day in a section and marks continuations', () => {
    const a = msg({ id: 'a', createdAt: at(27, 10, 0) })
    const b = msg({ id: 'b', createdAt: at(27, 10, 3) })
    const c = msg({ id: 'c', createdAt: at(28, 9, 0) })
    const d = msg({ id: 'd', createdAt: at(28, 9, 1), senderId: 'u-3' })
    expect(kinds(buildRows([a, b, c, d], { newAfterSeq: null, now }))).toEqual(['day:Yesterday', 'a', 'b+', 'day:Today', 'c', 'd'])
  })

  it('puts the New line before the first message someone else sent after my marker, and starts a group there', () => {
    const a = msg({ id: 'a', createdAt: at(28, 9, 0) })
    const mine = msg({ id: 'mine', senderId: 'u-1', createdAt: at(28, 9, 1) })
    const b = msg({ id: 'b', createdAt: at(28, 9, 2) })
    const c = msg({ id: 'c', createdAt: at(28, 9, 3) })
    expect(kinds(buildRows([a, mine, b, c], { newAfterSeq: a.seq, meId: 'u-1', now }))).toEqual(['day:Today', 'a', 'mine', 'new', 'b', 'c+'])
  })

  it('has no New line when nothing is newer than the marker, or there is no marker', () => {
    const a = msg({ createdAt: at(28, 9, 0) })
    expect(kinds(buildRows([a], { newAfterSeq: a.seq, now }))).not.toContain('new')
    expect(kinds(buildRows([a], { newAfterSeq: null, now }))).not.toContain('new')
  })

  it('has no New line while older messages that could hold the first unread one are not loaded yet', () => {
    const a = msg({ createdAt: at(28, 9, 0) })
    const b = msg({ createdAt: at(28, 9, 1) })
    // The marker is before everything loaded, and there is more above: the first unread message isn't here.
    expect(kinds(buildRows([a, b], { newAfterSeq: a.seq - 5, hasOlder: true, now }))).not.toContain('new')
    // Nothing older: the first loaded message is the first unread one.
    expect(kinds(buildRows([a, b], { newAfterSeq: a.seq - 5, hasOlder: false, now }))).toContain('new')
    // The marker message itself is loaded: the line goes after it.
    expect(kinds(buildRows([a, b], { newAfterSeq: a.seq, hasOlder: true, now }))).toContain('new')
  })

  it('drops a deleted message without replies; one with replies stays to hold its thread (spec 6.3)', () => {
    const a = msg({ id: 'a', createdAt: at(28, 9, 0) })
    const gone = msg({ id: 'gone', createdAt: at(28, 9, 1), deletedAt: at(28, 9, 2) })
    const kept = msg({ id: 'kept', createdAt: at(28, 9, 2), deletedAt: at(28, 9, 3), threadCount: 2 })
    expect(kinds(buildRows([a, gone, kept], { newAfterSeq: null, now }))).toEqual(['day:Today', 'a', 'kept'])
  })

  it('system messages are never unread: no New line before them', () => {
    const a = msg({ createdAt: at(28, 9, 0) })
    const joined = msg({ id: 'joined', createdAt: at(28, 9, 1), system: { kind: 'joined' } })
    expect(kinds(buildRows([a, joined], { newAfterSeq: a.seq, now }))).not.toContain('new')
    expect(unreadSummary([a, joined], a.seq, 'u-1').count).toBe(0)
  })

  it('keys are stable: a message keeps its key when older ones are added', () => {
    const a = msg({ createdAt: at(28, 9, 0) })
    const b = msg({ createdAt: at(28, 9, 1) })
    const before = buildRows([b], { newAfterSeq: null, now }).map((r) => r.key)
    const after = buildRows([a, b], { newAfterSeq: null, now }).map((r) => r.key)
    expect(after).toEqual(expect.arrayContaining(before))
  })
})

describe('unreadSummary', () => {
  it('counts what others sent after my marker and when the first came', () => {
    const a = msg({ createdAt: at(28, 9, 0) })
    const mine = msg({ senderId: 'u-1', createdAt: at(28, 9, 1) })
    const b = msg({ createdAt: at(28, 21, 3) })
    const c = msg({ createdAt: at(28, 21, 4) })
    expect(unreadSummary([a, mine, b, c], a.seq, 'u-1')).toEqual({ count: 2, since: b.createdAt })
    expect(unreadSummary([a], a.seq, 'u-1')).toEqual({ count: 0, since: null })
  })
})

describe('jumpSince (spec 6.2 date menu)', () => {
  const at = new Date(2026, 9, 28, 15, 30)
  it('starts each choice at local midnight', () => {
    expect(jumpSince('today', at)).toBe(new Date(2026, 9, 28).toISOString())
    expect(jumpSince('yesterday', at)).toBe(new Date(2026, 9, 27).toISOString())
    expect(jumpSince('week', at)).toBe(new Date(2026, 9, 21).toISOString())
    expect(jumpSince('month', at)).toBe(new Date(2026, 8, 28).toISOString())
  })
  it('the very beginning has no start time', () => {
    expect(jumpSince('beginning', at)).toBeNull()
  })
})
