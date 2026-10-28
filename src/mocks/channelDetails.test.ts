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
  hub = createMockHub(`test-details-${++n}`, null)
  api = createMockApi(db, hub)
  events = []
  hub.subscribe((e) => events.push(e))
})
afterEach(() => hub.close())

const ops = () => api.chat.createChannel({ workspaceId: 'ws-eng', name: 'ops', topic: '', isPrivate: false, memberIds: [] })
const lastSystem = async (channelId: string) => (await api.chat.messages(channelId)).items.find((m) => m.system)?.system

describe('description and who can post (spec 6.10, §9)', () => {
  it('a channel starts with no description and everyone posting, a new one too', async () => {
    expect(await api.chat.channel('c-backend')).toMatchObject({ description: '', whoCanPost: 'everyone' })
    expect(await ops()).toMatchObject({ description: '', whoCanPost: 'everyone' })
  })

  it('its members and admins set the description, trimmed and checked like the topic', async () => {
    expect((await api.chat.updateChannel('c-backend', { description: '  API, queues and the database.  ' })).description).toBe('API, queues and the database.')
    await expect(api.chat.updateChannel('c-backend', { description: 'x'.repeat(251) })).rejects.toMatchObject({ status: 400, detail: 'Keep the description under 250 characters.' })
    await api.users.viewAs('u-3')
    await expect(api.chat.updateChannel('c-release', { description: 'Mine' })).rejects.toMatchObject({ status: 403 })
  })

  it('only an Admin chooses who can post, from Everyone or Only admins', async () => {
    expect((await api.chat.updateChannel('c-backend', { whoCanPost: 'admins' })).whoCanPost).toBe('admins')
    await expect(api.chat.updateChannel('c-backend', { whoCanPost: 'owners' as never })).rejects.toMatchObject({ status: 400, detail: 'Choose Everyone or Only admins.' })
    await api.users.viewAs('u-2')
    await expect(api.chat.updateChannel('c-backend', { whoCanPost: 'everyone' })).rejects.toMatchObject({ status: 403, detail: 'Only admins can change who can post.' })
    expect((await api.chat.updateChannel('c-backend', { topic: 'Still mine to change' })).topic).toBe('Still mine to change')
  })

  it('the details no longer carry the members: they change through their own routes', async () => {
    const channel = await api.chat.updateChannel('c-backend', { topic: 'x', memberIds: ['u-1'] } as never)
    expect(channel.memberIds).toEqual(['u-1', 'u-2', 'u-5', 'u-6'])
  })
})

describe('adding and removing people (spec 6.10)', () => {
  it('adds people once each and says so in the channel, live', async () => {
    const channel = await ops()
    events = []
    const after = await api.chat.addMembers(channel.id, ['u-2', 'u-3', 'u-2'])
    expect(after.memberIds).toEqual(['u-1', 'u-2', 'u-3'])
    expect(await lastSystem(channel.id)).toEqual({ kind: 'added', userIds: ['u-2', 'u-3'] })
    expect(events).toContainEqual({ type: 'channelChanged', channelId: channel.id })
    expect(events.some((e) => e.type === 'messageReceived')).toBe(true)
  })

  it('refuses nobody new, an unknown person, and anyone in a channel I may not change', async () => {
    const channel = await ops()
    await expect(api.chat.addMembers(channel.id, ['u-1'])).rejects.toMatchObject({ status: 400, detail: 'Everyone you picked is already in #ops.' })
    await expect(api.chat.addMembers(channel.id, [])).rejects.toMatchObject({ status: 400, detail: 'Pick someone to add.' })
    await expect(api.chat.addMembers(channel.id, ['u-99'])).rejects.toMatchObject({ status: 404 })
    await api.users.viewAs('u-3')
    await expect(api.chat.addMembers('c-release', ['u-3'])).rejects.toMatchObject({ status: 403 })
  })

  it('removes someone and says so; not me (that is Leave), not someone who isn’t in it', async () => {
    const channel = await ops()
    await api.chat.addMembers(channel.id, ['u-2', 'u-3'])
    events = []
    expect((await api.chat.removeMember(channel.id, 'u-3')).memberIds).toEqual(['u-1', 'u-2'])
    expect(await lastSystem(channel.id)).toEqual({ kind: 'removed', userId: 'u-3' })
    expect(events).toContainEqual({ type: 'channelChanged', channelId: channel.id })
    await expect(api.chat.removeMember(channel.id, 'u-1')).rejects.toMatchObject({ status: 400, detail: 'Leave the channel instead.' })
    await expect(api.chat.removeMember(channel.id, 'u-3')).rejects.toMatchObject({ status: 400, detail: 'They’re not in #ops.' })
  })

  it('never a project’s channel or a direct message', async () => {
    for (const call of [() => api.chat.addMembers('c-p-nex', ['u-9']), () => api.chat.removeMember('c-p-nex', 'u-2')])
      await expect(call()).rejects.toMatchObject({ status: 400, detail: 'This channel follows its project.' })
    for (const call of [() => api.chat.addMembers('c-dm-1', ['u-3']), () => api.chat.removeMember('c-dm-1', 'u-2')])
      await expect(call()).rejects.toMatchObject({ status: 400, detail: "Direct messages can't be edited." })
  })

  it('someone taken off a private channel can no longer read it, nor see its mentions', async () => {
    await api.users.viewAs('u-4')
    const m = await api.chat.send('c-release', 'Ping @[Nour El-Sayed](u-2)')
    await api.users.viewAs('u-1')
    await api.chat.removeMember('c-release', 'u-2')
    await api.users.viewAs('u-2')
    await expect(api.chat.channel('c-release')).rejects.toMatchObject({ status: 403 })
    expect((await api.mentions.mine()).some((i) => i.id === m.id)).toBe(false)
  })
})

describe('who can post, in the channel (spec §9)', () => {
  it('at Only admins someone else can’t post or reply, but can still react; an Admin can post', async () => {
    const root = await api.chat.send('c-backend', 'Freeze starts now')
    await api.chat.updateChannel('c-backend', { whoCanPost: 'admins' })
    await api.chat.reply(root.id, 'Admins can reply')
    await api.users.viewAs('u-2')
    const refused = { status: 403, detail: 'Only admins can post in #backend.' }
    await expect(api.chat.send('c-backend', 'Can I?')).rejects.toMatchObject(refused)
    await expect(api.chat.reply(root.id, 'Can I?')).rejects.toMatchObject(refused)
    await api.chat.react({ kind: 'message', id: root.id }, '👍')
    expect((await api.chat.message(root.id)).reactions).toContainEqual({ emoji: '👍', userIds: ['u-2'] })
  })
})

describe('an archived channel is read-only (review)', () => {
  it('its details and people can’t change until it’s restored, as nothing can be posted in it', async () => {
    const channel = await ops()
    await api.chat.addMembers(channel.id, ['u-2'])
    await api.chat.archiveChannel(channel.id)
    const refused = { status: 400, detail: 'This channel is archived.' }
    await expect(api.chat.updateChannel(channel.id, { name: 'ops-old' })).rejects.toMatchObject(refused)
    await expect(api.chat.updateChannel(channel.id, { whoCanPost: 'admins' })).rejects.toMatchObject(refused)
    await expect(api.chat.addMembers(channel.id, ['u-3'])).rejects.toMatchObject(refused)
    await expect(api.chat.removeMember(channel.id, 'u-2')).rejects.toMatchObject(refused)
    await api.chat.restoreChannel(channel.id)
    expect((await api.chat.updateChannel(channel.id, { name: 'ops-old' })).name).toBe('ops-old')
  })
})
