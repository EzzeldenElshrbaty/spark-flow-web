import type { Role } from '@/lib/roles'

export type { Role }

// ── Relational (PostgreSQL) ───────────────────────────────────────────────
export type Presence = 'active' | 'away' | 'offline'
export type User = { id: string; name: string; email: string; title: string; role: Role; presence: Presence }

export type Workspace = { id: string; slug: string; name: string }

export type Project = { id: string; workspaceId: string; key: string; name: string; description: string; leadId: string }

export type SprintState = 'planned' | 'active' | 'closed'
export type Sprint = {
  id: string; projectId: string; name: string; goal: string
  startDate: string; endDate: string; state: SprintState
}

export type TicketStatus = 'backlog' | 'todo' | 'inProgress' | 'inReview' | 'done'
export type Priority = 'urgent' | 'high' | 'medium' | 'low'
export type Ticket = {
  id: string; key: string; projectId: string            // key: 'NEX-101'
  title: string; description: string
  status: TicketStatus; priority: Priority; storyPoints: number | null
  assigneeId: string | null; reporterId: string; sprintId: string | null
  rank: number                                           // order within a status column
  linkedChannelId: string | null; linkedMessageId: string | null
  createdAt: string; updatedAt: string
}

// ── Documents (MongoDB) ───────────────────────────────────────────────────
export type Attachment = { id: string; name: string; size: number; mimeType: string; url: string }
export type Reaction = { emoji: string; userIds: string[] }

export type ChannelKind = 'channel' | 'dm'
export type Channel = {
  id: string; workspaceId: string; kind: ChannelKind
  name: string | null                                    // null for DMs; the UI names a DM after the other member
  topic: string; memberIds: string[]; isPrivate: boolean
  lastMessageAt: string | null; unreadCount: number      // unreadCount is per the current user
}

export type ChatMessage = {
  id: string; channelId: string; senderId: string; content: string
  attachments: Attachment[]; reactions: Reaction[]
  threadCount: number; lastReplyAt: string | null
  linkedTicketKeys: string[]; editedAt: string | null; createdAt: string
}

export type ThreadReply = {
  id: string; messageId: string; channelId: string; senderId: string; content: string
  attachments: Attachment[]; reactions: Reaction[]; createdAt: string
}

// ── Transport ─────────────────────────────────────────────────────────────
export type Page<T> = { items: T[]; nextCursor: string | null } // messages: newest first, cursor = createdAt
export type ProblemDetails = { title: string; status: number; detail?: string }

// ── Derived shapes ────────────────────────────────────────────────────────
/** A channel as stored: unreadCount is worked out per user, never saved. */
export type StoredChannel = Omit<Channel, 'unreadCount'>

export type NewTicket = Pick<
  Ticket,
  'projectId' | 'title' | 'description' | 'status' | 'priority' | 'storyPoints' | 'assigneeId' | 'sprintId'
> &
  Partial<Pick<Ticket, 'linkedChannelId' | 'linkedMessageId'>>

export type TicketPatch = Partial<
  Pick<Ticket, 'title' | 'description' | 'status' | 'priority' | 'storyPoints' | 'assigneeId' | 'sprintId' | 'rank'>
>

// ── The api object (src/lib/api.ts) ───────────────────────────────────────
export interface Api {
  workspaces: { list(): Promise<Workspace[]> }
  users: { me(): Promise<User>; list(workspaceId: string): Promise<User[]> }
  chat: {
    channels(workspaceId: string): Promise<Channel[]>
    channel(id: string): Promise<Channel>
    messages(channelId: string, cursor?: string): Promise<Page<ChatMessage>>
    message(id: string): Promise<ChatMessage>
    replies(messageId: string): Promise<ThreadReply[]>
    markRead(channelId: string): Promise<void>
  }
  tickets: {
    projects(workspaceId: string): Promise<Project[]>
    sprints(projectId: string): Promise<Sprint[]>
    list(projectId: string): Promise<Ticket[]>
    get(key: string): Promise<Ticket>
  }
  dev: { resetDemoData(): Promise<void> } // mock only; hidden when backendOn
}
