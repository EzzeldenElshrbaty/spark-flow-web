import type { ChatMessage, ThreadReply, Ticket } from '@/api/types'
import { backendOn } from '@/lib/api'
import { createMockRealtimeClient, mockHub } from '@/mocks/realtime'

/** What the app listens to for live updates. The mock hub and the SignalR connection both fit this. */
export interface RealtimeClient {
  start(): Promise<void>
  stop(): Promise<void>
  joinChannel(channelId: string): void                  // SignalR group later
  leaveChannel(channelId: string): void
  onMessageReceived(cb: (message: ChatMessage) => void): () => void
  onReplyReceived(cb: (reply: ThreadReply) => void): () => void
  onTicketUpdated(cb: (ticket: Ticket) => void): () => void
  onUserTyping(cb: (event: { channelId: string; userId: string }) => void): () => void
  onTimeLogged(cb: (event: { userId: string; projectId: string | null }) => void): () => void
  onCommentAdded(cb: (event: { taskKey: string; projectId: string }) => void): () => void
  /** A message or reply changed (reaction, edit, delete); messageId is the message, or a reply's parent. */
  onMessageChanged(cb: (event: { channelId: string; messageId: string }) => void): () => void
  /** A channel was opened or its name, topic or members changed. */
  onChannelChanged(cb: (event: { channelId: string }) => void): () => void
  /** A project's details, phases, deliverables or board changed. */
  onProjectChanged(cb: (event: { projectId: string }) => void): () => void
}

/** One live update, as the mock hub carries it between tabs. */
export type RealtimeEvent =
  | { type: 'messageReceived'; message: ChatMessage }
  | { type: 'replyReceived'; reply: ThreadReply }
  | { type: 'ticketUpdated'; ticket: Ticket }
  | { type: 'userTyping'; channelId: string; userId: string }
  | { type: 'timeLogged'; userId: string; projectId: string | null }
  | { type: 'commentAdded'; taskKey: string; projectId: string }
  | { type: 'messageChanged'; channelId: string; messageId: string }
  | { type: 'channelChanged'; channelId: string }
  | { type: 'projectChanged'; projectId: string }

const noop = () => {}

// The SignalR client comes with the backend; until then it only says so, once.
function createUnconnectedClient(): RealtimeClient {
  let warned = false
  return {
    async start() {
      if (warned) return
      warned = true
      console.warn("Real-time over SignalR isn't connected yet.")
    },
    async stop() {},
    joinChannel: noop,
    leaveChannel: noop,
    onMessageReceived: () => noop,
    onReplyReceived: () => noop,
    onTicketUpdated: () => noop,
    onUserTyping: () => noop,
    onTimeLogged: () => noop,
    onCommentAdded: () => noop,
    onMessageChanged: () => noop,
    onChannelChanged: () => noop,
    onProjectChanged: () => noop,
  }
}

/** The real-time client for this build: the mock hub in the prototype, SignalR with the backend. */
export function createRealtimeClient(): RealtimeClient {
  return backendOn ? createUnconnectedClient() : createMockRealtimeClient(mockHub)
}
