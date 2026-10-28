import type { ChatMessage, ThreadReply, Ticket } from '@/api/types'
import { backendOn } from '@/lib/api'
import { createMockRealtimeClient, mockHub } from '@/mocks/realtime'

/** What the app listens to for live updates. The mock hub and the SignalR connection both fit this. */
export interface RealtimeClient {
  start(): Promise<void>
  stop(): Promise<void>
  joinChannel(channelId: string): void                  // SignalR group later
  leaveChannel(channelId: string): void
  /** Tells the channel's other readers I'm typing (the page sends it at most every 2 s). */
  sendTyping(channelId: string, userId: string): void
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
  /** Someone's hourly cost changed: cost everywhere follows. */
  onRatesChanged(cb: () => void): () => void
  /** A file was added to a project. */
  onFilesChanged(cb: (event: { projectId: string }) => void): () => void
  /** A file's details changed, or it was deleted or shared (spec §8 file.updated, file.deleted, file.shared). */
  onFileChanged(cb: (event: { fileId: string }) => void): () => void
  /**
   * Someone read a channel or mentions, or changed their own state in a channel (star, mute): their badges and bell
   * follow, in each of their tabs. `channelId` is set for a channel, `seq` for a new read marker.
   */
  onReadChanged(cb: (event: { userId: string; channelId?: string; seq?: number }) => void): () => void
  /** Something new for this person's Activity (spec 6.12): a reaction to theirs, a reply in a thread they follow. */
  onNotificationCreated(cb: (event: { userId: string }) => void): () => void
  /** One of my drafts changed (in another tab or device): the sidebar's pencils follow. */
  onDraftChanged(cb: (event: { userId: string; channelId: string }) => void): () => void
  /** The demo data was reset or reloaded: everything on screen is out of date. */
  onDataReset(cb: () => void): () => void
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
  | { type: 'ratesChanged' }
  | { type: 'filesChanged'; projectId: string }
  | { type: 'fileChanged'; fileId: string }
  | { type: 'readChanged'; userId: string; channelId?: string; seq?: number }
  | { type: 'draftChanged'; userId: string; channelId: string }
  | { type: 'notificationCreated'; userId: string }
  | { type: 'dataReset' }

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
    sendTyping: noop,
    onMessageReceived: () => noop,
    onReplyReceived: () => noop,
    onTicketUpdated: () => noop,
    onUserTyping: () => noop,
    onTimeLogged: () => noop,
    onCommentAdded: () => noop,
    onMessageChanged: () => noop,
    onChannelChanged: () => noop,
    onProjectChanged: () => noop,
    onRatesChanged: () => noop,
    onFilesChanged: () => noop,
    onFileChanged: () => noop,
    onReadChanged: () => noop,
    onDraftChanged: () => noop,
    onNotificationCreated: () => noop,
    onDataReset: () => noop,
  }
}

/** The real-time client for this build: the mock hub in the prototype, SignalR with the backend. */
export function createRealtimeClient(): RealtimeClient {
  return backendOn ? createUnconnectedClient() : createMockRealtimeClient(mockHub)
}

let shared: RealtimeClient | null = null
/** The app's one realtime client (one SignalR connection with the backend): RealtimeBridge starts it, pages join and send on it. */
export function useRealtime(): RealtimeClient {
  return (shared ??= createRealtimeClient())
}
