import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Api } from '@/api/types'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

let db: MockDb
let api: Api
let hub: MockHub
beforeEach(() => {
  latency.min = latency.max = 0
  hub = createMockHub(`test-prefs-${Math.random()}`, null)
  db = createDb(createMemoryStore(), seed)
  api = createMockApi(db, hub)
})
afterEach(() => hub.close())

const channel = async (id: string) => (await api.chat.channels('ws-eng')).find((c) => c.id === id)!

describe('preferences (spec 6.11, §7 NotificationPref)', () => {
  it('start from the defaults: Mentions and keywords, no keywords, desktop off, push on, a daily digest, no Do Not Disturb', async () => {
    expect(await api.preferences.get()).toEqual({
      defaultLevel: 'mentions', keywords: [], desktop: false, push: true, emailDigest: 'daily', dndUntil: null,
      dndSchedule: { on: false, from: '18:00', to: '09:00', days: [0, 1, 2, 3, 4], tz: 'Africa/Cairo' },
    })
  })

  it('save a part at a time, are mine alone, and say so live', async () => {
    const events: string[] = []
    const off = hub.subscribe((e) => events.push(e.type))
    expect(await api.preferences.update({ desktop: true, emailDigest: 'off' })).toMatchObject({ desktop: true, emailDigest: 'off', push: true })
    off()
    expect(events).toContain('preferencesChanged')
    db.actAs('u-2')
    expect((await api.preferences.get()).desktop).toBe(false)
  })

  it('keywords: trimmed, each once whatever the case, at most 20 of at most 40 characters', async () => {
    expect((await api.preferences.update({ keywords: [' deploy ', 'Deploy', 'page size', ''] })).keywords).toEqual(['deploy', 'page size'])
    await expect(api.preferences.update({ keywords: Array.from({ length: 21 }, (_, i) => `k${i}`) })).rejects.toMatchObject({ status: 400 })
    await expect(api.preferences.update({ keywords: ['x'.repeat(41)] })).rejects.toMatchObject({ status: 400 })
  })

  it('refuses what can’t be used, saving nothing', async () => {
    for (const bad of [
      { defaultLevel: 'loud' },
      { emailDigest: 'weekly' },
      { dndUntil: 'tomorrow' },
      { dndSchedule: { on: true, from: '25:00', to: '09:00', days: [1], tz: 'Africa/Cairo' } },
      { dndSchedule: { on: true, from: '18:00', to: '09:00', days: [], tz: 'Africa/Cairo' } },
      { dndSchedule: { on: true, from: '18:00', to: '09:00', days: [9], tz: 'Africa/Cairo' } },
      { dndSchedule: { on: true, from: '18:00', to: '09:00', days: [1], tz: 'Mars/Base' } },
      { dndSchedule: { on: true, from: '09:00', to: '09:00', days: [1], tz: 'Africa/Cairo' } },
    ]) {
      await expect(api.preferences.update(bad as never), JSON.stringify(bad)).rejects.toMatchObject({ status: 400 })
    }
    expect((await api.preferences.get()).defaultLevel).toBe('mentions')
  })

  it('pausing and resuming: dndUntil is a time, null to resume', async () => {
    const until = new Date(Date.now() + 3_600_000).toISOString()
    expect((await api.preferences.update({ dndUntil: until })).dndUntil).toBe(until)
    expect((await api.preferences.update({ dndUntil: null })).dndUntil).toBeNull()
  })
})

describe('the default level (spec 6.11: per-channel levels override the global default)', () => {
  it('a channel follows my default until I pick a level in it; a DM stays All', async () => {
    expect(await channel('c-general')).toMatchObject({ notifyLevel: 'mentions', notifyLevelOwn: false })
    await api.preferences.update({ defaultLevel: 'all' })
    expect(await channel('c-general')).toMatchObject({ notifyLevel: 'all', notifyLevelOwn: false })
    expect((await channel('c-dm-1')).notifyLevel).toBe('all')
    await api.preferences.update({ defaultLevel: 'none' })
    expect((await channel('c-dm-1')).notifyLevel).toBe('all')
    await api.chat.setNotifyLevel('c-general', 'mentions')
    expect(await channel('c-general')).toMatchObject({ notifyLevel: 'mentions', notifyLevelOwn: true })
    expect((await channel('c-backend')).notifyLevel).toBe('none')
  })

  it('a default of Nothing keeps those channels out of Activity and the bell, as a channel set to Nothing does', async () => {
    db.actAs('u-2')
    await api.chat.send('c-general', 'hi @[Youssef Abdelrahman](u-1)')
    db.actAs('u-1')
    expect((await api.mentions.mine()).some((m) => m.channelId === 'c-general')).toBe(true)
    await api.preferences.update({ defaultLevel: 'none' })
    expect((await api.mentions.mine()).some((m) => m.channelId === 'c-general')).toBe(false)
  })
})

describe('keywords count like mentions (spec 6.11 “Mentions and keywords”)', () => {
  const post = async (as: string, channelId: string, text: string) => {
    db.actAs(as)
    const m = await api.chat.send(channelId, text)
    db.actAs('u-1')
    return m
  }
  it('someone else’s message or reply with my keyword shows in the bell and Activity, saying which keyword', async () => {
    await api.preferences.update({ keywords: ['deploy', 'page size'] })
    const m = await post('u-2', 'c-backend', 'Deploys go out tonight')
    db.actAs('u-2')
    const r = await api.chat.reply(m.id, 'and the PAGE SIZE fix')
    db.actAs('u-1')
    const mine = await api.mentions.mine()
    expect(mine.find((i) => i.id === m.id)).toMatchObject({ channelId: 'c-backend', keyword: 'deploy', read: false })
    expect(mine.find((i) => i.id === r.id)).toMatchObject({ source: 'reply', keyword: 'page size' })
    expect((await api.inbox.list('ws-eng')).find((i) => i.id === m.id)).toMatchObject({ kind: 'mention', keyword: 'deploy' })
    await api.mentions.markRead([m.id])
    expect((await api.mentions.mine()).find((i) => i.id === m.id)?.read).toBe(true)
  })

  it('not my own words, not where I’m not a member, not a channel set to Nothing; a mention of me counts once', async () => {
    await api.preferences.update({ keywords: ['zebrafish'] })
    const own = await post('u-1', 'c-backend', 'zebrafish mine')
    await db.update((d) => {
      d.channels.find((c) => c.id === 'c-general')!.memberIds = ['u-2']
    })
    const notMember = await post('u-2', 'c-general', 'zebrafish elsewhere')
    const named = await post('u-2', 'c-backend', 'zebrafish @[Youssef Abdelrahman](u-1)')
    const ids = (await api.mentions.mine()).map((i) => i.id)
    expect(ids).not.toContain(own.id)
    expect(ids).not.toContain(notMember.id)
    expect(ids.filter((id) => id === named.id)).toHaveLength(1)
    expect((await api.mentions.mine()).find((i) => i.id === named.id)?.keyword).toBeNull()
    await api.chat.setNotifyLevel('c-backend', 'none')
    const quiet = await post('u-2', 'c-backend', 'zebrafish quiet')
    expect((await api.mentions.mine()).map((i) => i.id)).not.toContain(quiet.id)
  })

  it('not in a muted channel, where a mention of me still counts', async () => {
    await api.preferences.update({ keywords: ['zebrafish'] })
    await api.chat.setMuted('c-backend', true)
    const word = await post('u-2', 'c-backend', 'zebrafish muted')
    const named = await post('u-2', 'c-backend', 'look @[Youssef Abdelrahman](u-1)')
    const ids = (await api.mentions.mine()).map((i) => i.id)
    expect(ids).not.toContain(word.id)
    expect(ids).toContain(named.id)
  })

  it('a keyword counts from when I add it: older messages with it don’t come back as mentions', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-10-30T10:00:00Z'))
      const before = await post('u-2', 'c-backend', 'zebrafish before')
      vi.setSystemTime(new Date('2026-10-30T11:00:00Z'))
      await api.preferences.update({ keywords: ['zebrafish'] })
      vi.setSystemTime(new Date('2026-10-30T12:00:00Z'))
      const after = await post('u-2', 'c-backend', 'zebrafish after')
      // Writing it another way, or adding another keyword, keeps its time; taking it off and adding it again starts over.
      await api.preferences.update({ keywords: ['Zebrafish', 'okapi'] })
      let ids = (await api.mentions.mine()).map((i) => i.id)
      expect(ids).toContain(after.id)
      expect(ids).not.toContain(before.id)
      await api.preferences.update({ keywords: ['okapi'] })
      vi.setSystemTime(new Date('2026-10-30T13:00:00Z'))
      await api.preferences.update({ keywords: ['okapi', 'zebrafish'] })
      ids = (await api.mentions.mine()).map((i) => i.id)
      expect(ids).not.toContain(after.id)
      expect((await api.preferences.get()).keywords).toEqual(['okapi', 'zebrafish'])
    } finally {
      vi.useRealTimers()
    }
  })
})
