import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api, ThreadCard } from '@/api/types'
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
  hub = createMockHub(`test-threads-${Math.random()}`, null)
  db = createDb(createMemoryStore(), seed)
  api = createMockApi(db, hub)
  // Start from no threads, so each test sees only its own.
  await db.update((d) => {
    d.replies = []
    for (const m of d.messages) Object.assign(m, { threadCount: 0, lastReplyAt: null })
    d.notifications = []
    d.threadFollows = []
  })
})
afterEach(() => hub.close())

/** u-1 (me) posts in #backend; someone replies as `who`. */
async function thread(text: string, replies: [who: string, text: string][], channelId = 'c-backend', author = 'u-1') {
  db.actAs(author)
  const root = await api.chat.send(channelId, text)
  for (const [who, reply] of replies) {
    db.actAs(who)
    await api.chat.reply(root.id, reply)
  }
  db.actAs('u-1')
  return root
}
const all = async (): Promise<ThreadCard[]> => {
  const out: ThreadCard[] = []
  let cursor: string | undefined
  do {
    const page = await api.threads.list('ws-eng', cursor)
    out.push(...page.items)
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  return out
}

describe('threads.list (spec 6.12 Threads)', () => {
  it('lists threads I follow, unread first, then the rest, newest reply first', async () => {
    const readOne = await thread('old read', [['u-2', 'one']])
    await api.threads.markRead('ws-eng', [readOne.id])
    const older = await thread('older unread', [['u-2', 'a']])
    const newer = await thread('newer unread', [['u-5', 'b']])
    const recentRead = await thread('recent read', [['u-2', 'c']])
    await api.threads.markRead('ws-eng', [recentRead.id])
    const page = await api.threads.list('ws-eng')
    expect(page.items.map((t) => t.root.id)).toEqual([newer.id, older.id, recentRead.id, readOne.id])
    expect(page.unreadThreads).toBe(2)
    expect(page.items.map((t) => t.unreadCount)).toEqual([1, 1, 0, 0])
  })

  it('only threads I follow: not one I never joined, and not one I unfollowed', async () => {
    const theirs = await thread('not mine', [['u-5', 'x']], 'c-backend', 'u-2')
    const left = await thread('mine, left', [['u-2', 'y']])
    await api.chat.setFollowing(left.id, false)
    const joined = await thread('theirs, I replied', [['u-1', 'me too'], ['u-5', 'z']], 'c-backend', 'u-2')
    const ids = (await all()).map((t) => t.root.id)
    expect(ids).toContain(joined.id)
    expect(ids).not.toContain(theirs.id)
    expect(ids).not.toContain(left.id)
  })

  it('a message without replies is no thread; a channel I can no longer read drops out', async () => {
    await thread('no replies', [])
    const backend = await thread('in backend', [['u-2', 'r']])
    expect((await all()).map((t) => t.root.id)).toEqual([backend.id])
    await api.chat.leave('c-backend')
    expect(await all()).toEqual([])
  })

  it('shows the unread replies, at least 2 and at most 10, oldest first, with the total and the people', async () => {
    const root = await thread('busy', Array.from({ length: 14 }, (_, i) => [i % 2 ? 'u-2' : 'u-5', `r${i + 1}`] as [string, string]))
    const [card] = await all()
    expect(card.root.id).toBe(root.id)
    expect(card.totalReplies).toBe(14)
    expect(card.unreadCount).toBe(14)
    expect(card.replies.map((r) => r.content)).toEqual(Array.from({ length: 10 }, (_, i) => `r${i + 5}`))
    expect(card.participantIds).toEqual(['u-2', 'u-5', 'u-1'])
    await api.threads.markRead('ws-eng', [root.id])
    const [read] = await all()
    expect(read.unreadCount).toBe(0)
    expect(read.replies.map((r) => r.content)).toEqual(['r13', 'r14'])
  })

  it('my own replies are never unread', async () => {
    await thread('mine', [['u-1', 'self']])
    const [card] = await all()
    expect(card.unreadCount).toBe(0)
  })

  it('a reply that mentions me counts once, and reading the thread reads that mention too (bell and Activity)', async () => {
    const root = await thread('ask', [['u-2', 'hey @[Youssef Abdelrahman](u-1)']])
    expect((await all())[0].unreadCount).toBe(1)
    await api.threads.markRead('ws-eng', [root.id])
    expect((await api.mentions.mine()).find((m) => m.messageId === root.id)?.read).toBe(true)
    expect((await api.inbox.list('ws-eng')).filter((a) => a.messageId === root.id).every((a) => a.read)).toBe(true)
  })

  it('reading it in Activity reads it here', async () => {
    const root = await thread('ask', [['u-2', 'one'], ['u-5', 'two']])
    expect((await all())[0].unreadCount).toBe(2)
    await api.inbox.markRead('ws-eng')
    expect((await all())[0].unreadCount).toBe(0)
    void root
  })

  it('a deleted parent stays while it has replies; the parent row reads as deleted', async () => {
    const root = await thread('gone', [['u-2', 'still here']])
    await api.chat.remove({ kind: 'message', id: root.id })
    const [card] = await all()
    expect(card.root.deletedAt).toBeTruthy()
    expect(card.replies.map((r) => r.content)).toEqual(['still here'])
  })

  it('pages by 20', async () => {
    for (let i = 0; i < 23; i++) await thread(`t${i}`, [['u-2', 'r']])
    const first = await api.threads.list('ws-eng')
    expect(first.items).toHaveLength(20)
    expect(first.nextCursor).toBeTruthy()
    const second = await api.threads.list('ws-eng', first.nextCursor!)
    expect(second.items).toHaveLength(3)
    expect(second.nextCursor).toBeNull()
    expect(new Set([...first.items, ...second.items].map((t) => t.root.id)).size).toBe(23)
  })

  it('only this workspace’s threads', async () => {
    await thread('eng', [['u-2', 'r']])
    expect((await api.threads.list('ws-design')).items).toEqual([])
  })
})

describe('threads.list: the edges (slice U review)', () => {
  it('a thread in a DM is listed; a reply also sent to the channel is no thread of its own', async () => {
    const dm = await thread('in a DM', [['u-2', 'dm reply']], 'c-dm-1')
    const root = await thread('root', [])
    db.actAs('u-2')
    await api.chat.reply(root.id, 'also here', undefined, true)
    db.actAs('u-1')
    const ids = (await all()).map((t) => t.root.id)
    expect(ids.sort()).toEqual([dm.id, root.id].sort())
  })

  it('a channel set to Nothing counts nothing unread, as Activity and the bell show nothing from it', async () => {
    await thread('quiet', [['u-2', 'shh']])
    await api.chat.setNotifyLevel('c-backend', 'none')
    const page = await api.threads.list('ws-eng')
    expect(page.items[0].unreadCount).toBe(0)
    expect(page.unreadThreads).toBe(0)
  })
})

describe('Activity’s Mark all read clears Threads, however many items there are', () => {
  it('marks past the 100 items Activity lists', async () => {
    const root = await thread('busy', Array.from({ length: 105 }, (_, i) => ['u-2', `r${i}`] as [string, string]))
    expect((await all())[0].unreadCount).toBe(105)
    await api.inbox.markRead('ws-eng')
    expect((await all())[0].unreadCount).toBe(0)
    void root
  })
})

describe('threads.markRead', () => {
  it('says so live, and ignores roots I can’t read', async () => {
    const root = await thread('x', [['u-2', 'r']])
    const events: string[] = []
    const off = hub.subscribe((e) => events.push(e.type))
    await api.threads.markRead('ws-eng', [root.id, 'm-nope'])
    off()
    expect(events).toContain('readChanged')
  })
})
