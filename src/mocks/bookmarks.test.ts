import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
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
let n = 0

beforeEach(() => {
  latency.min = latency.max = 0
  db = createDb(createMemoryStore(), seed)
  hub = createMockHub(`test-bookmarks-${++n}`, null)
  api = createMockApi(db, hub)
  events = []
  hub.subscribe((e) => events.push(e))
})
afterEach(() => hub.close())

describe('bookmarks (spec 6.1 tabs row +, §7 Bookmark)', () => {
  it('adds a link in order, named or after its address; renames and removes it', async () => {
    const runbook = await api.bookmarks.add('c-backend', { title: ' Runbook ', url: 'https://wiki.spark-sys.com/runbook' })
    await api.bookmarks.add('c-backend', { title: '', url: 'grafana.spark-sys.com/d/api' })
    expect((await api.bookmarks.list('c-backend')).map((b) => [b.title, b.url])).toEqual([
      ['Runbook', 'https://wiki.spark-sys.com/runbook'],
      ['grafana.spark-sys.com', 'https://grafana.spark-sys.com/d/api'],
    ])
    expect(events).toContainEqual({ type: 'channelChanged', channelId: 'c-backend' })
    await api.bookmarks.update(runbook.id, { title: 'On-call runbook' })
    expect((await api.bookmarks.list('c-backend'))[0].title).toBe('On-call runbook')
    await api.bookmarks.remove(runbook.id)
    expect((await api.bookmarks.list('c-backend')).map((b) => b.title)).toEqual(['grafana.spark-sys.com'])
  })

  it('the same address twice in one channel is refused (polish pass)', async () => {
    await api.bookmarks.add('c-backend', { title: 'Runbook', url: 'https://wiki.spark-sys.com/runbook' })
    await expect(api.bookmarks.add('c-backend', { title: 'Again', url: 'https://wiki.spark-sys.com/runbook' })).rejects.toMatchObject({
      status: 409, detail: 'That link is already a bookmark here.',
    })
    expect((await api.bookmarks.add('c-general', { title: 'Runbook', url: 'https://wiki.spark-sys.com/runbook' })).channelId).toBe('c-general')
  })

  it('only http and https links, never javascript: or data:', async () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://x.y', '', 'not a link']) {
      await expect(api.bookmarks.add('c-backend', { title: 'x', url }), url).rejects.toMatchObject({ status: 400, detail: 'Use a web address (https://…).' })
    }
  })

  it('whoever may post adds and changes them; a private channel I’m not in is closed', async () => {
    await api.users.viewAs('u-3')
    await expect(api.bookmarks.list('c-release')).rejects.toMatchObject({ status: 403 })
    await expect(api.bookmarks.add('c-release', { title: 'x', url: 'https://x.y' })).rejects.toMatchObject({ status: 403 })
  })
})
