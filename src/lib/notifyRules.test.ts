import { describe, expect, it } from 'vitest'
import type { Preferences } from '@/api/types'
import { parseBody } from '@/lib/messageBody'
import { clockLabel, desktopNote, dndEndLabel, dndState, notifies, pausePresets } from './notifyRules'

const prefs = (over: Partial<Preferences> = {}): Preferences => ({
  defaultLevel: 'mentions', keywords: [], desktop: true, push: true, emailDigest: 'daily', dndUntil: null,
  dndSchedule: { on: false, from: '18:00', to: '09:00', days: [0, 1, 2, 3, 4], tz: 'Africa/Cairo' }, ...over,
})
// Riyadh is UTC+3 all year (Cairo's summer time would move these tests with the date).
const at = (riyadh: string) => new Date(`${riyadh}+03:00`)

describe('dndState (spec 6.11: Do Not Disturb, paused or on a schedule)', () => {
  it('paused until a time', () => {
    const p = prefs({ dndUntil: '2026-10-28T10:00:00.000Z' })
    expect(dndState(p, new Date('2026-10-28T09:59:00Z'))).toEqual({ reason: 'paused', until: '2026-10-28T10:00:00.000Z' })
    expect(dndState(p, new Date('2026-10-28T10:00:00Z'))).toBeNull()
  })
  it('a schedule within a day', () => {
    const p = prefs({ dndSchedule: { on: true, from: '12:00', to: '13:30', days: [3], tz: 'Asia/Riyadh' } })
    // 28 Oct 2026 is a Wednesday (3).
    expect(dndState(p, at('2026-10-28T12:30:00'))).toEqual({ reason: 'schedule', until: '2026-10-28T10:30:00.000Z' })
    expect(dndState(p, at('2026-10-28T13:30:00'))).toBeNull()
    expect(dndState(p, at('2026-10-29T12:30:00'))).toBeNull()
  })
  it('a schedule past midnight counts from the day it starts', () => {
    const p = prefs({ dndSchedule: { on: true, from: '18:00', to: '09:00', days: [4], tz: 'Asia/Riyadh' } })
    // Thursday 29 Oct, 22:00, and Friday 30 Oct, 08:00, are in Thursday's night; Friday 22:00 isn't (Friday is off).
    expect(dndState(p, at('2026-10-29T22:00:00'))).toEqual({ reason: 'schedule', until: '2026-10-30T06:00:00.000Z' })
    expect(dndState(p, at('2026-10-30T08:00:00'))).toEqual({ reason: 'schedule', until: '2026-10-30T06:00:00.000Z' })
    expect(dndState(p, at('2026-10-30T22:00:00'))).toBeNull()
    expect(dndState(p, at('2026-10-29T17:59:00'))).toBeNull()
  })
  it('is read in the schedule’s own zone, whatever the browser’s', () => {
    const p = prefs({ dndSchedule: { on: true, from: '18:00', to: '19:00', days: [3], tz: 'Asia/Tokyo' } })
    // 09:30 UTC on Wednesday 28 Oct is 18:30 in Tokyo.
    expect(dndState(p, new Date('2026-10-28T09:30:00Z'))).toEqual({ reason: 'schedule', until: '2026-10-28T10:00:00.000Z' })
  })
  it('a schedule ends at its time in its zone, also across a clock change', () => {
    // New York falls back an hour at 2:00 AM on Sunday 1 Nov 2026: Saturday night still ends at 9:00 AM there (14:00 UTC).
    const p = prefs({ dndSchedule: { on: true, from: '22:00', to: '09:00', days: [6], tz: 'America/New_York' } })
    expect(dndState(p, new Date('2026-11-01T03:00:00Z'))).toEqual({ reason: 'schedule', until: '2026-11-01T14:00:00.000Z' })
  })
  it('a pause wins over the schedule; off means off', () => {
    const p = prefs({ dndUntil: '2026-10-28T23:00:00.000Z', dndSchedule: { on: true, from: '00:00', to: '23:59', days: [3], tz: 'Asia/Riyadh' } })
    expect(dndState(p, at('2026-10-28T12:00:00'))?.reason).toBe('paused')
    expect(dndState(prefs(), at('2026-10-28T20:00:00'))).toBeNull()
  })
})

describe('pausePresets', () => {
  it('30 minutes, 1 hour, 2 hours, and tomorrow at 9:00 AM', () => {
    const now = new Date(2026, 9, 28, 15, 10)
    expect(pausePresets(now).map((p) => [p.label, new Date(p.until).getTime()])).toEqual([
      ['30 minutes', now.getTime() + 30 * 60_000],
      ['1 hour', now.getTime() + 60 * 60_000],
      ['2 hours', now.getTime() + 120 * 60_000],
      ['Until tomorrow at 9:00 AM', new Date(2026, 9, 29, 9, 0).getTime()],
    ])
  })
})

describe('clockLabel', () => {
  it('reads HH:MM as a 12-hour time', () => {
    expect(clockLabel('09:00')).toBe('9:00 AM')
    expect(clockLabel('18:30')).toBe('6:30 PM')
    expect(clockLabel('00:05')).toBe('12:05 AM')
  })
})

describe('notifies (what reaches me outside the app, spec 6.11)', () => {
  const row = (text: string, over: Record<string, unknown> = {}) => ({ senderId: 'u-2', body: parseBody(text), mentions: [], hereIds: undefined, ...over })
  const channel = (over: Record<string, unknown> = {}) => ({ kind: 'channel' as const, notifyLevel: 'mentions' as const, muted: false, ...over })
  const now = at('2026-10-28T12:00:00')
  const me = 'u-1'
  it('a reply in a thread I muted reaches me only by a mention or keyword, even at All (slice AA)', () => {
    const all = channel({ notifyLevel: 'all' })
    expect(notifies(row('looks fine'), all, me, prefs(), now, { threadMuted: true })).toBe(false)
    expect(notifies(row('hi', { mentions: [{ kind: 'user', id: me }] }), all, me, prefs(), now, { threadMuted: true })).toBe(true)
    expect(notifies(row('the deploy is done'), all, me, prefs({ keywords: ['deploy'] }), now, { threadMuted: true })).toBe(true)
    expect(notifies(row('looks fine'), all, me, prefs(), now)).toBe(true)
  })

  it('at Mentions and keywords: a mention or a keyword, not anything else', () => {
    expect(notifies(row('hi', { mentions: [{ kind: 'user', id: me }] }), channel(), me, prefs(), now)).toBe(true)
    expect(notifies(row('the deploy is done'), channel(), me, prefs({ keywords: ['deploy'] }), now)).toBe(true)
    expect(notifies(row('hello all'), channel(), me, prefs(), now)).toBe(false)
  })
  it('@channel reaches me; @here only if it reached me when sent', () => {
    expect(notifies(row('x', { mentions: [{ kind: 'all', id: 'all' }] }), channel(), me, prefs(), now)).toBe(true)
    expect(notifies(row('x', { mentions: [{ kind: 'here', id: 'here' }], hereIds: ['u-3'] }), channel(), me, prefs(), now)).toBe(false)
    expect(notifies(row('x', { mentions: [{ kind: 'here', id: 'here' }], hereIds: [me] }), channel(), me, prefs(), now)).toBe(true)
  })
  it('at All: every message; in a DM: every message', () => {
    expect(notifies(row('hello'), channel({ notifyLevel: 'all' }), me, prefs(), now)).toBe(true)
    expect(notifies(row('hello'), channel({ kind: 'dm', notifyLevel: 'all' }), me, prefs(), now)).toBe(true)
  })
  it('never my own, never at Nothing or muted, never during Do Not Disturb (the desktop switch is the notifier’s)', () => {
    const mention = row('x', { mentions: [{ kind: 'user', id: me }] })
    expect(notifies({ ...mention, senderId: me }, channel(), me, prefs(), now)).toBe(false)
    expect(notifies(mention, channel({ notifyLevel: 'none' }), me, prefs(), now)).toBe(false)
    expect(notifies(mention, channel({ muted: true }), me, prefs(), now)).toBe(false)
    expect(notifies(mention, channel(), me, prefs({ dndUntil: '2026-10-28T23:00:00.000Z' }), now)).toBe(false)
    expect(notifies(mention, channel(), me, prefs({ desktop: false }), now)).toBe(true)
  })
  it('a keyword only in someone’s own words, as the bell counts it: not a task’s or a comment’s card', () => {
    const p = prefs({ keywords: ['deploy'] })
    expect(notifies(row('Fix deploy pipeline', { taskEvent: { kind: 'done' } }), channel(), me, p, now)).toBe(false)
    expect(notifies(row('deploy notes', { commentId: 'cm-1' }), channel(), me, p, now)).toBe(false)
    expect(notifies(row('deploy notes'), channel(), me, p, now)).toBe(true)
  })
  it('never what the channel itself says (joined, renamed), even at All', () => {
    const joined = row('joined #backend', { system: { kind: 'joined' } })
    expect(notifies(joined, channel({ notifyLevel: 'all' }), me, prefs(), now)).toBe(false)
  })
})

describe('dndEndLabel (when Do Not Disturb ends, as the bell menu and the avatar say it)', () => {
  const now = new Date(2026, 9, 28, 15, 10)
  it('a schedule’s end reads in my own time, like a pause', () => {
    expect(dndEndLabel({ reason: 'schedule', until: new Date(2026, 9, 28, 18, 0).toISOString() }, now)).toBe('6:00 PM')
    expect(dndEndLabel({ reason: 'schedule', until: new Date(2026, 9, 29, 9, 0).toISOString() }, now)).toBe('tomorrow at 9:00 AM')
  })
  it('a pause: the time today, "tomorrow at", or the day after that', () => {
    expect(dndEndLabel({ reason: 'paused', until: new Date(2026, 9, 28, 16, 40).toISOString() }, now)).toBe('4:40 PM')
    expect(dndEndLabel({ reason: 'paused', until: new Date(2026, 9, 29, 9, 0).toISOString() }, now)).toBe('tomorrow at 9:00 AM')
    expect(dndEndLabel({ reason: 'paused', until: new Date(2026, 10, 2, 9, 0).toISOString() }, now)).toBe('Mon 2 Nov at 9:00 AM')
  })
})

describe('desktopNote (what a desktop notification says)', () => {
  const people = [{ id: 'u-1', name: 'Youssef Abdelrahman' }, { id: 'u-2', name: 'Nour El-Sayed' }]
  const backend = { kind: 'channel' as const, name: 'backend', memberIds: ['u-1', 'u-2', 'u-3'] }
  const dm = { kind: 'dm' as const, name: null, memberIds: ['u-1', 'u-2'] }
  const row = (text: string, over: Record<string, unknown> = {}) => ({ senderId: 'u-2', body: parseBody(text), attachments: [], ...over })
  it('a channel message: the channel, then who said what', () => {
    expect(desktopNote(row('the deploy is done'), false, backend, people)).toEqual({ title: '#backend', body: 'Nour El-Sayed: the deploy is done' })
  })
  it('a reply says it is in a thread', () => {
    expect(desktopNote(row('on it'), true, backend, people).title).toBe('Thread in #backend')
  })
  it('a DM: the person, then what they said', () => {
    expect(desktopNote(row('lunch?'), false, dm, people)).toEqual({ title: 'Nour El-Sayed', body: 'lunch?' })
  })
  it('files alone say so; a long text is cut with an ellipsis on one line', () => {
    const file = { id: 'a1' }
    expect(desktopNote(row('', { attachments: [file] }), false, dm, people).body).toBe('Sent a file')
    expect(desktopNote(row('', { attachments: [file, file] }), false, dm, people).body).toBe('Sent 2 files')
    const long = desktopNote(row(`first line\n\n${'word '.repeat(60)}`), false, dm, people).body
    expect(long.length).toBe(140)
    expect(long.startsWith('first line word')).toBe(true)
    expect(long.endsWith('…')).toBe(true)
  })
})
