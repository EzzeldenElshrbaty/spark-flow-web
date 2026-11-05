import type { FileKind } from '@/lib/fileTypes'
import type { Permission } from '@/lib/permissions'
import type { Body } from '@/lib/messageBody'

export type { Permission }

// ── Relational (PostgreSQL) ───────────────────────────────────────────────
export type Presence = 'active' | 'away' | 'offline'
/** A person. `roleIds`: the roles they hold, one or more; they get every permission of each (slice 1). */
/**
 * A person, company-wide. `deactivated` (slice 3) says when, by whom and why they were turned off; absent or null while
 * they're active. Their work, time and messages stay; they leave every picker and can't act.
 */
export type User = { id: string; name: string; email: string; title: string; roleIds: string[]; presence: Presence; teamIds: string[]; deactivated?: Deactivation | null }
export type Deactivation = { at: string; by: string; reason: string | null }
/** A person as Settings → Users lists them (slice 3): with when they last did anything, worked out on read. */
export type PersonRow = User & { lastActiveAt: string | null }
/** Add person (slice 3); Edit sends any of the same fields. Teams are the person's in every workspace. */
export type NewPerson = { name: string; email: string; title: string; roleIds: string[]; teamIds: string[] }
export type PersonPatch = Partial<NewPerson>

/** Someone to sign in as in the prototype (slice AB): their roles' names, Admin first. */
export type DemoPerson = { id: string; name: string; email: string; title: string; roles: string[] }

/** Archived records (slice 4): projects, tasks and channels. */
export type ArchivedType = 'project' | 'task' | 'channel'
/**
 * One archived record as Settings → Archived records lists it. `deletableFrom` is when it may be deleted for good
 * (archived + the retention days), null when it never may: `keptBecause` says why (time logged on it, or a channel,
 * which is restored only). `includes` counts what deleting it would take with it.
 */
export type ArchivedRecord = {
  type: ArchivedType; id: string; name: string
  /** The project's key, the task's key, or the channel's name. */
  ref: string
  projectId: string | null
  archivedAt: string; archivedBy: string | null; reason: string | null
  deletableFrom: string | null
  keptBecause: 'time' | 'channel' | null
  includes: { tasks: number; files: number; comments: number; phases: number; deliverables: number }
  /** Why the viewer can't restore it from the list (their rights, or a task's project still archived); null when they can. */
  restoreBlocked: string | null
}
export type ArchiveList = { items: ArchivedRecord[]; retentionDays: number }
/** Me, with every permission my roles give me, worked out by the server on each read. */
export type Me = User & { grants: Permission[] }
/**
 * A role (slice 1, spec §4.3): what it may do (`grants`) and how many people hold it (`holders`, worked out on read).
 * The four built-in roles ('admin', 'sales', 'pm', 'member') can be renamed and changed but not deleted.
 */
export type Role = { id: string; name: string; builtIn: boolean; grants: Permission[]; holders: number }
/** The audit log's five groups (slice 2), as its chips name them. */
export type AuditGroup = 'data' | 'status' | 'access' | 'settings' | 'exports'
export type AuditAction =
  | 'created' | 'changed' | 'deleted' | 'archived' | 'restored'
  | 'signedIn' | 'signInFailed' | 'signedOut' | 'denied'
  | 'exported' | 'downloaded' | 'imported' | 'reset'
  | 'deactivated' | 'reactivated'
export type AuditResult = 'done' | 'refused' | 'failed'
/** What an event is about, named as it was at the time. `type` is the kind of record ('project', 'role', 'request'…). */
export type AuditRecord = { type: string; id: string; name: string }
/** One field's change, both sides as people read them then ("Nour El-Sayed", "8 Nov 2026"); null is empty. */
export type AuditChange = { field: string; from: string | null; to: string | null }
/**
 * One entry of the audit log (slice 2): who did what to which record, when and from where. Entries are never changed
 * or removed. `hash` is SHA-256 over the entry and `prevHash` (the entry before it), so a changed, removed or
 * reordered entry breaks the chain (`lib/auditChain.ts`).
 */
export type AuditEvent = {
  seq: number
  at: string
  /** Null for someone not signed in (a failed sign-in). */
  actorId: string | null
  /** Their name then, or the email that was tried. */
  actorName: string
  /** Their roles then ("Admin, Sales"); "" when not signed in. */
  actorRoles: string
  action: AuditAction
  group: AuditGroup
  record: AuditRecord | null
  changes: AuditChange[]
  result: AuditResult
  /** What else there is to say: "Wrong password", the refusal's sentence, "Demo user switcher (prototype only)". */
  detail: string | null
  ip: string | null
  /** "Chrome 130 · macOS". */
  device: string | null
  requestId: string
  prevHash: string
  hash: string
}

/** What the audit log's list is narrowed to; `since` is an ISO time (the period's start), null for everything. */
export type AuditFilter = {
  q?: string
  since?: string | null
  actorId?: string | null
  recordType?: string | null
  result?: AuditResult | null
  group?: AuditGroup | null
}
/** A page of the log, newest first, 50 at a time; `counts` are the filter's totals per group (all groups for 'all'). */
export type AuditPage = { items: AuditEvent[]; nextCursor: string | null; counts: Record<'all' | AuditGroup, number> }
/** Something in the last 7 days worth a look: red for sign-in trouble and refusals, amber for rights and exports. */
export type AuditAlert = { tone: 'red' | 'amber'; text: string; at: string; seq: number }
/** The tamper check: the whole chain walked, and the first entry that doesn't fit when it's broken. */
export type AuditChainState =
  | { intact: true; checked: number }
  | { intact: false; checked: number; brokenAt: number; reason: 'edited' | 'removed' | 'reordered' }
/** The page's top: today's counts (from `todayFrom`), what needs a look, the chain, and what the filters offer. */
export type AuditSummary = {
  today: { events: number; data: number; signIns: number; failedSignIns: number; denied: number }
  needsALook: AuditAlert[]
  chain: AuditChainState
  people: { id: string; name: string }[]
  recordTypes: { id: string; label: string }[]
}

/**
 * What Save changes changed in one role: permissions to give and to take away, applied to the role as the server has
 * it, so another Admin's change to the same role in the meantime is kept.
 */
export type RoleChange = { roleId: string; add: Permission[]; remove: Permission[] }
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
  /** Who archived it and why (slice 4); absent on archives made before reasons were asked. */
  archivedBy?: string | null
  archiveReason?: string | null
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
  /** Who archived it and why (slice 4); absent on archives made before reasons were asked. */
  archivedBy?: string | null
  archiveReason?: string | null
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
/** Why a timer entry ended: Pause, Stop, the timer timeout, or Flow (the task went Done or was archived, the project archived, the person deactivated, the 12-hour limit). */
export type EndReason = 'paused' | 'stopped' | 'timeout' | 'flow'
export type TimeEntry = {
  id: string; userId: string; projectId: string; taskId: string | null
  startedAt: string; endedAt: string | null              // null = running
  source: 'timer' | 'manual'; note: string
  /** Null while running and on manual entries. */
  endReason: EndReason | null
  /** Where a timer start or resume came from; absent on manual entries and older ones. */
  startedFrom?: CheckSource | null
}
/** Where the browser said it was, to within `accuracy` metres. */
export type GeoFix = { lat: number; lng: number; accuracy: number }
/** A check's place: the browser's fix, 'blocked' when the person refused, 'none' when the device has none. */
export type CheckLocation = GeoFix | 'blocked' | 'none'
/** Where a check-in or check-out came from (slice 5): the server's IP and device, and the browser's place. */
export type CheckSource = { ip: string | null; device: string | null; location: CheckLocation }
export type CheckIn = {
  id: string; userId: string; day: string /* YYYY-MM-DD local */; checkedInAt: string; checkedOutAt: string | null; plan: string
  /** Absent on check-ins from before slice 5. */
  inFrom?: CheckSource | null
  outFrom?: CheckSource | null
  /** Flow closed it (a check-out forgotten on an earlier day, or deactivating): never counts as leaving early. */
  closedByFlow?: boolean
}
/** Time using Flow (slice 5): pings a minute apart, from one IP and device on one day, make one visit. */
export type Visit = { id: string; userId: string; day: string; startedAt: string; endedAt: string; minutes: number; ip: string | null; device: string | null }
/** What "late" and "left early" mean: working days (0 = Sunday), HH:MM start and end, in a time zone. */
export type WorkHours = { days: number[]; start: string; end: string; timeZone: string }
export type AttendancePeriod = 1 | 7 | 30 | 90
/** A period ending today, for one person or everyone the viewer may see. */
export type AttendanceQuery = { days: AttendancePeriod; userId?: string }
/** One check-in or check-out on Attendance. `newIp`/`newDevice`: different from that person's previous check. */
export type CheckEvent = {
  id: string; userId: string; kind: 'in' | 'out'; at: string
  ip: string | null; device: string | null; location: CheckLocation | null
  byFlow: boolean; newIp: boolean; newDevice: boolean
  /** In late or out early, by the working hours. */
  offHours: boolean
}
export type AttendanceDayRow = {
  userId: string; checkedInAt: string | null; checkedOutAt: string | null; byFlow: boolean
  hours: number; appMinutes: number; late: boolean; early: boolean
}
/** Per person for a period; average in and out are minutes after midnight in the working hours' time zone. */
export type AttendanceReportRow = {
  userId: string; daysIn: number; avgIn: number | null; avgOut: number | null
  late: number; early: number; hours: number; appMinutes: number
}
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
  /** The workspace folder it's filed in (spec 6.9 Add to folder, §7 folder_id); null for none. */
  folderId: string | null
}
/** A workspace folder for files (spec 6.9): one per file, shared by everyone in the workspace. */
export type Folder = { id: string; workspaceId: string; name: string; createdBy: string; createdAt: string }
/** A snippet's Type (spec 6.9). */
export type CodeLanguage = 'text' | 'bash' | 'csharp' | 'css' | 'html' | 'javascript' | 'json' | 'markdown' | 'python' | 'sql' | 'typescript' | 'yaml'
export type FilePatch = Partial<Pick<Attachment, 'title' | 'description' | 'folderId'>>
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
  /** Who archived it and why (slice 4); absent on archives made before reasons were asked. */
  archivedBy?: string | null
  archiveReason?: string | null
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
export type ChannelMemberState = {
  lastReadSeq: number; starred: boolean; muted: boolean
  /** The level that applies: my own for this channel, else my default (a DM: All) (spec 6.11). */
  notifyLevel: NotifyLevel
  /** Whether I picked the level in this channel; otherwise it follows my default. */
  notifyLevelOwn: boolean
}

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
  /** Whether I muted its thread (slice AA), per person on read. */
  threadMuted?: boolean
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
  /** A saved file: the file, and the message it was first shared in that I can read (null for a reply's). */
  file?: Attachment | null
  messageId?: string | null
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
/** `muted` (slice AA): still followed, but its replies stop counting as new and reaching me, unless they mention me. */
export type ThreadFollow = { userId: string; rootId: string; following: boolean; muted?: boolean }

/** Text I started and haven't sent, kept on the server so it follows me between devices (spec 6.8). */
export type Draft = { channelId: string; rootId: string | null; body: Body; updatedAt: string }

/** Something I sent (spec 6.12 Drafts & sent: Sent): a message or reply, where it went, and its text. */
export type SentItem = { target: ChatTarget; channelId: string; rootId: string | null; text: string; createdAt: string }

/** What a link's preview card shows. `image` is an https address or null. */
/**
 * What the server read from a linked page (spec 6.3): its og/twitter title, description and image, else its <title> and
 * meta description, else its address as the title. `image` is served by our API (never the site's own address), with
 * its size so the card can lay out before it loads.
 */
export type LinkPreview = { url: string; title: string; description: string | null; image: { url: string; width: number; height: number } | null }

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
/**
 * A thread I follow, as the Threads view shows it (spec 6.12): its parent, the replies shown (the unread ones, at least 2
 * and at most 10, oldest first), how many there are and how many I haven't read, and who is in it (newest first, at
 * most 5, the parent's author last).
 */
export type ThreadCard = {
  root: ChatMessage; channelId: string; replies: ThreadReply[]
  totalReplies: number; unreadCount: number; participantIds: string[]; lastReplyAt: string
  /** I muted it (slice AA): only mentions of me count as new. */
  muted: boolean
}
/** A page of threads, unread first; `unreadThreads` counts every followed thread with unread replies (the sidebar's). */
export type ThreadsPage = { items: ThreadCard[]; nextCursor: string | null; unreadThreads: number }

/** Search's tabs and sort (spec 6.12). */
export type SearchTab = 'messages' | 'files' | 'tasks' | 'channels' | 'people'
export type SearchSort = 'relevant' | 'newest'
/**
 * One search, as the client sends it (§8 `GET /search`): the words and "phrases" as text, and the filters the page
 * resolved from the query (`from` people and `in` a channel by id). Dates are days, YYYY-MM-DD, in `tz`.
 */
export type SearchRequest = {
  q: string; tab: SearchTab; sort: SearchSort
  from: string[]; in: string | null; has: 'file' | 'link' | 'pin' | 'reaction' | null; thread: boolean
  after: string | null; before: string | null
  /** The viewer's time zone (IANA), whose days `after` and `before` name. */
  tz: string
  cursor?: string
}
/** A message or reply that matched: its plain text (the page highlights it), where it is, and who wrote it when. */
export type MessageHit = {
  kind: 'message'; target: ChatTarget; channelId: string; rootId: string | null
  senderId: string; text: string; createdAt: string
}
export type SearchHit =
  | MessageHit
  | { kind: 'file'; file: Attachment; channelId: string; messageId: string; replyId: string | null; senderId: string; at: string }
  | { kind: 'task'; task: TaskRef }
  | { kind: 'channel'; channel: Channel }
  | { kind: 'person'; user: User }
/** A page of one tab's results, with every tab's count for the same search. */
export type SearchResults = { counts: Record<SearchTab, number>; items: SearchHit[]; nextCursor: string | null }

/** The sidebar sections people order by dragging (spec 5.1), and my order for each: channel ids (project ids for
 * Projects), empty for none. */
export type SidebarSection = 'starred' | 'channels' | 'projects'
export type SidebarOrder = Record<SidebarSection, string[]>

/** How often the email digest of missed mentions goes out (spec 6.11). */
export type EmailDigest = 'off' | 'hourly' | 'daily'
/** Do Not Disturb's daily schedule (spec 6.11): from and to as HH:MM in `tz`, on these days (0 = Sunday). */
export type DndSchedule = { on: boolean; from: string; to: string; days: number[]; tz: string }
/** My notification preferences (spec 6.11, §7 NotificationPref), the same in every workspace. */
export type Preferences = {
  /** What channels tell me about until I pick a level in one; DMs stay All. */
  defaultLevel: NotifyLevel
  /** Words that count like a mention of me (at most 20, each 1–40 characters). */
  keywords: string[]
  desktop: boolean
  push: boolean
  emailDigest: EmailDigest
  /** Notifications paused until then; null when not paused. */
  dndUntil: string | null
  dndSchedule: DndSchedule
}

export type ChatTarget = { kind: 'message' | 'reply'; id: string }
/** The Files tab's filters (spec 6.1): a type, who shared it, since when; `cursor` for the next 50. */
export type ChannelFileFilter = { type?: FileKind; from?: string; since?: string; folderId?: string; cursor?: string }
/** A file as the Files tab lists it: the file, who shared it, when, and the message (or reply) it's in. */
export type ChannelFile = { file: Attachment; senderId: string; at: string; messageId: string; replyId: string | null }
/** A file I may add to a message from Flow (spec 6.8): the file, and where it is (a channel I read, or a project). */
export type ShareableFile = { file: Attachment; channelId: string | null; projectId: string | null }
/** A link in a channel's tabs row (spec 6.1 +, §7 Bookmark): http or https only, in the order added. */
export type Bookmark = { id: string; channelId: string; title: string; url: string; createdBy: string; createdAt: string }
/** A message pinned to its channel (spec §7 Pin). */
export type Pin = { channelId: string; messageId: string; pinnedBy: string; pinnedAt: string }
/** The Pins tab's row: the message as the channel shows it, and who pinned it when. */
export type PinnedMessage = { message: ChatMessage; pinnedBy: string; pinnedAt: string }
/** A /remind reminder (spec 6.8): words to be reminded of, and the channel it was set in; no message. */
export type NoteTarget = { kind: 'note'; text: string; channelId: string }
/** A file saved for later (spec 6.9 file menu). */
export type FileTarget = { kind: 'file'; id: string }
/** What a saved item is about: a message or reply, a file, or a /remind note. */
export type SavedTarget = ChatTarget | FileTarget | NoteTarget

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
  /** Set when it isn't a mention of me but has one of my keywords (spec 6.11): which. */
  keyword: string | null
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
  /** A mention row that is one of my keywords instead (spec 6.11): which; absent or null otherwise. */
  keyword?: string | null
}
/** A project's time: every entry, and the hourly costs only for people who may see cost (else null). */
export type ProjectTime = { entries: TimeEntry[]; rates: Rate[] | null }
/** What a timer or a manual entry is for: a task (its project follows), or a project as a whole. */
export type TimeTarget = { taskId: string } | { projectId: string }
/**
 * My day: today's check-in, a check-in still open from an earlier day (forgot to check out), my running entry (from
 * any day) and my entries that started today, newest first.
 */
export type MyDay = {
  day: string; checkIn: CheckIn | null; openCheckIn: CheckIn | null; entries: TimeEntry[]
  /** Never checked in yet: the card says what checking in records. */
  firstCheckIn: boolean
  /** My timer: running, or paused today and ready to resume; null when there's none. */
  timer: MyTimer | null
  /** I've never started a timer that recorded where it came from: Start timer says what it records. */
  firstStart: boolean
}
/**
 * My timer (timer slice 1). A run is my newest timer entries on one target, back to one that ended 'stopped' or
 * 'flow', or ended before today: `runMs` is their closed time, and a running one adds `now − startedAt`.
 */
export type MyTimer = {
  state: 'running' | 'paused'; target: TimeTarget; projectId: string; entryId: string
  runMs: number; startedAt: string | null; pausedBy: 'me' | 'timeout' | null
}
export type NewManualEntry = TimeTarget & { startedAt: string; endedAt: string; note: string }
/** A change to a closed entry; `target` moves it to another task or project. */
export type TimeEntryPatch = Partial<Pick<NewManualEntry, 'startedAt' | 'endedAt' | 'note'>> & { target?: TimeTarget }

/** Everything in the mock database, as Database → Export data downloads it. File bytes are not included (spec §10). */
export type ExportBundle = { app: 'spark-flow'; version: number; exportedAt: string; data: unknown }

export interface Api {
  workspaces: { list(): Promise<Workspace[]> }
  users: {
    me(): Promise<Me>
    list(workspaceId: string): Promise<User[]>
    /** Demo only: act as another seeded person. Hidden when backendOn. */
    viewAs(userId: string): Promise<User>
    /**
     * Settings → Users (slice 3), all needing "Change settings, users and roles": everyone, active or not, with when
     * each was last active; add and edit; deactivate (not yourself, nor the last person who can change settings) and
     * reactivate. Each change sends `peopleChanged` and goes in the audit log.
     */
    directory(): Promise<PersonRow[]>
    create(input: NewPerson): Promise<User>
    update(id: string, patch: PersonPatch): Promise<User>
    deactivate(id: string, reason: string): Promise<User>
    reactivate(id: string): Promise<User>
  }
  /**
   * The audit log (slice 2). Reading and exporting it needs "See the audit log"; the export is recorded too. The two
   * notes record what the page hands out itself: in the prototype a file download and the Time and cost CSV; with the
   * backend on only the CSV, since the backend records a download when it serves the file.
   */
  audit: {
    list(filter: AuditFilter, cursor?: string): Promise<AuditPage>
    /** One entry by its number, for a link to it (#341); 404 when there's none. */
    get(seq: number): Promise<AuditEvent>
    summary(todayFrom: string): Promise<AuditSummary>
    /** The filtered log as CSV text, newest first; `downloadCsv` saves it with the BOM Excel needs. */
    export(filter: AuditFilter): Promise<string>
    noteDownload(fileId: string): Promise<void>
    noteExport(what: 'timeCost', detail: string): Promise<void>
  }
  /**
   * Archived records (slice 4), all needing "Manage archived records": what's archived in a workspace, how many days
   * records are kept before they may be deleted for good, and deleting one for good. Restoring uses each type's own
   * call and rights.
   */
  archive: {
    list(workspaceId: string): Promise<ArchiveList>
    setRetention(days: number): Promise<number>
    deleteForGood(type: ArchivedType, id: string): Promise<void>
  }
  /**
   * Roles and what each may do (slice 1). Everyone signed in may list them; changing them needs "Change settings,
   * users and roles", and no change may leave nobody with it.
   */
  roles: {
    list(): Promise<Role[]>
    /** A new role, with no permissions or a copy of another role's. */
    create(input: { name: string; copyFrom?: string | null }): Promise<Role>
    rename(id: string, name: string): Promise<Role>
    /** Only a role nobody holds, and never a built-in one. */
    remove(id: string): Promise<void>
    /** Every changed role at once (the page's Save changes). */
    saveGrants(changes: RoleChange[]): Promise<Role[]>
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
    /** Mutes or unmutes a thread for me (slice AA); it stays followed. */
    setThreadMuted(messageId: string, muted: boolean): Promise<void>
    /** What this channel tells me about (spec 6.11): all new messages, my mentions, or nothing. Mine only. */
    /** `null` goes back to following my default (slice AA). */
    setNotifyLevel(id: string, level: NotifyLevel | null): Promise<Channel>
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
    /** `reason`: the optional "Why?" (slice 4), at most 200 characters. */
    archiveChannel(id: string, reason?: string): Promise<Channel>
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
    archive(id: string, reason?: string): Promise<Project>
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
    archive(key: string, reason?: string): Promise<TaskView>
    restore(key: string): Promise<TaskView>
  }
  teams: { list(workspaceId: string): Promise<Team[]> }
  /**
   * Signing in and out (slice AB). Every other call is a 401 while signed out. `demoPeople` is the prototype's list to
   * sign in as; the backend has none (404).
   */
  auth: {
    signIn(email: string, password: string): Promise<Me>
    signOut(): Promise<void>
    demoPeople(): Promise<DemoPerson[]>
  }
  /**
   * User attendance and activities (slice 5). Everyone sees their own; "See everyone’s check-ins and app use" everyone;
   * "…of the people on projects they manage" those people. Asking for someone else is a 403.
   */
  attendance: {
    /** Whose attendance I may see, me first. */
    scope(): Promise<{ userIds: string[] }>
    /** Check-ins and check-outs, newest first. */
    checkIns(query: AttendanceQuery): Promise<CheckEvent[]>
    /** One local day (YYYY-MM-DD): a row per person, absent ones too. */
    day(day: string, userId?: string): Promise<AttendanceDayRow[]>
    /** Visits, newest first. */
    visits(query: AttendanceQuery): Promise<Visit[]>
    report(query: AttendanceQuery): Promise<AttendanceReportRow[]>
    workHours(): Promise<WorkHours>
    /** "Change settings, users and roles"; the time zone stays. */
    setWorkHours(input: { days: number[]; start: string; end: string }): Promise<WorkHours>
    /** How many hours a timer runs before it pauses and asks if I'm still working (timer slice 2). */
    timer(): Promise<{ timeoutHours: number }>
    /** "Change settings, users and roles"; a whole number of hours from 1 to 12. */
    setTimer(input: { timeoutHours: number }): Promise<{ timeoutHours: number }>
    /** About once a minute while Flow is on screen and in use (layout/ActivityTracker). */
    ping(): Promise<void>
  }
  time: {
    list(projectId: string): Promise<ProjectTime>
    today(): Promise<MyDay>
    /** Once per day; with a target it starts a timer too. */
    /** The server records its time, IP and device; the browser sends its place. */
    checkIn(input: { plan: string; target?: TimeTarget; location?: CheckLocation }): Promise<MyDay>
    /** Closes the latest open check-in and stops the running timer. */
    checkOut(input?: { location?: CheckLocation }): Promise<MyDay>
    /** Reopens today's check-in after a check-out by mistake; the stopped timer stays stopped. */
    undoCheckOut(): Promise<MyDay>
    /** One running timer per person: starting stops the last, and ends a paused run. The browser sends its place. */
    start(target: TimeTarget, location?: CheckLocation): Promise<MyDay>
    /** Ends my running entry as 'paused'; the run waits to be resumed today. */
    pause(): Promise<MyDay>
    /** Carries the paused run on with a new entry on its target. */
    resume(location?: CheckLocation): Promise<MyDay>
    /** Ends the running entry, or the paused run, as 'stopped'. */
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
    /** The files in a channel's messages and replies, newest first, 50 at a time (spec 6.1 Files tab). */
    inChannel(channelId: string, filter: ChannelFileFilter): Promise<Page<ChannelFile>>
    /**
     * Add from Flow files (spec 6.8): the files in a workspace I may share (I uploaded them; an Admin, any I can see),
     * newest first, 30 at most; `q` searches title and name.
     */
    shareable(workspaceId: string, q?: string): Promise<ShareableFile[]>
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
  /** My notification preferences (spec 6.11). */
  preferences: {
    get(): Promise<Preferences>
    /** Changes the parts given; a part that can't be used is 400 and nothing is saved. */
    update(patch: Partial<Preferences>): Promise<Preferences>
  }
  /** My sidebar order in a workspace (spec 5.1 drag to reorder). */
  sidebar: {
    order(workspaceId: string): Promise<SidebarOrder>
    /** Replaces a section's order; ids I can't list there are dropped, and an empty list goes back to the default order. */
    setOrder(workspaceId: string, section: SidebarSection, ids: string[]): Promise<void>
  }
  /** Search (spec 6.12): only what I may read (§9). */
  search: { run(workspaceId: string, request: SearchRequest): Promise<SearchResults> }
  /** Threads I follow (spec 6.12 Threads); their read state is Activity's. */
  threads: {
    /** 20 a page: those with unread replies first, then the rest, each newest reply first. */
    list(workspaceId: string, cursor?: string): Promise<ThreadsPage>
    /** Reads every reply in these threads, here and in Activity and the bell; roots I can't read are skipped. */
    markRead(workspaceId: string, rootIds: string[]): Promise<void>
  }
  /** My messages to send later (spec 6.8 Schedule menu, 6.12 Drafts & sent). */
  /** Channel bookmarks (spec 6.1): whoever may post adds, renames and removes them. */
  bookmarks: {
    list(channelId: string): Promise<Bookmark[]>
    /** An empty title takes the address's host. */
    add(channelId: string, bookmark: { title: string; url: string }): Promise<Bookmark>
    update(id: string, patch: { title?: string; url?: string }): Promise<Bookmark>
    remove(id: string): Promise<void>
  }
  /** Folders for files (spec 6.9), one list per workspace, by name. */
  folders: {
    list(workspaceId: string): Promise<Folder[]>
    create(workspaceId: string, name: string): Promise<Folder>
  }
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
    save(target: ChatTarget | FileTarget, remindAt?: string): Promise<SavedView>
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
