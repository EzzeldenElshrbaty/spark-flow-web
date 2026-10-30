import type { Role } from '@/lib/roles'
import type { Body } from '@/lib/messageBody'

export type { Role }

// ── Relational (PostgreSQL) ───────────────────────────────────────────────
export type Presence = 'active' | 'away' | 'offline'
export type User = { id: string; name: string; email: string; title: string; role: Role; presence: Presence; teamIds: string[] }
export type Team = { id: string; workspaceId: string; name: string; memberIds: string[] }

export type Workspace = { id: string; slug: string; name: string }

export type Methodology = 'waterfall' | 'agile'
export type ProjectStatus = 'planned' | 'active' | 'onHold' | 'delivered'
export type ProjectLink = { label: string; url: string }
export type Project = {
  id: string; workspaceId: string; key: string; name: string; description: string // description = "about"
  clientName: string; logoFileId: string | null; links: ProjectLink[]
  managerId: string; memberIds: string[]; teamIds: string[]
  methodology: Methodology; status: ProjectStatus; startDate: string; dueDate: string
  channelId: string                                      // the project's chat
  /** The board's column names and order (still the 5 statuses); missing means the standard board. */
  board?: BoardColumn[]
  /** Set while archived (Admins): out of the lists, read-only until restored; its time stays in reports. */
  archivedAt?: string | null
}

/** What a board column means, whatever it is called: done-ness (progress, overdue, timers) follows this. */
export type StatusCategory = 'todo' | 'inProgress' | 'done'
/** A project's board column. A task's status is the id of its column. */
export type BoardColumn = { id: string; label: string; category: StatusCategory }

export type PhaseStatus = 'notStarted' | 'inProgress' | 'done'
export type Phase = { id: string; projectId: string; name: string; order: number; startDate: string; dueDate: string; status: PhaseStatus }
/** A project as lists and pages show it, with the values the server works out (spec §3). */
export type ProjectSummary = Project & {
  progress: number               // 0..1, done tasks ÷ all tasks
  loggedHours: number
  cost: number | null            // admin only
  expectedFinish: string         // ISO
  currentPhaseId: string | null  // first phase not done, by order
  overdueCount: number
  taskCount: number
}
export type Deliverable = { id: string; projectId: string; phaseId: string | null; title: string; dueDate: string; doneAt: string | null }

export type SprintState = 'planned' | 'active' | 'closed'
export type Sprint = {
  id: string; projectId: string; name: string; goal: string
  startDate: string; endDate: string; state: SprintState
}

/** The id of the task's column on its project's board (the defaults are backlog, todo, inProgress, inReview, done). */
export type TicketStatus = string
export type Priority = 'urgent' | 'high' | 'medium' | 'low'
export type Ticket = {
  id: string; key: string; projectId: string            // key: 'NEX-101'
  title: string; description: string
  status: TicketStatus; priority: Priority; storyPoints: number | null
  assigneeId: string | null; reporterId: string; sprintId: string | null
  rank: number                                           // order within a status column
  linkedChannelId: string | null; linkedMessageId: string | null
  createdAt: string; updatedAt: string
  phaseId: string | null; type: TaskType
  dueAt: string | null; estimateHours: number | null     // either, both or neither; overdue is derived
  /** Set while archived: off the board, lists and totals; its time and cost stay on the project. */
  archivedAt?: string | null
}
export type TaskType = 'task' | 'bug'
/** The company system calls tickets tasks; the contract and keys (NEX-101) are the same. */
export type Task = Ticket

/** A task as the API returns it: with the hours logged so far and whether it is overdue (spec §3). */
/** A task as read: `category` is its column's type (done-ness follows it). */
/** A task as a chip or unfurl shows it: live status, its project, who has it. */
export type TaskRef = {
  key: string; title: string; status: TicketStatus; statusLabel: string; category: StatusCategory
  projectKey: string; projectName: string; assigneeId: string | null
}

export type TaskView = Task & { loggedHours: number; overdue: boolean; category: StatusCategory }

// ── Time and cost ─────────────────────────────────────────────────────────
export type TimeEntry = {
  id: string; userId: string; projectId: string; taskId: string | null
  startedAt: string; endedAt: string | null              // null = running
  source: 'timer' | 'manual'; note: string
}
export type CheckIn = { id: string; userId: string; day: string /* YYYY-MM-DD local */; checkedInAt: string; checkedOutAt: string | null; plan: string }
/** One hourly cost from `effectiveFrom` on (admin only); a person's rows are their rate's history. */
export type Rate = { id: string; userId: string; hourlyCost: number; currency: 'EGP'; effectiveFrom: string }

// ── Documents (MongoDB) ───────────────────────────────────────────────────
/** A stored file's details; its bytes live in the file store and are opened through api.files.url(id). */
/** A file's virus scan (spec §7 scan_status): it can't be opened or sent until it's clean. */
export type ScanStatus = 'pending' | 'clean' | 'blocked'
/**
 * A file (spec §7 File): in a message, a task comment or a project. `name` is the uploaded file's; `title` and
 * `description` are what Edit file details sets (spec 6.9). The bytes open through `api.files.url(id)`.
 */
export type Attachment = {
  id: string; name: string; mimeType: string; size: number; createdAt: string
  uploadedBy: string; title: string; description: string
  scanStatus: ScanStatus
  /** Made by the backend: a small image, and a preview it converted (office files); null when there's none. */
  thumbUrl: string | null; previewUrl: string | null
  /** Set once it's deleted: where it was shared says "This file was deleted." */
  deletedAt: string | null
  /** A text snippet (spec 6.9): a .txt file shown as code in this language; null for any other file. */
  snippet: { language: CodeLanguage } | null
}
/** A snippet's Type (spec 6.9). */
export type CodeLanguage = 'text' | 'bash' | 'csharp' | 'css' | 'html' | 'javascript' | 'json' | 'markdown' | 'python' | 'sql' | 'typescript' | 'yaml'
export type FilePatch = Partial<Pick<Attachment, 'title' | 'description'>>
/** Where a file is shared, as I may see it (spec 6.9 File details: Shared in, Access). */
export type FileDetails = {
  file: Attachment
  /** Messages and thread replies in channels I can read, oldest first. */
  sharedIn: { channelId: string; messageId: string; replyId: string | null; at: string }[]
  /** Tasks whose comments carry it, and projects that list it, that I'm on. */
  taskKeys: string[]
  projectIds: string[]
}
/** An upload's progress (0 to 1) as the bytes go up; `signal` cancels it. */
export type UploadOptions = { onProgress?: (fraction: number) => void; signal?: AbortSignal }
export type CommentKind = 'comment' | 'bug'
export type Comment = {
  id: string; taskId: string; projectId: string; authorId: string; kind: CommentKind; body: string; attachmentIds: string[]; createdAt: string
  editedAt?: string | null; deletedAt?: string | null
}
export type ProjectFile = { id: string; projectId: string; attachmentId: string; uploadedBy: string; createdAt: string }
// userId | project key | task key | 'all' (@channel, spec 6.8; `@all` reads the same) | 'here' (the channel's active members)
export type Mention = { kind: 'user' | 'project' | 'task' | 'all' | 'here'; id: string }
export type Reaction = { emoji: string; userIds: string[] }

export type ChannelKind = 'channel' | 'dm'
export type Channel = {
  id: string; workspaceId: string; kind: ChannelKind
  name: string | null                                    // null for DMs; the UI names a DM after the other member
  topic: string; memberIds: string[]; isPrivate: boolean
  lastMessageAt: string | null; unreadCount: number      // unreadCount is per the current user
  /** Set while archived: read-only until restored. A project's channel is archived with its project. */
  archivedAt?: string | null
  /** The seq of the channel's newest message (0 when empty). */
  lastSeq: number
  /** What it's for, at most 250 characters ('' when not set; spec 6.10 About). */
  description: string
  /** Who may post new messages and replies (spec §9): Admins choose it. */
  whoCanPost: WhoCanPost
  /** New people in the workspace join it (spec 6.10, a default channel): Admins choose it, public channels only. */
  isDefault: boolean
} & ChannelMemberState

export type WhoCanPost = 'everyone' | 'admins'

/**
 * An email invite to a channel from Add people (spec 6.10, §7 Invitation). Every one is a guest for now (the spec's
 * "guest or member, by workspace policy" waits for a policy); it stays pending until it's accepted from the email.
 */
export type Invitation = {
  id: string; workspaceId: string; channelId: string
  /** Trimmed and lowercased. */
  email: string
  role: 'guest'
  invitedBy: string; createdAt: string
  status: 'pending' | 'accepted' | 'revoked'
}

export type NotifyLevel = 'all' | 'mentions' | 'none'
/** The current user's own state in a channel (spec §7 ChannelMember). Everyone starts at nothing read, nothing set. */
export type ChannelMemberState = { lastReadSeq: number; starred: boolean; muted: boolean; notifyLevel: NotifyLevel }

export type ChatMessage = {
  id: string; channelId: string; senderId: string; content: string
  /** Its place in the channel: 1, 2, 3… in the order the server stored them. Ordering and read state go by it. */
  seq: number
  /** The id the sender's client made up for it, so a retried send stores it once. */
  /** Who its @here reached: the channel's other members who were active when it was sent (spec 6.8). */
  hereIds?: string[]
  clientId?: string
  /** The text as structured rich text (spec §7); `content` is the text as written, for search and editing. */
  body: Body
  /** Who replied last, newest first, at most 5 (worked out on read, not stored). */
  replyUserIds?: string[]
  /** Set on what the channel itself says (joined, left, renamed, topic changed); sent by whoever did it. */
  system?: SystemEvent
  attachments: Attachment[]; reactions: Reaction[]
  threadCount: number; lastReplyAt: string | null
  linkedTicketKeys: string[]; mentions: Mention[]; editedAt: string | null; createdAt: string
  /** Set on the card a task comment or bug posts in its project's chat. */
  commentId?: string
  /** Set on the card a task change posts in its project's chat. */
  taskEvent?: TaskEvent
  /** Set once the author deletes it: the row stays (its thread too) with its text, files, mentions and reactions gone. */
  deletedAt?: string | null
  /**
   * Whether I follow its thread (spec 6.7), worked out per person on read: my own choice, else whether I wrote it,
   * replied to it, or was mentioned by name in it or a reply.
   */
  following?: boolean
  /**
   * Set on a thread reply also sent to the channel (spec 6.7): it shows here with its root's first line. Its `id` is
   * the reply's, and its edits, deletes and reactions go to the reply (`/api/replies/:id`).
   */
  broadcast?: { rootId: string; rootText: string }
  /** Who pinned it to the channel, and when (spec 6.5, §7 Pin); worked out on read. */
  pin?: { by: string; at: string } | null
  /** Set on what Flowbot sends (spec 5.1 Apps): what it is about, for the card it shows. */
  flowbot?: FlowbotNote
}

/** What a Flowbot message is about: a reminder that fired, or a scheduled message that couldn't be sent. */
export type FlowbotNote =
  /** `rootId`: the thread a reminded reply is in, for the card's link. */
  | { kind: 'reminder'; savedId: string; channelId: string; rootId: string | null; target: SavedTarget }
  | { kind: 'scheduleFailed'; scheduledId: string }

export type SavedStatus = 'inProgress' | 'archived' | 'completed'

/**
 * A message or reply I saved (spec §7 SavedItem; 6.12 Saved), one per target. Remind me sets `remindAt` on it (spec
 * 6.5: "Reminders also appear in Saved"); the scheduler fires it once (`firedAt`) as a Flowbot DM and an Activity item.
 */
export type SavedItem = {
  id: string; userId: string; workspaceId: string; target: SavedTarget
  status: SavedStatus
  remindAt: string | null; firedAt: string | null
  savedAt: string
}

/** A saved item as the Saved view shows it, worked out on read. */
export type SavedView = SavedItem & {
  channelId: string | null
  /** The thread a saved reply opens in. */
  rootId: string | null
  authorId: string | null; authorName: string | null
  /** The text as people read it; '' when it's gone. */
  text: string
  /** When the message was sent. */
  createdAt: string | null
  /** The message was deleted, or I can no longer read its channel. */
  gone: 'deleted' | 'hidden' | null
}

/**
 * A message to send later (spec §7 ScheduledMessage), to a channel or, with `rootId`, into a thread. The scheduler
 * sends it at `sendAt` as its author; if they can no longer post there it fails with the reason, and Flowbot says so.
 */
export type ScheduledMessage = {
  id: string; userId: string; workspaceId: string; channelId: string; rootId: string | null
  content: string; body: Body
  sendAt: string
  /** The author's time zone when they scheduled it, for "Sends tomorrow at 9:00 AM". */
  tz: string
  status: 'scheduled' | 'sent' | 'failed'
  /** The message or reply it became. */
  sentId: string | null
  failure: string | null
}

/** A person's own choice to follow a thread or not (spec §7 ThreadFollow); without one, the defaults decide. */
export type ThreadFollow = { userId: string; rootId: string; following: boolean }

/** Text I started and haven't sent, kept on the server so it follows me between devices (spec 6.8). */
export type Draft = { channelId: string; rootId: string | null; body: Body; updatedAt: string }

/** Something I sent (spec 6.12 Drafts & sent: Sent): a message or reply, where it went, and its text. */
export type SentItem = { target: ChatTarget; channelId: string; rootId: string | null; text: string; createdAt: string }

/** What a link's preview card shows. `image` is an https address or null. */
export type LinkPreview = { url: string; siteName: string; title: string; description: string | null; image: string | null }

/** A channel event shown in its timeline (spec 6.3 system messages). */
export type SystemEvent =
  | { kind: 'joined' | 'left' }
  | { kind: 'renamed'; from: string; to: string }
  | { kind: 'topic'; to: string }
  | { kind: 'added'; userIds: string[] }
  | { kind: 'removed'; userId: string }
  | { kind: 'pinned'; messageId: string }

/** What a task event card says: the task, and what happened to it. */
/** `statusLabel` is the column's name when the card was posted (renaming or deleting it later doesn't change the card). */
export type TaskEvent = { key: string; kind: 'created' | 'assigned' | 'status' | 'done'; status?: TicketStatus; statusLabel?: string; assigneeId?: string }

/** What a project's history records. */
export type ActivityKind =
  | 'task.created' | 'task.changed' | 'task.moved' | 'task.archived' | 'task.restored'
  | 'comment.added' | 'comment.edited' | 'comment.deleted'
  | 'column.added' | 'column.renamed' | 'column.moved' | 'column.typed' | 'column.deleted'
  | 'phase.added' | 'phase.changed' | 'phase.removed'
  | 'project.changed' | 'deliverable.added' | 'deliverable.changed'
  | 'file.removed' | 'deliverable.removed' | 'project.archived' | 'project.restored'
/** One field's change; labels are snapshots (a column, phase or sprint may be gone by the time it is read). */
export type FieldChange = { field: string; from: string | null; to: string | null; fromLabel?: string; toLabel?: string }
/** One line of history: who did what to which task (or the board, a phase, a deliverable), and when. Never edited. */
export type ActivityEntry = {
  id: string; projectId: string; taskKey: string | null; actorId: string; at: string; kind: ActivityKind
  changes: FieldChange[]
  /** The column, phase or deliverable's name, or a comment's kind ('comment' | 'bug'). */
  subject?: string
  /** How many tasks a column delete moved. */
  count?: number
}

/** A message or a thread reply, for the actions both have (react, edit, delete). */
export type ChatTarget = { kind: 'message' | 'reply'; id: string }
/** A message pinned to its channel (spec §7 Pin). */
export type Pin = { channelId: string; messageId: string; pinnedBy: string; pinnedAt: string }
/** The Pins tab's row: the message as the channel shows it, and who pinned it when. */
export type PinnedMessage = { message: ChatMessage; pinnedBy: string; pinnedAt: string }
/** A /remind reminder (spec 6.8): words to be reminded of, and the channel it was set in; no message. */
export type NoteTarget = { kind: 'note'; text: string; channelId: string }
/** What a saved item is about: a message or reply, or a /remind note. */
export type SavedTarget = ChatTarget | NoteTarget

export type ThreadReply = {
  id: string; messageId: string; channelId: string; senderId: string; content: string
  attachments: Attachment[]; reactions: Reaction[]; mentions: Mention[]; createdAt: string
  editedAt?: string | null; deletedAt?: string | null
  body: Body
  /** Also sent to the channel (spec 6.7): then it has a `seq` there too, and shows in the channel's list. */
  alsoInChannel?: boolean
  seq?: number
  /** Who its @here reached: the channel's other members who were active when it was sent (spec 6.8). */
  hereIds?: string[]
  /** The sender's id for the write (spec §8): a retry with it returns this reply instead of storing another. */
  clientId?: string
}

// ── Transport ─────────────────────────────────────────────────────────────
/**
 * One page of a list. `nextCursor` is opaque: clients pass it back unchanged as the next request's cursor and never
 * build or read it. It is null on the last page. Messages come newest first.
 */
export type Page<T> = { items: T[]; nextCursor: string | null }
export type ProblemDetails = { title: string; status: number; detail?: string }

// ── Derived shapes ────────────────────────────────────────────────────────
/** A channel as stored: unreadCount, lastSeq and the member state are worked out per user, never saved on it. */
export type StoredChannel = Omit<Channel, 'unreadCount' | 'lastSeq' | keyof ChannelMemberState>

/** A new channel; you are always one of its members. */
export type NewChannel = { workspaceId: string; name: string; topic: string; isPrivate: boolean; memberIds: string[] }
/** A channel's details; its people change through addMembers and removeMember. */
export type ChannelPatch = Partial<Pick<Channel, 'name' | 'topic' | 'description' | 'whoCanPost' | 'isDefault'>>

export type NewTicket = Pick<
  Ticket,
  'projectId' | 'title' | 'description' | 'status' | 'priority' | 'storyPoints' | 'assigneeId' | 'sprintId'
> &
  Partial<Pick<Ticket, 'linkedChannelId' | 'linkedMessageId' | 'phaseId' | 'type' | 'dueAt' | 'estimateHours'>>

export type TicketPatch = Partial<
  Pick<
    Ticket,
    'title' | 'description' | 'status' | 'priority' | 'storyPoints' | 'assigneeId' | 'sprintId' | 'rank' | 'phaseId' | 'type' | 'dueAt' | 'estimateHours'
  >
>

// ── The api object (src/lib/api.ts) ───────────────────────────────────────
// ── Writes (M1) ───────────────────────────────────────────────────────────
export type NewProject = Pick<
  Project,
  'workspaceId' | 'name' | 'key' | 'clientName' | 'description' | 'links' | 'managerId' | 'memberIds' | 'teamIds' | 'methodology' | 'startDate' | 'dueDate'
>
export type ProjectPatch = Partial<
  Pick<Project, 'name' | 'clientName' | 'description' | 'links' | 'managerId' | 'memberIds' | 'teamIds' | 'status' | 'startDate' | 'dueDate' | 'logoFileId'>
>
export type NewPhase = Pick<Phase, 'projectId' | 'name' | 'startDate' | 'dueDate'>
export type PhasePatch = Partial<Pick<Phase, 'name' | 'startDate' | 'dueDate' | 'status'>>
export type NewDeliverable = Pick<Deliverable, 'projectId' | 'phaseId' | 'title' | 'dueDate'>
export type DeliverablePatch = Partial<Pick<Deliverable, 'phaseId' | 'title' | 'dueDate' | 'doneAt'>>
/** A project file with its details. */
export type StoredFile = ProjectFile & { attachment: Attachment }
/** What an upload hands over: the bytes plus the file's name (a File in the browser). */
export type UploadFile = Blob & { name: string }
/** A task comment or bug with its files' details. */
export type CommentView = Comment & { attachments: Attachment[] }
export type ReportPeriod = 7 | 30 | 90
export type ReportRow = { hours: number; cost: number }
/** Hours and cost for a period (Admin only), by project, person and week; the groupings add up to the totals. */
export type TimeReport = {
  from: string; to: string
  totals: ReportRow & { people: number }
  byProject: (ReportRow & { projectId: string })[]       // most hours first
  byPerson: (ReportRow & { userId: string; rate: number })[]
  byWeek: (ReportRow & { weekStart: string })[]           // oldest first, every week in range
}
/** A project as the manager dashboard shows it. */
export type DashboardProject = ProjectSummary & {
  phaseName: string | null                        // the current phase; null when every phase is done or there are none
  estimateHours: number | null                    // Σ task estimates; null when no task has one
  estimatedLoggedHours: number                    // hours logged on the tasks that have an estimate (what "over" compares)
  week: { userId: string; hours: number }[]       // the last 7 days, most hours first
}
/** Someone checked in today and not out yet, with their running timer. */
export type CheckedInNow = { userId: string; since: string; running: { taskId: string | null; projectId: string; startedAt: string } | null }
/** One mention of me: a message, a thread reply or a task comment, with where it opens. */
export type MentionItem = {
  id: string; source: 'message' | 'reply' | 'comment'; authorId: string; excerpt: string; createdAt: string; read: boolean
  workspaceId: string                                    // where it opens; the bell lists every workspace's
  authorName: string                                     // so a mention from another workspace still names its author
  channelId: string | null; messageId: string | null; taskKey: string | null; projectId: string | null
}
/** What an Activity row is about (spec 6.12): a mention of me, a reaction to mine, a reply in a thread I follow, a reminder. */
export type ActivityItemKind = 'mention' | 'reaction' | 'thread' | 'reminder'
/**
 * One Activity row, newest first. `messageId` is the message (a thread's root for a reply); `replyId` the reply,
 * when it's about one. A mention in a task comment has `taskKey` and `projectId` instead of a channel.
 */
export type ActivityItem = {
  id: string; kind: ActivityItemKind; read: boolean; createdAt: string; workspaceId: string
  actorId: string; actorName: string
  channelId: string | null; messageId: string | null; replyId: string | null; taskKey: string | null; projectId: string | null
  /** The text it's about, as people read it (`@Name`), cut to 120 characters. */
  excerpt: string
  /** A reaction's emoji; null otherwise. */
  emoji: string | null
}
/** A project's time: every entry, and the hourly costs only for people who may see cost (else null). */
export type ProjectTime = { entries: TimeEntry[]; rates: Rate[] | null }
/** What a timer or a manual entry is for: a task (its project follows), or a project as a whole. */
export type TimeTarget = { taskId: string } | { projectId: string }
/**
 * My day: today's check-in, a check-in still open from an earlier day (forgot to check out), my running entry (from
 * any day) and my entries that started today, newest first.
 */
export type MyDay = { day: string; checkIn: CheckIn | null; openCheckIn: CheckIn | null; running: TimeEntry | null; entries: TimeEntry[] }
export type NewManualEntry = TimeTarget & { startedAt: string; endedAt: string; note: string }
/** A change to a closed entry; `target` moves it to another task or project. */
export type TimeEntryPatch = Partial<Pick<NewManualEntry, 'startedAt' | 'endedAt' | 'note'>> & { target?: TimeTarget }

/** Everything in the mock database, as Database → Export data downloads it. File bytes are not included (spec §10). */
export type ExportBundle = { app: 'spark-flow'; version: number; exportedAt: string; data: unknown }

export interface Api {
  workspaces: { list(): Promise<Workspace[]> }
  users: {
    me(): Promise<User>
    list(workspaceId: string): Promise<User[]>
    /** Demo only: act as another seeded person. Hidden when backendOn. */
    viewAs(userId: string): Promise<User>
  }
  chat: {
    channels(workspaceId: string): Promise<Channel[]>
    channel(id: string): Promise<Channel>
    messages(channelId: string, cursor?: string): Promise<Page<ChatMessage>>
    /** Messages older than `seq`, 30 at a time, newest first (a jump paging back); nextCursor goes on with messages(). */
    messagesBefore(channelId: string, seq: number): Promise<Page<ChatMessage>>
    /** Messages newer than the cursor (a seq), 30 at a time, newest first; nextCursor continues toward the newest. */
    messagesAfter(channelId: string, cursor: string): Promise<Page<ChatMessage>>
    /** A preview card for a link on an allowed domain (spec 6.3); null for any other link or a page with nothing to show. */
    linkPreview(url: string): Promise<LinkPreview | null>
    /** The seq of the first message at or after `since` (the first message when null); null when there is none. */
    jumpTarget(channelId: string, since: string | null): Promise<number | null>
    message(id: string): Promise<ChatMessage>
    replies(messageId: string): Promise<ThreadReply[]>
    /** Moves my read marker forward to `seq` (default: the newest message); it never moves back. */
    markRead(channelId: string, seq?: number): Promise<void>
    /** Mark unread (U): moves my read marker to just before message `seq`, back or forward. */
    markUnread(channelId: string, seq: number): Promise<void>
    /**
     * Posts as the current user; mentions are worked out from the text. The same `clientId` again returns the first
     * message. `fileIds`: files I uploaded (uploadForChat), up to 10; with files the text may be empty.
     */
    send(channelId: string, content: string, clientId?: string, body?: Body, fileIds?: string[]): Promise<ChatMessage>
    /** My drafts in a workspace's channels (spec 6.8): one per channel and thread root. */
    drafts(workspaceId: string): Promise<Draft[]>
    /** What I sent in a workspace (spec 6.12 Sent): messages and replies I can still read, newest first, at most 50. */
    sent(workspaceId: string): Promise<SentItem[]>
    /** Saves my draft for a channel (or a thread in it); an empty body deletes it and returns null. */
    saveDraft(channelId: string, body: Body, rootId?: string | null): Promise<Draft | null>
    /** From the rich composer with its `body`; `alsoInChannel` also sends it to the channel (spec 6.7). */
    reply(messageId: string, content: string, body?: Body, alsoInChannel?: boolean, fileIds?: string[], clientId?: string): Promise<ThreadReply>
    /** Get notified about replies, or turn it off (spec 6.7): my own choice for a thread's root message. */
    setFollowing(messageId: string, following: boolean): Promise<void>
    /** What this channel tells me about (spec 6.11): all new messages, my mentions, or nothing. Mine only. */
    setNotifyLevel(id: string, level: NotifyLevel): Promise<Channel>
    /** Adds the current user's reaction, or takes it back if it's there; only the emoji in REACTIONS. */
    /** Puts my reaction on (`on`) or takes it off: a set, so a retry changes nothing (spec §8). */
    react(target: ChatTarget, emoji: string, on: boolean): Promise<void>
    /** The author's own plain message or reply; mentions and task keys are worked out again. */
    /** From the rich composer with its `body` (the content is then its plain text). */
    edit(target: ChatTarget, content: string, body?: Body): Promise<ChatMessage | ThreadReply>
    /** The author's own plain message or reply; the row stays and reads as deleted. */
    remove(target: ChatTarget): Promise<void>
    /** Undo of a delete (spec 6.3): by whoever deleted it, within a few seconds. */
    restore(target: ChatTarget): Promise<void>
    /** A conversation with these people (you plus 1–8 others); the same people get the existing one back. */
    openDm(workspaceId: string, userIds: string[]): Promise<Channel>
    /** Anyone can open a channel; a private one lists only its members. */
    createChannel(input: NewChannel): Promise<Channel>
    /** Its members and admins; not a project's channel or a DM. */
    updateChannel(id: string, patch: ChannelPatch): Promise<Channel>
    /** Its members and admins; not a project's channel (it follows its project) or a DM. Read-only until restored. */
    archiveChannel(id: string): Promise<Channel>
    restoreChannel(id: string): Promise<Channel>
    /** A public channel that isn't a project's: I become a member (it shows in my sidebar). */
    join(id: string): Promise<Channel>
    /** Not a project's channel (its members follow the project) or a DM. */
    leave(id: string): Promise<Channel>
    /**
     * Its members and admins add people from the workspace, and Admins invite emails as guests, in one write; not a
     * project's channel or a DM (spec 6.10). The email of someone in the workspace adds that person.
     */
    addMembers(id: string, userIds: string[], emails?: string[]): Promise<Channel>
    /** The pending email invites to a channel, oldest first, for whoever may change it (spec 6.10 Members). */
    invitations(channelId: string): Promise<Invitation[]>
    /** Whoever sent it, or an Admin. */
    revokeInvitation(id: string): Promise<void>
    /** Its members and admins take someone else off it (I leave instead); not a project's channel or a DM. */
    removeMember(id: string, userId: string): Promise<Channel>
    /** My own star and mute on a channel I can read. */
    setStarred(id: string, starred: boolean): Promise<Channel>
    setMuted(id: string, muted: boolean): Promise<Channel>
  }
  tickets: {
    sprints(projectId: string): Promise<Sprint[]>
    /** The project's tasks; archived ones only with `archived: true` (and then only those). */
    list(projectId: string, opts?: { archived?: boolean }): Promise<TaskView[]>
    /** Also finds an archived task, so old links still open it. */
    get(key: string): Promise<TaskView>
    /** The tasks behind these keys, as chips show them (spec 6.3); keys that aren't tasks are left out. */
    resolve(keys: string[]): Promise<TaskRef[]>
  }
  projects: {
    /** Archived projects are left out; `archived: true` lists only them. */
    list(workspaceId: string, opts?: { archived?: boolean }): Promise<ProjectSummary[]>
    get(workspaceId: string, key: string): Promise<ProjectSummary>
    create(input: NewProject): Promise<Project>
    update(id: string, patch: ProjectPatch): Promise<Project>
    /** The board's column names, order and types (not adding or dropping columns); the project's manager (and Admins). */
    setBoard(id: string, columns: BoardColumn[]): Promise<Project>
    /** A new column of a type, after `after` (else at the end); at most 10 columns. */
    addColumn(projectId: string, input: { label: string; category: StatusCategory; after?: string }): Promise<Project>
    /** Removes a column; its tasks move to `moveTo` in the same write. Each type keeps at least one column. */
    deleteColumn(projectId: string, columnId: string, moveTo: string): Promise<Project>
    /** Admins: archives the project and its channel and stops timers on its tasks; restore undoes both. */
    archive(id: string): Promise<Project>
    restore(id: string): Promise<Project>
  }
  phases: {
    list(projectId: string): Promise<Phase[]>
    create(input: NewPhase): Promise<Phase>
    update(id: string, patch: PhasePatch): Promise<Phase>
    remove(id: string): Promise<void>
    reorder(projectId: string, ids: string[]): Promise<Phase[]>
  }
  deliverables: {
    list(projectId: string): Promise<Deliverable[]>
    create(input: NewDeliverable): Promise<Deliverable>
    update(id: string, patch: DeliverablePatch): Promise<Deliverable>
    remove(id: string): Promise<void>
  }
  tasks: {
    create(input: NewTicket): Promise<TaskView>
    update(key: string, patch: TicketPatch): Promise<TaskView>
    /** Into column `status` at `index` among `visibleKeys` (the cards shown), renumbering that column in the same write. */
    moveTo(key: string, status: string, index: number, visibleKeys?: string[]): Promise<TaskView>
    /** The project's manager (and Admins); a running timer on it stops. */
    archive(key: string): Promise<TaskView>
    restore(key: string): Promise<TaskView>
  }
  teams: { list(workspaceId: string): Promise<Team[]> }
  time: {
    list(projectId: string): Promise<ProjectTime>
    today(): Promise<MyDay>
    /** Once per day; with a target it starts a timer too. */
    checkIn(input: { plan: string; target?: TimeTarget }): Promise<MyDay>
    /** Closes the latest open check-in and stops the running timer. */
    checkOut(): Promise<MyDay>
    /** Reopens today's check-in after a check-out by mistake; the stopped timer stays stopped. */
    undoCheckOut(): Promise<MyDay>
    /** One running timer per person: starting stops the last. */
    start(target: TimeTarget): Promise<MyDay>
    stop(): Promise<MyDay>
    addManual(entry: NewManualEntry): Promise<TimeEntry>
    /** Mine (or anyone's, for an Admin), once stopped; checked like a new entry. */
    update(id: string, patch: TimeEntryPatch): Promise<TimeEntry>
    remove(id: string): Promise<void>
    /** The Time & cost page (Admin only): the last `days` days, ending now. */
    /** `projectId` narrows everything to that project (archived ones too). */
    report(workspaceId: string, days: ReportPeriod, opts?: { projectId?: string }): Promise<TimeReport>
  }
  files: {
    url(id: string): Promise<string>
    list(projectId: string): Promise<StoredFile[]>
    /** `signal` cancels it; a cancelled upload saves nothing and rejects with an AbortError. */
    upload(projectId: string, file: UploadFile, signal?: AbortSignal): Promise<StoredFile>
    /** Takes a file off a project, by whoever added it, the project's manager or an Admin. */
    removeFromProject(projectId: string, fileId: string): Promise<void>
    /**
     * Uploads a file for a message in `channelId` (spec §8): an upload link, the bytes, then complete, when the server
     * checks its type and scans it. A cancelled upload saves nothing and rejects with an AbortError.
     */
    /** `snippet`: the file is a text snippet in that language (spec 6.9); its title is its name without .txt. */
    uploadForChat(channelId: string, file: UploadFile, options?: UploadOptions & { snippet?: { language: CodeLanguage } }): Promise<Attachment>
    /** Who uploaded it and where it's shared, for whoever may see it somewhere. */
    details(id: string): Promise<FileDetails>
    /** Edit file details: whoever uploaded it, or an Admin. */
    update(id: string, patch: FilePatch): Promise<Attachment>
    /** Whoever uploaded it, or an Admin: it goes from everywhere it's shared. */
    delete(id: string): Promise<void>
    /** Posts it in another channel or DM I can post in, with an optional message. */
    share(id: string, channelId: string, content?: string): Promise<ChatMessage>
  }
  /** Task comments and bugs (spec §2): each also posts a card in the project's chat. */
  comments: {
    list(taskKey: string): Promise<CommentView[]>
    create(input: { taskKey: string; kind: CommentKind; body: string; files: UploadFile[] }): Promise<CommentView>
    /** The author's own; its card in the chat follows. Files stay as they are. */
    update(id: string, body: string): Promise<CommentView>
    /** The author's own; it (and its card) stays as a "deleted" placeholder. */
    remove(id: string): Promise<void>
  }
  /** A task's and a project's history (who changed what, when); everyone who can open the project. */
  activity: {
    forTask(key: string): Promise<ActivityEntry[]>
    forProject(projectId: string, cursor?: string): Promise<Page<ActivityEntry>>
  }
  /** Mentions of me (spec §5: the bell and Home), newest first, at most 50; read state is per person. */
  mentions: { mine(): Promise<MentionItem[]>; markRead(ids: string[]): Promise<void> }
  /** My Activity in a workspace (spec 6.12): mentions, reactions to mine, replies in threads I follow. */
  inbox: {
    list(workspaceId: string): Promise<ActivityItem[]>
    /** Marks these items read; without ids, all of mine in the workspace. A mention's read state is the bell's. */
    markRead(workspaceId: string, ids?: string[]): Promise<void>
  }
  /** My messages to send later (spec 6.8 Schedule menu, 6.12 Drafts & sent). */
  /** Pins (spec 6.5, 6.1 Pins tab): whoever may post in the channel pins and unpins its messages. */
  pins: {
    /** Newest pin first; the channel must be one I can read. */
    list(channelId: string): Promise<PinnedMessage[]>
    /** Pins a message (again is fine) and posts "pinned a message". */
    pin(messageId: string): Promise<void>
    unpin(messageId: string): Promise<void>
  }
  scheduled: {
    /** Those still to go out, and failed ones, soonest first. */
    list(workspaceId: string): Promise<ScheduledMessage[]>
    /** Checks what a send would (who may post, the text) now, as well as the time. */
    create(input: { channelId: string; rootId: string | null; body: Body; sendAt: string; tz: string }): Promise<ScheduledMessage>
    /** Reschedule (a failed one goes back to scheduled) or edit the text. */
    update(id: string, patch: { sendAt?: string; body?: Body }): Promise<ScheduledMessage>
    remove(id: string): Promise<void>
    /** Sends it now: the new message or reply. A refusal says why and keeps it. */
    sendNow(id: string): Promise<ChatMessage | ThreadReply>
  }
  /** My saved messages and replies, and their reminders (spec 6.12 Saved, 6.5 Remind me). */
  saved: {
    list(workspaceId: string): Promise<SavedView[]>
    /** Saves it In progress (again, if it was saved before); with `remindAt`, also sets its reminder. */
    save(target: ChatTarget, remindAt?: string): Promise<SavedView>
    /** Complete, archive or bring back; a new reminder time (or null, none). Completing or archiving cancels it. */
    update(id: string, patch: { status?: SavedStatus; remindAt?: string | null }): Promise<SavedView>
    remove(id: string): Promise<void>
    /** /remind (spec 6.8): a reminder about `text` at `remindAt`, set in a channel I can read; In progress. */
    note(channelId: string, text: string, remindAt: string): Promise<SavedView>
  }
  /** The manager dashboard (spec §5): Admin and Sales see every project, a PM the ones they manage. */
  dashboard: { projects(workspaceId: string): Promise<DashboardProject[]>; checkedIn(workspaceId: string): Promise<CheckedInNow[]> }
  /** Hourly cost per person: Admin only (spec §4.3). */
  rates: { list(): Promise<Rate[]>; update(userId: string, hourlyCost: number): Promise<Rate> }
  /** The Database page: mock only, hidden when backendOn. */
  db: { export(): Promise<ExportBundle>; import(bundle: unknown): Promise<void>; reset(): Promise<void> }
}
