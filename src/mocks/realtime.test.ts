import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, ThreadReply, Ticket } from '@/api/types'
import type { RealtimeEvent } from '@/lib/realtime'
import { createMockHub, createMockRealtimeClient, type MockHub } from './realtime'

const sampleTicket: Ticket = {
  id: 't1', key: 'NEX-100', projectId: 'p1', title: 'Sample', description: '',
  status: 'todo', priority: 'medium', storyPoints: null,
  assigneeId: null, reporterId: 'u1', sprintId: null, rank: 1,
  linkedChannelId: null, linkedMessageId: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
}
const sampleMessage: ChatMessage = {
  id: 'm1', channelId: 'c1', senderId: 'u1', content: 'hi',
  attachments: [], reactions: [], threadCount: 0, lastReplyAt: null,
  linkedTicketKeys: [], editedAt: null, createdAt: '2026-01-01T00:00:00.000Z',
}
const sampleReply: ThreadReply = {
  id: 'r1', messageId: 'm1', channelId: 'c1', senderId: 'u2', content: 'yo',
  attachments: [], reactions: [], createdAt: '2026-01-01T00:00:00.000Z',
}

// A unique channel name per test, so hubs from different tests never hear each other.
let counter = 0
const uniqueName = () => `test-realtime-${++counter}`

// Every hub made here is closed after the test so no BroadcastChannel keeps the process alive.
const hubs: MockHub[] = []
const makeHub = (...args: Parameters<typeof createMockHub>) => {
  const hub = createMockHub(...args)
  hubs.push(hub)
  return hub
}
afterEach(() => {
  hubs.splice(0).forEach((hub) => hub.close())
})

describe('createMockRealtimeClient', () => {
  it('delivers each event type to its handler only', () => {
    const hub = makeHub(uniqueName())
    const client = createMockRealtimeClient(hub)
    const onMessage = vi.fn()
    const onReply = vi.fn()
    const onTicket = vi.fn()
    const onTyping = vi.fn()
    client.onMessageReceived(onMessage)
    client.onReplyReceived(onReply)
    client.onTicketUpdated(onTicket)
    client.onUserTyping(onTyping)

    const events: RealtimeEvent[] = [
      { type: 'messageReceived', message: sampleMessage },
      { type: 'replyReceived', reply: sampleReply },
      { type: 'ticketUpdated', ticket: sampleTicket },
      { type: 'userTyping', channelId: 'c1', userId: 'u2' },
    ]
    events.forEach((event) => hub.publish(event))

    expect(onMessage).toHaveBeenCalledOnce()
    expect(onMessage).toHaveBeenCalledWith(sampleMessage)
    expect(onReply).toHaveBeenCalledOnce()
    expect(onReply).toHaveBeenCalledWith(sampleReply)
    expect(onTicket).toHaveBeenCalledOnce()
    expect(onTicket).toHaveBeenCalledWith(sampleTicket)
    expect(onTyping).toHaveBeenCalledOnce()
    expect(onTyping).toHaveBeenCalledWith({ channelId: 'c1', userId: 'u2' })
  })

  it('unsubscribe stops delivery', () => {
    const hub = makeHub(uniqueName())
    const handler = vi.fn()
    const off = createMockRealtimeClient(hub).onMessageReceived(handler)
    off()
    hub.publish({ type: 'messageReceived', message: sampleMessage })
    expect(handler).not.toHaveBeenCalled()
  })

  it('start, stop, joinChannel and leaveChannel are harmless', async () => {
    const client = createMockRealtimeClient(makeHub(uniqueName()))
    await expect(client.start()).resolves.toBeUndefined()
    client.joinChannel('c1')
    client.leaveChannel('c1')
    await expect(client.stop()).resolves.toBeUndefined()
  })
})

describe('createMockHub', () => {
  it('works without BroadcastChannel', () => {
    const hub = makeHub('t', undefined)
    const seen: string[] = []
    createMockRealtimeClient(hub).onTicketUpdated((t) => seen.push(t.key))
    hub.publish({ type: 'ticketUpdated', ticket: { ...sampleTicket, key: 'NEX-101' } })
    expect(seen).toEqual(['NEX-101'])
  })

  it('relays between two hubs on the same channel without echo loops', async () => {
    const name = uniqueName()
    const a = makeHub(name)
    const b = makeHub(name)
    const seenByA: string[] = []
    const seenByB: string[] = []
    a.subscribe((event) => event.type === 'ticketUpdated' && seenByA.push(event.ticket.key))
    const delivered = new Promise<void>((resolve) => {
      b.subscribe((event) => {
        if (event.type === 'ticketUpdated') seenByB.push(event.ticket.key)
        resolve()
      })
    })

    a.publish({ type: 'ticketUpdated', ticket: { ...sampleTicket, key: 'NEX-102' } })
    expect(seenByA).toEqual(['NEX-102']) // local delivery is synchronous
    await delivered
    // B must not re-post what it received, or A would hear the event a second time.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(seenByB).toEqual(['NEX-102'])
    expect(seenByA).toEqual(['NEX-102'])
  })

  it('stops delivering after close', () => {
    const hub = createMockHub(uniqueName())
    const handler = vi.fn()
    hub.subscribe(handler)
    hub.close()
    hub.publish({ type: 'userTyping', channelId: 'c1', userId: 'u1' })
    expect(handler).not.toHaveBeenCalled()
  })
})
