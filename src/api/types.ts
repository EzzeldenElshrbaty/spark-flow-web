import type { Role } from '@/lib/roles'

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
}

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
  phaseId: string | null; type: TaskType
  dueAt: string | null; estimateHours: number | null     // either, both or neither; overdue is derived
}
export type TaskType = 'task' | 'bug'
/** The company system calls tickets tasks; the contract and keys (NEX-101) are the same. */
export type Task = Ticket

/** A task as the API returns it: with the hours logged so far and whether it is overdue (spec §3). */
export type TaskView = Task & { loggedHours: number; overdue: boolean }

// ── Time and cost ─────────────────────────────────────────────────────────
export type TimeEntry = {
  id: string; userId: string; projectId: string; taskId: string | null
  startedAt: string; endedAt: string | null              // null = running
  source: 'timer' | 'manual'; note: string
}
export type CheckIn = { id: string; userId: string; day: string /* YYYY-MM-DD local */; checkedInAt: string; checkedOutAt: string | null; plan: string }
export type Rate = { userId: string; hourlyCost: number; currency: 'EGP' } // admin only

// ── Documents (MongoDB) ───────────────────────────────────────────────────
/** A stored file's details; its bytes live in the file store and are opened through api.files.url(id). */
export type Attachment = { id: string; name: string; mimeType: string; size: number; createdAt: string }
export type CommentKind = 'comment' | 'bug'
export type Comment = { id: string; taskId: string; projectId: string; authorId: string; kind: CommentKind; body: string; attachmentIds: string[]; createdAt: string }
export type ProjectFile = { id: string; projectId: string; attachmentId: string; uploadedBy: string; createdAt: string }
export type Mention = { kind: 'user' | 'project' | 'task' | 'all'; id: string } // userId | project key | task key | 'all'
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
  linkedTicketKeys: string[]; mentions: Mention[]; editedAt: string | null; createdAt: string
}

export type ThreadReply = {
  id: string; messageId: string; channelId: string; senderId: string; content: string
  attachments: Attachment[]; reactions: Reaction[]; mentions: Mention[]; createdAt: string
}

// ── Transport ─────────────────────────────────────────────────────────────
/**
 * One page of a list. `nextCursor` is opaque: clients pass it back unchanged as the next request's cursor and never
 * build or read it. It is null on the last page. Messages come newest first.
 */
export type Page<T> = { items: T[]; nextCursor: string | null }
export type ProblemDetails = { title: string; status: number; detail?: string }

// ── Derived shapes ────────────────────────────────────────────────────────
/** A channel as stored: unreadCount is worked out per user, never saved. */
export type StoredChannel = Omit<Channel, 'unreadCount'>

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
/** A project's time: every entry, and the hourly costs only for people who may see cost (else null). */
export type ProjectTime = { entries: TimeEntry[]; rates: Rate[] | null }
/** What a timer or a manual entry is for: a task (its project follows), or a project as a whole. */
export type TimeTarget = { taskId: string } | { projectId: string }
/** My day: today's check-in, my running entry (from any day) and my entries that started today, newest first. */
export type MyDay = { day: string; checkIn: CheckIn | null; running: TimeEntry | null; entries: TimeEntry[] }
export type NewManualEntry = TimeTarget & { startedAt: string; endedAt: string; note: string }

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
    message(id: string): Promise<ChatMessage>
    replies(messageId: string): Promise<ThreadReply[]>
    markRead(channelId: string): Promise<void>
  }
  tickets: {
    /** The same list as projects.list; kept for the Phase 1+2 pages. */
    projects(workspaceId: string): Promise<ProjectSummary[]>
    sprints(projectId: string): Promise<Sprint[]>
    list(projectId: string): Promise<TaskView[]>
    get(key: string): Promise<TaskView>
  }
  projects: {
    list(workspaceId: string): Promise<ProjectSummary[]>
    get(workspaceId: string, key: string): Promise<ProjectSummary>
    create(input: NewProject): Promise<Project>
    update(id: string, patch: ProjectPatch): Promise<Project>
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
  }
  tasks: {
    create(input: NewTicket): Promise<TaskView>
    update(key: string, patch: TicketPatch): Promise<TaskView>
  }
  teams: { list(workspaceId: string): Promise<Team[]> }
  time: {
    list(projectId: string): Promise<ProjectTime>
    today(): Promise<MyDay>
    /** Once per day; with a target it starts a timer too. */
    checkIn(input: { plan: string; target?: TimeTarget }): Promise<MyDay>
    /** Closes the latest open check-in and stops the running timer. */
    checkOut(): Promise<MyDay>
    /** One running timer per person: starting stops the last. */
    start(target: TimeTarget): Promise<MyDay>
    stop(): Promise<MyDay>
    addManual(entry: NewManualEntry): Promise<TimeEntry>
  }
  files: {
    url(id: string): Promise<string>
    list(projectId: string): Promise<StoredFile[]>
    upload(projectId: string, file: UploadFile): Promise<StoredFile>
  }
  /** Hourly cost per person: Admin only (spec §4.3). */
  rates: { list(): Promise<Rate[]>; update(userId: string, hourlyCost: number): Promise<Rate> }
  /** The Database page: mock only, hidden when backendOn. */
  db: { export(): Promise<ExportBundle>; reloadSeed(): Promise<void>; reset(): Promise<void> }
}
