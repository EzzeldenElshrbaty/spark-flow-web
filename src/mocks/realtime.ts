import type { RealtimeClient, RealtimeEvent } from '@/lib/realtime'

export interface MockHub {
  publish(event: RealtimeEvent): void
  subscribe(listener: (event: RealtimeEvent) => void): () => void
  close(): void
}

/**
 * Fakes SignalR in the prototype. Events go to listeners in this tab at once, and to the other tabs
 * over a BroadcastChannel. What arrives from another tab is only delivered here, never posted again.
 */
export function createMockHub(
  channelName = 'spark-flow.realtime',
  Broadcast: typeof BroadcastChannel | undefined = globalThis.BroadcastChannel,
): MockHub {
  const listeners = new Set<(event: RealtimeEvent) => void>()
  const deliver = (event: RealtimeEvent) => listeners.forEach((listener) => listener(event))

  const channel = Broadcast ? new Broadcast(channelName) : null
  if (channel) channel.onmessage = (e: MessageEvent<RealtimeEvent>) => deliver(e.data)

  let closed = false

  return {
    publish(event) {
      if (closed) return
      deliver(event)
      channel?.postMessage(event)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close() {
      closed = true
      listeners.clear()
      channel?.close()
    },
  }
}

/** Picks the events of one type out of the hub's stream. */
function on<T extends RealtimeEvent['type']>(hub: MockHub, type: T, cb: (event: Extract<RealtimeEvent, { type: T }>) => void) {
  return hub.subscribe((event) => {
    if (event.type === type) cb(event as Extract<RealtimeEvent, { type: T }>)
  })
}

/** The RealtimeClient the app uses in the prototype; the hub has no groups or connection, so those calls do nothing. */
export function createMockRealtimeClient(hub: MockHub): RealtimeClient {
  return {
    start: async () => {},
    stop: async () => {},
    joinChannel: () => {},
    leaveChannel: () => {},
    onMessageReceived: (cb) => on(hub, 'messageReceived', (e) => cb(e.message)),
    onReplyReceived: (cb) => on(hub, 'replyReceived', (e) => cb(e.reply)),
    onTicketUpdated: (cb) => on(hub, 'ticketUpdated', (e) => cb(e.ticket)),
    onUserTyping: (cb) => on(hub, 'userTyping', (e) => cb({ channelId: e.channelId, userId: e.userId })),
  }
}

export const mockHub = createMockHub()
