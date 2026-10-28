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
  hub = createMockHub(`test-invites-${++n}`, null)
  api = createMockApi(db, hub)
  events = []
  hub.subscribe((e) => events.push(e))
})
afterEach(() => hub.close())

const ops = () => api.chat.createChannel({ workspaceId: 'ws-eng', name: 'ops', topic: '', isPrivate: false, memberIds: [] })
const newest = async (channelId: string) => (await api.chat.messages(channelId)).items[0]
const emails = async (channelId: string) => (await api.chat.invitations(channelId)).map((i) => i.email)

describe('email invites (spec 6.10, §7 Invitation)', () => {
  it('an Admin invites emails as guests: pending, lowercased, with no message in the channel, live', async () => {
    const before = await newest('c-backend')
    events = []
    const channel = await api.chat.addMembers('c-backend', [], ['  Sam@Client.com ', 'lina@partner.io'])
    expect(channel.memberIds).toEqual(['u-1', 'u-2', 'u-5', 'u-6'])
    const invites = await api.chat.invitations('c-backend')
    expect(invites.map((i) => [i.email, i.role, i.status, i.invitedBy, i.channelId, i.workspaceId])).toEqual([
      ['sam@client.com', 'guest', 'pending', 'u-1', 'c-backend', 'ws-eng'],
      ['lina@partner.io', 'guest', 'pending', 'u-1', 'c-backend', 'ws-eng'],
    ])
    expect((await newest('c-backend')).id).toBe(before.id)
    expect(events).toContainEqual({ type: 'channelChanged', channelId: 'c-backend' })
    expect(events.some((e) => e.type === 'messageReceived')).toBe(false)
  })

  it('people and emails go in one add; the email of someone in Spark Systems adds that person', async () => {
    const channel = await ops()
    await api.chat.addMembers(channel.id, ['u-2'], ['MARIAM.FATHY@spark-sys.com', 'sam@client.com'])
    expect((await api.chat.channel(channel.id)).memberIds).toEqual(['u-1', 'u-2', 'u-3'])
    expect((await newest(channel.id)).system).toEqual({ kind: 'added', userIds: ['u-2', 'u-3'] })
    expect(await emails(channel.id)).toEqual(['sam@client.com'])
  })

  it('skips anyone already in or already invited; when nothing is new it says so', async () => {
    await api.chat.addMembers('c-backend', [], ['sam@client.com'])
    await expect(api.chat.addMembers('c-backend', ['u-2'], ['Sam@client.com'])).rejects.toMatchObject({ status: 400, detail: 'Everyone you picked is already in #backend or invited.' })
    await api.chat.addMembers('c-backend', [], ['sam@client.com', 'lina@partner.io'])
    expect(await emails('c-backend')).toEqual(['sam@client.com', 'lina@partner.io'])
    await expect(api.chat.addMembers('c-backend', ['u-2'])).rejects.toMatchObject({ status: 400, detail: 'Everyone you picked is already in #backend.' })
  })

  it('checks every email, and takes at most 20 at a time', async () => {
    await expect(api.chat.addMembers('c-backend', [], ['sam@client.com', 'sam@client'])).rejects.toMatchObject({ status: 400, detail: "sam@client isn't an email address." })
    const many = Array.from({ length: 21 }, (_, i) => `guest${i}@client.com`)
    await expect(api.chat.addMembers('c-backend', [], many)).rejects.toMatchObject({ status: 400, detail: 'Invite up to 20 emails at a time.' })
    expect(await api.chat.invitations('c-backend')).toEqual([])
  })

  it('only an Admin invites by email; whoever may change the channel still adds people, by name or their email', async () => {
    await api.users.viewAs('u-2')
    await expect(api.chat.addMembers('c-backend', ['u-3'], ['sam@client.com'])).rejects.toMatchObject({ status: 403, detail: 'Only admins can invite people by email.' })
    expect((await api.chat.channel('c-backend')).memberIds).not.toContain('u-3')
    expect((await api.chat.addMembers('c-backend', ['u-3'], ['ahmed.shawky@spark-sys.com'])).memberIds).toEqual(['u-1', 'u-2', 'u-5', 'u-6', 'u-3', 'u-4'])
  })

  it('never into a project’s channel, a direct message or an archived channel', async () => {
    await expect(api.chat.addMembers('c-p-nex', [], ['sam@client.com'])).rejects.toMatchObject({ status: 400, detail: 'This channel follows its project.' })
    const channel = await ops()
    await api.chat.archiveChannel(channel.id)
    await expect(api.chat.addMembers(channel.id, [], ['sam@client.com'])).rejects.toMatchObject({ status: 400, detail: 'This channel is archived.' })
  })
})

describe('the invited list and Revoke (spec 6.10 Members)', () => {
  it('shows pending invitations to whoever may change the channel; a private one’s to its members only', async () => {
    await api.chat.addMembers('c-release', [], ['sam@client.com'])
    expect(await emails('c-release')).toEqual(['sam@client.com'])
    await api.users.viewAs('u-3')
    await expect(api.chat.invitations('c-release')).rejects.toMatchObject({ status: 403, detail: "You're not in this channel." })
    await expect(api.chat.invitations('c-backend')).rejects.toMatchObject({ status: 403, detail: 'Only its members can change this channel.' })
  })

  it('whoever invited, or an Admin, revokes it; it leaves the list, live, and can be sent again', async () => {
    await api.chat.addMembers('c-backend', [], ['sam@client.com'])
    const [invite] = await api.chat.invitations('c-backend')
    await api.users.viewAs('u-2')
    await expect(api.chat.revokeInvitation(invite.id)).rejects.toMatchObject({ status: 403, detail: 'Only whoever invited them, or an admin, can revoke this.' })
    await api.users.viewAs('u-1')
    events = []
    await api.chat.revokeInvitation(invite.id)
    expect(await api.chat.invitations('c-backend')).toEqual([])
    expect(events).toContainEqual({ type: 'channelChanged', channelId: 'c-backend' })
    await expect(api.chat.revokeInvitation(invite.id)).rejects.toMatchObject({ status: 400, detail: 'This invitation was revoked already.' })
    await expect(api.chat.revokeInvitation('inv-none')).rejects.toMatchObject({ status: 404 })
    await api.chat.addMembers('c-backend', [], ['sam@client.com'])
    expect(await emails('c-backend')).toEqual(['sam@client.com'])
  })
})

describe('default channels (spec 6.10, admin only)', () => {
  it('#general is one; other channels, new ones too, are not', async () => {
    expect((await api.chat.channel('c-general')).isDefault).toBe(true)
    expect((await api.chat.channel('c-backend')).isDefault).toBe(false)
    expect((await ops()).isDefault).toBe(false)
  })

  it('only an Admin sets it, and only on a public channel; other edits leave it be', async () => {
    expect((await api.chat.updateChannel('c-backend', { isDefault: true })).isDefault).toBe(true)
    await expect(api.chat.updateChannel('c-release', { isDefault: true })).rejects.toMatchObject({ status: 400, detail: "A private channel can't be a default channel." })
    await expect(api.chat.updateChannel('c-backend', { isDefault: 'yes' as never })).rejects.toMatchObject({ status: 400, detail: 'Turn the default channel on or off.' })
    await api.users.viewAs('u-2')
    await expect(api.chat.updateChannel('c-backend', { isDefault: false })).rejects.toMatchObject({ status: 403, detail: 'Only admins can choose default channels.' })
    expect((await api.chat.updateChannel('c-backend', { topic: 'Queues' })).isDefault).toBe(true)
  })
})
