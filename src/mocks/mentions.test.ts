import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
import { createDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

let api: Api
let hub: MockHub

beforeEach(() => {
  latency.min = latency.max = 0
  hub = createMockHub(`test-mentions-${Math.random()}`, null)
  api = createMockApi(createDb(createMemoryStore(), seed), hub)
})
afterEach(() => hub.close())

const as = (userId: string) => api.users.viewAs(userId)

describe('mentions', () => {
  it('mine lists mentions of me, newest first, without my own', async () => {
    const sent = await api.chat.send('c-general', 'Ping @[Nour](u-2)')
    await as('u-2')
    const [first] = await api.mentions.mine()
    expect(first).toMatchObject({ id: sent.id, source: 'message', authorId: 'u-1', excerpt: 'Ping @Nour', read: false, channelId: 'c-general', messageId: sent.id })
    await as('u-1')
    expect((await api.mentions.mine()).some((m) => m.id === sent.id)).toBe(false)
  })

  it('@all notifies channel members; a comment notifies the project people', async () => {
    const sent = await api.chat.send('c-backend', 'Deploy at 5 @all')
    await as('u-2')
    expect((await api.mentions.mine()).some((m) => m.id === sent.id)).toBe(true)
    await as('u-8') // not in #backend
    expect((await api.mentions.mine()).some((m) => m.id === sent.id)).toBe(false)

    await as('u-4') // Ahmed manages Mobile App
    const comment = await api.comments.create({ taskKey: 'MOB-104', kind: 'comment', body: '@all please test', files: [] })
    await as('u-5') // on Mobile App
    const forSalma = (await api.mentions.mine()).filter((m) => m.id === comment.id || m.excerpt.includes('please test'))
    expect(forSalma).toEqual([expect.objectContaining({ id: comment.id, source: 'comment', taskKey: 'MOB-104', projectId: 'p-mob', channelId: null })])
    await as('u-3') // not on Mobile App
    expect((await api.mentions.mine()).some((m) => m.excerpt.includes('please test'))).toBe(false)
  })

  it('one item per message even when mentioned twice', async () => {
    const sent = await api.chat.send('c-general', '@[Nour](u-2) and again @[Nour](u-2) @all')
    await as('u-2')
    expect((await api.mentions.mine()).filter((m) => m.id === sent.id)).toHaveLength(1)
  })

  it('replies count, with their thread', async () => {
    await as('u-3')
    const parent = (await api.chat.messages('c-general')).items[0]!
    const reply = await api.chat.reply(parent.id, 'cc @[Nour](u-2)')
    await as('u-2')
    expect((await api.mentions.mine())[0]).toMatchObject({ id: reply.id, source: 'reply', messageId: parent.id, channelId: 'c-general' })
  })

  it('markRead persists per person', async () => {
    const sent = await api.chat.send('c-backend', 'Standup moved @all')
    await as('u-2')
    await api.mentions.markRead([sent.id, sent.id])
    expect((await api.mentions.mine()).find((m) => m.id === sent.id)?.read).toBe(true)
    await as('u-6')
    expect((await api.mentions.mine()).find((m) => m.id === sent.id)?.read).toBe(false)
  })

  it('the seed starts with old mentions read', async () => {
    const dayAgo = Date.now() - 24 * 3_600_000
    for (const userId of ['u-1', 'u-2', 'u-3', 'u-5']) {
      await as(userId)
      const items = await api.mentions.mine()
      expect(items.filter((m) => new Date(m.createdAt).getTime() < dayAgo).every((m) => m.read)).toBe(true)
    }
  })

  it('the seed gives the demo people a few unread mentions from today', async () => {
    for (const userId of ['u-2', 'u-3', 'u-4']) {
      await as(userId)
      expect((await api.mentions.mine()).filter((m) => !m.read).length).toBeGreaterThan(0)
    }
  })

  it("a mention in a DM or private channel doesn't reach someone who isn't in it", async () => {
    const dm = await api.chat.send('c-dm-2', '@[Nour El-Sayed](u-2) is late again') // a DM between u-1 and u-3
    const release = await api.chat.send('c-release', 'Ask @[Mariam Fathy](u-3) about it') // private; Mariam isn't a member
    const inside = await api.chat.send('c-release', 'Ping @[Nour El-Sayed](u-2)') // Nour is a member
    await as('u-2')
    const nour = (await api.mentions.mine()).map((m) => m.id)
    expect(nour).not.toContain(dm.id)
    expect(nour).toContain(inside.id)
    await as('u-3')
    expect((await api.mentions.mine()).map((m) => m.id)).not.toContain(release.id)
  })

  it('an unknown person in a mention notifies nobody', async () => {
    const sent = await api.chat.send('c-general', 'Hi @[Ghost](u-nope)')
    for (const userId of ['u-2', 'u-3']) {
      await as(userId)
      expect((await api.mentions.mine()).some((m) => m.id === sent.id)).toBe(false)
    }
  })

  it('excerpts are cut to 120 characters', async () => {
    const sent = await api.chat.send('c-general', `@[Nour](u-2) ${'x'.repeat(200)}`)
    await as('u-2')
    const item = (await api.mentions.mine()).find((m) => m.id === sent.id)!
    expect(item.excerpt.length).toBe(120)
    expect(item.excerpt.endsWith('…')).toBe(true)
  })
})
