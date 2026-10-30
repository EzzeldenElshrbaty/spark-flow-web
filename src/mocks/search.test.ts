import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api, MessageHit, SearchHit, SearchRequest } from '@/api/types'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

let db: MockDb
let api: Api
let hub: MockHub

beforeEach(async () => {
  latency.min = latency.max = 0
  hub = createMockHub(`test-search-${Math.random()}`, null)
  db = createDb(createMemoryStore(), seed)
  api = createMockApi(db, hub)
  // A private channel I'm not in, with a message only its members may find.
  await db.update((d) => {
    d.channels.push({ ...d.channels.find((c) => c.id === 'c-backend')!, id: 'c-secret', name: 'secret', isPrivate: true, memberIds: ['u-2'] })
  })
})
afterEach(() => hub.close())

const req = (q: string, over: Partial<SearchRequest> = {}): SearchRequest => ({ q, tab: 'messages', sort: 'relevant', from: [], in: null, has: null, thread: false, after: null, before: null, tz: 'UTC', ...over })
const run = (q: string, over: Partial<SearchRequest> = {}) => api.search.run('ws-eng', req(q, over))
const texts = (items: SearchHit[]) => items.map((i) => (i as MessageHit).text)
async function post(channelId: string, text: string, as = 'u-1') {
  db.actAs(as)
  const m = await api.chat.send(channelId, text)
  db.actAs('u-1')
  return m
}

describe('search.run: messages (spec 6.12, §9 access)', () => {
  it('finds messages and replies by words at word starts, any case', async () => {
    const root = await post('c-backend', 'Zebrafish deploys tonight')
    db.actAs('u-2')
    const reply = await api.chat.reply(root.id, 'zebrafish ready')
    db.actAs('u-1')
    const found = await run('ZEBRAFISH')
    expect(found.items.map((i) => (i as MessageHit).target)).toEqual(
      expect.arrayContaining([
        { kind: 'message', id: root.id },
        { kind: 'reply', id: reply.id },
      ]),
    )
    expect(found.items.find((i) => (i as MessageHit).target.kind === 'reply')).toMatchObject({ rootId: root.id, channelId: 'c-backend', senderId: 'u-2' })
    expect(found.counts.messages).toBe(2)
    expect((await run('ebrafish')).items).toEqual([])
  })

  it('never shows a private channel I’m not in, or someone else’s DM; public channels I haven’t joined are searched', async () => {
    await post('c-secret', 'zebrafish secret', 'u-2')
    await db.update((d) => {
      d.channels.find((c) => c.id === 'c-backend')!.memberIds = ['u-2']
    })
    await post('c-backend', 'zebrafish public', 'u-2')
    expect(texts((await run('zebrafish')).items)).toEqual(['zebrafish public'])
    await db.update((d) => {
      d.channels.find((c) => c.id === 'c-secret')!.memberIds = ['u-2', 'u-1']
    })
    expect(texts((await run('zebrafish')).items).sort()).toEqual(['zebrafish public', 'zebrafish secret'])
  })

  it('leaves out deleted messages, system lines and a reply’s channel copy (it counts once)', async () => {
    const gone = await post('c-backend', 'zebrafish gone')
    await api.chat.remove({ kind: 'message', id: gone.id })
    const root = await post('c-backend', 'root')
    db.actAs('u-2')
    await api.chat.reply(root.id, 'zebrafish broadcast', undefined, true)
    db.actAs('u-1')
    await api.chat.updateChannel('c-backend', { topic: 'zebrafish topic' })
    expect(texts((await run('zebrafish')).items)).toEqual(['zebrafish broadcast'])
  })

  it('a phrase matches as written; every word must be there', async () => {
    await post('c-backend', 'zebrafish page size 100')
    await post('c-backend', 'zebrafish size of page')
    expect(texts((await run('zebrafish "page size"')).items)).toEqual(['zebrafish page size 100'])
    expect(texts((await run('zebrafish page size')).items)).toHaveLength(2)
  })

  it('filters: from, in, has, is:thread, after and before', async () => {
    const a = await post('c-backend', 'zebrafish with link https://example.com/x', 'u-2')
    await post('c-general', 'zebrafish in general')
    const threaded = await post('c-backend', 'zebrafish threaded')
    db.actAs('u-2')
    await api.chat.reply(threaded.id, 'zebrafish answer')
    db.actAs('u-1')
    await api.chat.react({ kind: 'message', id: threaded.id }, '👍', true)
    await api.pins.pin(a.id)
    expect(texts((await run('zebrafish', { from: ['u-2'] })).items).sort()).toEqual(['zebrafish answer', 'zebrafish with link https://example.com/x'])
    expect(texts((await run('zebrafish', { in: 'c-general' })).items)).toEqual(['zebrafish in general'])
    expect(texts((await run('zebrafish', { has: 'link' })).items)).toEqual(['zebrafish with link https://example.com/x'])
    expect(texts((await run('zebrafish', { has: 'pin' })).items)).toEqual(['zebrafish with link https://example.com/x'])
    expect(texts((await run('zebrafish', { has: 'reaction' })).items)).toEqual(['zebrafish threaded'])
    expect(texts((await run('zebrafish', { thread: true })).items).sort()).toEqual(['zebrafish answer', 'zebrafish threaded'])
    const today = new Date().toISOString().slice(0, 10)
    expect((await run('zebrafish', { after: today })).items).toHaveLength(4)
    expect((await run('zebrafish', { before: today })).items).toHaveLength(0)
  })

  it('a query of filters alone lists those messages; an empty query finds nothing', async () => {
    await post('c-secret', 'x', 'u-2')
    expect((await run('', { from: ['u-2'], in: 'c-backend' })).items.length).toBeGreaterThan(0)
    expect(await run('')).toMatchObject({ items: [], counts: { messages: 0, files: 0, tasks: 0, channels: 0, people: 0 } })
  })

  it('Most relevant puts more matches first; Newest the latest', async () => {
    const once = await post('c-backend', 'zebrafish once')
    await post('c-backend', 'zebrafish zebrafish twice')
    expect(texts((await run('zebrafish')).items)[0]).toBe('zebrafish zebrafish twice')
    await db.update((d) => {
      d.messages.find((m) => m.id === once.id)!.createdAt = '2099-01-01T00:00:00.000Z'
    })
    expect(texts((await run('zebrafish', { sort: 'newest' })).items)[0]).toBe('zebrafish once')
  })

  it('pages by 20', async () => {
    for (let i = 0; i < 23; i++) await post('c-backend', `zebrafish ${i}`)
    const first = await run('zebrafish')
    expect(first.items).toHaveLength(20)
    expect(first.counts.messages).toBe(23)
    const second = await run('zebrafish', { cursor: first.nextCursor! })
    expect(second.items).toHaveLength(3)
    expect(second.nextCursor).toBeNull()
  })
})

describe('search.run: the other tabs', () => {
  it('files by title, where I may read them', async () => {
    const file = await api.files.uploadForChat('c-backend', new File(['x'], 'zebrafish-plan.pdf', { type: 'application/pdf' }))
    await api.chat.send('c-backend', '', undefined, undefined, [file.id])
    const found = await run('zebrafish', { tab: 'files' })
    expect(found.counts.files).toBe(1)
    expect(found.items[0]).toMatchObject({ kind: 'file', channelId: 'c-backend', senderId: 'u-1', file: { id: file.id } })
  })

  it('tasks by key or title, channels by name or topic, people by name or title; each counted', async () => {
    const tasks = await run('NEX-103', { tab: 'tasks' })
    expect(tasks.items[0]).toMatchObject({ kind: 'task', task: { key: 'NEX-103', projectKey: 'NEX' } })
    const channels = await run('backend', { tab: 'channels' })
    expect(channels.items.map((i) => (i.kind === 'channel' ? i.channel.id : ''))).toContain('c-backend')
    expect((await run('secret', { tab: 'channels' })).items).toEqual([])
    const people = await run('nour', { tab: 'people' })
    expect(people.items[0]).toMatchObject({ kind: 'person', user: { id: 'u-2' } })
    expect(people.counts.people).toBe(1)
  })

  it('channels, tasks and people go by the words only, and need some', async () => {
    expect((await run('', { tab: 'people', from: ['u-2'] })).items).toEqual([])
  })
})
