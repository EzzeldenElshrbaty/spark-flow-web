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
  // null means there is no BroadcastChannel to use (an old browser), so the hub stays in this tab.
  Broadcast: typeof BroadcastChannel | null = globalThis.BroadcastChannel ?? null,
): MockHub {
  const listeners = new Set<(event: RealtimeEvent) => void>()
  // One listener failing must not stop the others, or the post to the other tabs.
  const deliver = (event: RealtimeEvent) => {
    // A copy, so a listener can unsubscribe while this runs.
    for (const listener of Array.from(listeners)) {
      try {
        listener(event)
      } catch (error) {
        console.error('A real-time listener threw.', error)
      }
    }
  }

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
    onTimeLogged: (cb) => on(hub, 'timeLogged', (e) => cb({ userId: e.userId, projectId: e.projectId })),
    onCommentAdded: (cb) => on(hub, 'commentAdded', (e) => cb({ taskKey: e.taskKey, projectId: e.projectId })),
    onMessageChanged: (cb) => on(hub, 'messageChanged', (e) => cb({ channelId: e.channelId, messageId: e.messageId })),
    onChannelChanged: (cb) => on(hub, 'channelChanged', (e) => cb({ channelId: e.channelId })),
  }
}

export const mockHub = createMockHub()
