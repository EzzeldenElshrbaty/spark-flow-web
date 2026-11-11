import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
import type { Inline } from '@/lib/messageBody'
import type { PageBody } from '@/lib/pageBody'
import type { RealtimeEvent } from '@/lib/realtime'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

let db: MockDb
let hub: MockHub
let api: Api
let events: RealtimeEvent[]
let now: Date
let n = 0
const later = (ms: number) => {
  now = new Date(now.getTime() + ms)
}
const MINUTE = 60_000

const text = (t: string): PageBody => [{ type: 'p', children: [{ type: 'text', text: t }] }]
const person = (id: string, name = id): Inline => ({ type: 'user', id, name })
const asNour = () => api.users.viewAs('u-2')
const asYoussef = () => api.users.viewAs('u-1')
const pageEvents = () => events.filter((e) => e.type === 'pageSaved' || e.type === 'pageEditing')

beforeEach(() => {
  latency.min = latency.max = 0
  now = new Date('2026-11-10T09:00:00.000Z')
  db = createDb(createMemoryStore(), seed)
  hub = createMockHub(`test-pages-${++n}`, null)
  api = createMockApi(db, hub, () => now)
  events = []
  hub.subscribe((e) => events.push(e))
})
afterEach(() => hub.close())

describe('reading a page (chat spec 6.14)', () => {
  it('a channel without a page reads as version 0, empty', async () => {
    expect(await api.pages.get('c-general')).toEqual({ channelId: 'c-general', body: [], version: 0, updatedAt: null, updatedBy: null, editors: [], editing: null })
    expect(await api.pages.history('c-general')).toEqual([])
    expect((await db.read()).pages).toEqual([]) // reading makes no record
  })

  it('a private channel I’m not in is closed', async () => {
    await api.users.viewAs('u-3')
    await expect(api.pages.get('c-release')).rejects.toMatchObject({ status: 403 })
    await expect(api.pages.history('c-release')).rejects.toMatchObject({ status: 403 })
    await expect(api.pages.get('c-nope')).rejects.toMatchObject({ status: 404 })
  })
})

describe('who may edit', () => {
  it('a reader who can’t post can read but not save', async () => {
    await api.chat.updateChannel('c-general', { whoCanPost: 'admins' })
    await api.pages.save('c-general', { body: text('Hello'), baseVersion: 0 })
    await api.users.viewAs('u-3')
    expect((await api.pages.get('c-general')).body).toEqual(text('Hello'))
    await expect(api.pages.save('c-general', { body: text('Mine'), baseVersion: 1 })).rejects.toMatchObject({ status: 403 })
    await expect(api.pages.editing('c-general')).rejects.toMatchObject({ status: 403 })
  })

  it('an archived channel refuses with its sentence', async () => {
    await api.chat.archiveChannel('c-backend')
    await expect(api.pages.save('c-backend', { body: text('Hi'), baseVersion: 0 })).rejects.toMatchObject({ status: 400, detail: 'This channel is archived.' })
  })
})

describe('saving', () => {
  it('save writes version + 1 and publishes pageSaved', async () => {
    const view = await api.pages.save('c-general', { body: text('Launch plan'), baseVersion: 0 })
    expect(view).toMatchObject({ channelId: 'c-general', body: text('Launch plan'), version: 1, updatedAt: now.toISOString(), updatedBy: 'u-1', editors: ['u-1'] })
    expect(view.editing).toEqual({ userId: 'u-1', until: new Date(now.getTime() + MINUTE).toISOString() })
    expect(events).toContainEqual({ type: 'pageSaved', channelId: 'c-general', version: 1, userId: 'u-1' })
    expect((await api.pages.get('c-general')).version).toBe(1)
  })

  it('a stale baseVersion is refused with who saved', async () => {
    await asNour()
    await api.pages.save('c-general', { body: text('Nour’s plan'), baseVersion: 0 })
    later(MINUTE + 1)
    await asYoussef()
    await expect(api.pages.save('c-general', { body: text('Mine'), baseVersion: 0 })).rejects.toMatchObject({
      status: 409, detail: 'Nour El-Sayed saved changes before you. Your last changes aren’t saved.',
    })
    expect((await api.pages.get('c-general')).body).toEqual(text('Nour’s plan'))
  })

  it('my own stale tab hears about another tab', async () => {
    await api.pages.save('c-general', { body: text('From tab A'), baseVersion: 0 })
    await expect(api.pages.save('c-general', { body: text('From tab B'), baseVersion: 0 })).rejects.toMatchObject({
      status: 409, detail: 'You changed this page in another tab. Your last changes here aren’t saved.',
    })
  })

  it('a page that’s too long, or holds @channel, is refused with its sentence', async () => {
    await expect(api.pages.save('c-general', { body: text('x'.repeat(50_001)), baseVersion: 0 })).rejects.toMatchObject({ status: 400, detail: 'This page is too long. Shorten it to save.' })
    await expect(api.pages.save('c-general', { body: [{ type: 'p', children: [{ type: 'all' }] }], baseVersion: 0 })).rejects.toMatchObject({
      status: 400, detail: 'Something on this page can’t be saved.',
    })
    expect((await db.read()).pages).toEqual([])
  })

  it('the same body again saves no new version', async () => {
    await api.pages.save('c-general', { body: text('Same'), baseVersion: 0 })
    events = []
    const view = await api.pages.save('c-general', { body: text('Same'), baseVersion: 1 })
    expect(view.version).toBe(1)
    expect(await api.pages.history('c-general')).toHaveLength(1)
    // No pageSaved; it renews my hold, which readers hear (final review).
    expect(pageEvents()).toEqual([{ type: 'pageEditing', channelId: 'c-general', userId: 'u-1', until: view.editing!.until }])
  })

  it('editors lists distinct savers, newest first', async () => {
    await api.pages.save('c-general', { body: text('1'), baseVersion: 0 })
    later(MINUTE + 1)
    await asNour()
    await api.pages.save('c-general', { body: text('2'), baseVersion: 1 })
    later(MINUTE + 1)
    await asYoussef()
    const view = await api.pages.save('c-general', { body: text('3'), baseVersion: 2 })
    expect(view.editors).toEqual(['u-1', 'u-2'])
  })
})

describe('one editor at a time', () => {
  it('typing claims the page for 60 s; others are refused while it holds', async () => {
    await asNour()
    const until = new Date(now.getTime() + MINUTE).toISOString()
    expect(await api.pages.editing('c-general')).toEqual({ editing: { userId: 'u-2', until } })
    expect(events).toContainEqual({ type: 'pageEditing', channelId: 'c-general', userId: 'u-2', until })
    await asYoussef()
    await expect(api.pages.save('c-general', { body: text('Mine'), baseVersion: 0 })).rejects.toMatchObject({
      status: 409, detail: 'Nour El-Sayed started editing first. Your last changes aren’t saved.',
    })
    expect(await api.pages.editing('c-general')).toEqual({ editing: { userId: 'u-2', until } })
    expect((await api.pages.get('c-general')).editing).toEqual({ userId: 'u-2', until })
    later(MINUTE + 1)
    expect((await api.pages.get('c-general')).editing).toBeNull()
    expect((await api.pages.save('c-general', { body: text('Mine'), baseVersion: 0 })).version).toBe(1)
  })

  it('each renewal publishes the hold again, so readers hear it go on (polish pass)', async () => {
    await asNour()
    await api.pages.editing('c-general')
    later(5_000)
    events = []
    await api.pages.editing('c-general')
    const until = new Date(now.getTime() + MINUTE).toISOString()
    expect(pageEvents()).toEqual([{ type: 'pageEditing', channelId: 'c-general', userId: 'u-2', until }])
  })

  it('stopEditing lets the page go at once', async () => {
    await asNour()
    await api.pages.editing('c-general')
    await api.pages.stopEditing('c-general')
    expect(events).toContainEqual({ type: 'pageEditing', channelId: 'c-general', userId: null, until: null })
    await asYoussef()
    expect((await api.pages.save('c-general', { body: text('Mine'), baseVersion: 0 })).version).toBe(1)
  })

  it('stopEditing by someone who doesn’t hold the page changes nothing', async () => {
    await asNour()
    await api.pages.editing('c-general')
    await asYoussef()
    events = []
    await api.pages.stopEditing('c-general')
    expect(pageEvents()).toEqual([])
    expect((await api.pages.get('c-general')).editing?.userId).toBe('u-2')
  })
})

describe('history and restore', () => {
  it('saves in one 10-minute run are one version; another person or a later save starts a new one', async () => {
    await api.pages.save('c-general', { body: text('1'), baseVersion: 0 })
    later(5 * MINUTE)
    await api.pages.save('c-general', { body: text('2'), baseVersion: 1 })
    expect(await api.pages.history('c-general')).toEqual([expect.objectContaining({ version: 2, savedBy: 'u-1', savedAt: now.toISOString() })])
    later(MINUTE + 1)
    await asNour()
    await api.pages.save('c-general', { body: text('3'), baseVersion: 2 })
    later(11 * MINUTE)
    await api.pages.save('c-general', { body: text('4'), baseVersion: 3 })
    expect((await api.pages.history('c-general')).map((v) => [v.version, v.savedBy])).toEqual([[4, 'u-2'], [3, 'u-2'], [2, 'u-1']])
  })

  it('keeps the newest 100 versions', async () => {
    for (let v = 0; v < 101; v++) {
      await api.pages.save('c-general', { body: text(`Run ${v + 1}`), baseVersion: v })
      later(11 * MINUTE)
    }
    const history = await api.pages.history('c-general')
    expect(history).toHaveLength(100)
    expect(history[0].version).toBe(101)
    expect(history.at(-1)!.version).toBe(2)
  })

  it('a version reads its body', async () => {
    await api.pages.save('c-general', { body: text('Old'), baseVersion: 0 })
    const [summary] = await api.pages.history('c-general')
    expect(await api.pages.version('c-general', summary.id)).toEqual({ ...summary, body: text('Old') })
    await expect(api.pages.version('c-general', 'v-nope')).rejects.toMatchObject({ status: 404 })
  })

  it('restore saves the old body as a new version and keeps the newer ones', async () => {
    await api.pages.save('c-general', { body: text('First'), baseVersion: 0 })
    later(11 * MINUTE)
    await api.pages.save('c-general', { body: text('Second'), baseVersion: 1 })
    const first = (await api.pages.history('c-general')).find((v) => v.version === 1)!
    const view = await api.pages.restore('c-general', { versionId: first.id, baseVersion: 2 })
    expect(view).toMatchObject({ version: 3, body: text('First') })
    expect((await api.pages.history('c-general')).map((v) => v.version)).toEqual([3, 2, 1])
    expect(events).toContainEqual({ type: 'pageSaved', channelId: 'c-general', version: 3, userId: 'u-1' })
  })

  it('restore while someone else holds the page is refused', async () => {
    await api.pages.save('c-general', { body: text('First'), baseVersion: 0 })
    const [first] = await api.pages.history('c-general')
    later(MINUTE + 1)
    await asNour()
    await api.pages.editing('c-general')
    await asYoussef()
    await expect(api.pages.restore('c-general', { versionId: first.id, baseVersion: 1 })).rejects.toMatchObject({
      status: 409, detail: 'Nour El-Sayed is editing. Try again when they’re done.',
    })
  })
})

describe('mentions on a page', () => {
  it('new mentions are stored for readable, active, other people only', async () => {
    await api.users.deactivate('u-5', 'Left the company')
    events = []
    const body: PageBody = [
      { type: 'h2', children: [{ type: 'text', text: 'Owners' }] },
      { type: 'p', children: [person('u-2', 'Nour El-Sayed'), { type: 'text', text: ' runs QA. ' }, person('u-1'), person('u-5'), person('u-3')] },
    ]
    await api.pages.save('c-release', { body, baseVersion: 0 })
    const stored = (await db.read()).pageMentions
    expect(stored).toEqual([
      expect.objectContaining({ channelId: 'c-release', workspaceId: 'ws-eng', userId: 'u-2', authorId: 'u-1', excerpt: '@Nour El-Sayed runs QA. @u-1@u-5@u-3', createdAt: now.toISOString() }),
    ])
    expect(events.filter((e) => e.type === 'notificationCreated')).toEqual([{ type: 'notificationCreated', userId: 'u-2' }])
    later(MINUTE)
    await api.pages.save('c-release', { body: [...body, { type: 'p', children: [{ type: 'text', text: 'More' }] }], baseVersion: 1 })
    expect((await db.read()).pageMentions).toHaveLength(1)
  })

  it('an excerpt is cut to 120 characters', async () => {
    await api.pages.save('c-general', { body: [{ type: 'p', children: [person('u-2', 'Nour'), { type: 'text', text: ' ' + 'x'.repeat(200) }] }], baseVersion: 0 })
    expect((await db.read()).pageMentions[0].excerpt).toHaveLength(120)
  })
})
