import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, ThreadReply, Ticket } from '@/api/types'
import type { RealtimeEvent } from '@/lib/realtime'
import { createMockHub, createMockRealtimeClient, type MockHub } from './realtime'

const sampleTicket: Ticket = {
  id: 't1', key: 'NEX-100', projectId: 'p1', title: 'Sample', description: '', descriptionBody: [], attachmentIds: [],
  status: 'todo', priority: 'medium', storyPoints: null,
  assigneeId: null, reporterId: 'u1', sprintId: null, rank: 1,
  linkedChannelId: null, linkedMessageId: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  phaseId: null, type: 'task', dueAt: null, estimateHours: null,
}
const sampleMessage: ChatMessage = {
  id: 'm1', channelId: 'c1', seq: 1, senderId: 'u1', content: 'hi',
  attachments: [], reactions: [], threadCount: 0, lastReplyAt: null,
  linkedTicketKeys: [], mentions: [], body: [], editedAt: null, createdAt: '2026-01-01T00:00:00.000Z',
}
const sampleReply: ThreadReply = {
  id: 'r1', messageId: 'm1', channelId: 'c1', senderId: 'u2', content: 'yo', body: [],
  attachments: [], reactions: [], createdAt: '2026-01-01T00:00:00.000Z',
  mentions: [],
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

  it('delivers a page’s saves and holds (chat spec 6.14)', () => {
    const hub = makeHub(uniqueName())
    const client = createMockRealtimeClient(hub)
    const onSaved = vi.fn()
    const onEditing = vi.fn()
    client.onPageSaved(onSaved)
    client.onPageEditing(onEditing)
    hub.publish({ type: 'pageSaved', channelId: 'c1', version: 3, userId: 'u-2' })
    hub.publish({ type: 'pageEditing', channelId: 'c1', userId: null, until: null })
    expect(onSaved).toHaveBeenCalledExactlyOnceWith({ channelId: 'c1', version: 3, userId: 'u-2' })
    expect(onEditing).toHaveBeenCalledExactlyOnceWith({ channelId: 'c1', userId: null, until: null })
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
  it('works without BroadcastChannel', async () => {
    const name = uniqueName()
    const alone = makeHub(name, null)
    const other = makeHub(name) // a real hub on the same name: it must hear nothing from `alone`
    const seen: string[] = []
    const heardByOther = vi.fn()
    createMockRealtimeClient(alone).onTicketUpdated((t) => seen.push(t.key))
    other.subscribe(heardByOther)

    alone.publish({ type: 'ticketUpdated', ticket: { ...sampleTicket, key: 'NEX-101' } })

    expect(seen).toEqual(['NEX-101'])
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(heardByOther).not.toHaveBeenCalled()
  })

  it('opens and posts to the channel it is given', () => {
    const postMessage = vi.fn()
    const constructed: string[] = []
    class SpyChannel {
      onmessage: unknown = null
      constructor(name: string) { constructed.push(name) }
      postMessage = postMessage
      close() {}
    }
    const hub = makeHub('spy', SpyChannel as unknown as typeof BroadcastChannel)
    hub.publish({ type: 'userTyping', channelId: 'c1', userId: 'u1' })
    expect(constructed).toEqual(['spy'])
    expect(postMessage).toHaveBeenCalledOnce()
  })

  it('keeps delivering and posting when a listener throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const name = uniqueName()
    const a = makeHub(name)
    const b = makeHub(name)
    const afterThrow = vi.fn()
    a.subscribe(() => { throw new Error('boom') })
    a.subscribe(afterThrow)
    const arrived = new Promise<RealtimeEvent>((resolve) => b.subscribe(resolve))
    const event: RealtimeEvent = { type: 'userTyping', channelId: 'c1', userId: 'u1' }

    expect(() => a.publish(event)).not.toThrow()

    expect(afterThrow).toHaveBeenCalledOnce()
    await expect(arrived).resolves.toEqual(event)
    expect(error).toHaveBeenCalledOnce()
    error.mockRestore()
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

describe('sending typing', () => {
  it('sendTyping publishes userTyping for the channel and person', () => {
    const hub = createMockHub(`test-typing-${Math.random()}`, null)
    const seen: unknown[] = []
    hub.subscribe((e) => seen.push(e))
    createMockRealtimeClient(hub).sendTyping('c1', 'u1')
    expect(seen).toEqual([{ type: 'userTyping', channelId: 'c1', userId: 'u1' }])
    hub.close()
  })
})

