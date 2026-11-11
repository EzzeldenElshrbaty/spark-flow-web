import type {
  Attachment,
  ChatMessage,
  CheckLocation,
  CheckSource,
  Visit,
  Comment,
  Deliverable,
  Phase,
  PhaseStatus,
  Priority,
  Project,
  ProjectFile,
  Rate,
  Reaction,
  Sprint,
  StoredChannel,
  TaskType,
  Team,
  ThreadReply,
  Ticket,
  TicketStatus,
  TimeEntry,
  User,
} from '@/api/types'
import { DB_VERSION, type SeedResult } from './db'
import { checklistTxt, screenshotPng, scopePdf, voiceNoteWav } from './seedFiles'
import { localDay } from '@/lib/dates'
import { DEFAULT_TIMEOUT_HOURS } from '@/lib/hours'
import { DEFAULT_WORK_HOURS } from '@/lib/workHours'
import { inboxFor } from './mentions'
import { parseMentions, parseTicketKeys } from './text'
import { descriptionText, parseBody, textBody, type DescBody } from '@/lib/messageBody'
import type { StoredMemberState } from './db'
import { projectPeopleIds } from '@/lib/projectPeople'
import { builtInRoles } from './roles'
import { seedAuditHistory } from './audit'

// ── Builders and derived-field helpers ────────────────────────────────────
// Everything below is pure: the same `now` always gives the same data (no Math.random, no Date.now).

type RawMessage = {
  id: string; channelId: string; senderId: string; createdAt: string; content: string; reactions: Reaction[]
}
type RawReply = { id: string; messageId: string; senderId: string; createdAt: string; content: string; reactions: Reaction[] }
/** A seeded channel: its description and who can post default to none and everyone. */
type RawChannel = Omit<StoredChannel, 'lastMessageAt' | 'description' | 'whoCanPost' | 'isDefault'> & Partial<Pick<StoredChannel, 'description' | 'whoCanPost' | 'isDefault'>>
type RawTicket = {
  /** `body`: a formatted description; otherwise the plain `description` becomes paragraphs. */
  key: string; title: string; description: string; body?: DescBody; files?: string[]; status: TicketStatus; priority: Priority
  points: number | null; assigneeId: string | null; reporterId: string; sprintId: string | null
  createdAt: string; updatedAt: string; link?: { channelId: string; messageId: string }
  phaseId: string | null; type?: TaskType; dueAt?: string | null; estimate?: number | null
}

const react = (emoji: string, ...userIds: string[]): Reaction => ({ emoji, userIds })

const byTimeThenId = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1

const latestOf = (times: string[]): string | null => (times.length ? times.reduce((a, b) => (a >= b ? a : b)) : null)

/** Adds threadCount, lastReplyAt, linkedTicketKeys and seq (1, 2, 3… per channel), which the server works out. */
function buildMessages(raw: RawMessage[], replies: ThreadReply[]): ChatMessage[] {
  return raw
    .map((m) => {
      const own = replies.filter((r) => r.messageId === m.id)
      return {
        ...m,
        attachments: [],
        threadCount: own.length,
        lastReplyAt: latestOf(own.map((r) => r.createdAt)),
        linkedTicketKeys: parseTicketKeys(m.content),
        mentions: parseMentions(m.content),
        body: parseBody(m.content),
        editedAt: null,
        seq: 0,
      }
    })
    .sort(byTimeThenId)
    .map((m, _, all) => ({ ...m, seq: all.filter((o) => o.channelId === m.channelId && o !== m && byTimeThenId(o, m) < 0).length + 1 }))
}

function buildReplies(raw: RawReply[], messages: RawMessage[]): ThreadReply[] {
  const channelOf = new Map(messages.map((m) => [m.id, m.channelId]))
  return raw
    .map((r) => ({ ...r, channelId: channelOf.get(r.messageId) ?? '', attachments: [], mentions: parseMentions(r.content), body: parseBody(r.content) }))
    .sort(byTimeThenId)
}

/** lastMessageAt is the newest message or reply in the channel. */
function buildChannels(raw: RawChannel[], messages: ChatMessage[], replies: ThreadReply[], now: Date): StoredChannel[] {
  return raw.map((c) => ({
    description: '',
    whoCanPost: 'everyone' as const,
    isDefault: false,
    // Made by its first member: on its first message's day, or two months ago (chat spec 6.14, the intro).
    createdBy: c.memberIds[0] ?? null,
    createdAt: messages.filter((m) => m.channelId === c.id).map((m) => m.createdAt).sort()[0] ?? new Date(now.getTime() - 60 * 86_400_000).toISOString(),
    ...c,
    lastMessageAt: latestOf([
      ...messages.filter((m) => m.channelId === c.id).map((m) => m.createdAt),
      ...replies.filter((r) => r.channelId === c.id).map((r) => r.createdAt),
    ]),
  }))
}

/** Tickets get ids from their keys and a rank by order within each project and status column. */
function buildTickets(raw: RawTicket[]): Ticket[] {
  const columnSize = new Map<string, number>()
  return raw.map((t) => {
    const projectKey = t.key.split('-')[0]
    const column = `${projectKey}:${t.status}`
    const rank = ((columnSize.get(column) ?? 0) + 1) * 1000
    columnSize.set(column, rank / 1000)
    const descriptionBody = t.body ?? textBody(t.description)
    return {
      id: `t-${t.key.toLowerCase()}`,
      key: t.key,
      projectId: `p-${projectKey.toLowerCase()}`,
      title: t.title,
      descriptionBody,
      description: descriptionText(descriptionBody),
      attachmentIds: t.files ?? [],
      status: t.status,
      priority: t.priority,
      storyPoints: t.points,
      assigneeId: t.assigneeId,
      reporterId: t.reporterId,
      sprintId: t.sprintId,
      rank,
      linkedChannelId: t.link?.channelId ?? null,
      linkedMessageId: t.link?.messageId ?? null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      phaseId: t.phaseId,
      type: t.type ?? 'task',
      dueAt: t.dueAt ?? null,
      estimateHours: t.estimate ?? null,
    }
  })
}

/** The next ticket number per project: highest existing number + 1. */
function buildCounters(projectIds: string[], tickets: Ticket[]): Record<string, number> {
  return Object.fromEntries(
    projectIds.map((id) => [
      id,
      Math.max(...tickets.filter((t) => t.projectId === id).map((t) => Number(t.key.split('-')[1]))) + 1,
    ]),
  )
}

/**
 * A person's state per channel. A channel with `unread[id] = n` is read up to the message just before its last n;
 * every other channel is read to its end. `starred` and `muted` list the channels set so.
 */
function buildChannelState(
  channels: { id: string; kind: string }[],
  messages: ChatMessage[],
  { unread, starred, muted }: { unread: Record<string, number>; starred: string[]; muted: string[] },
): Record<string, StoredMemberState> {
  return Object.fromEntries(
    channels.map(({ id }) => {
      const last = messages.filter((m) => m.channelId === id).length // seq runs 1..n
      // Every level follows the person's default (spec 6.11): a channel, mentions; a DM, every message.
      return [id, { lastReadSeq: Math.max(0, last - (unread[id] ?? 0)), starred: starred.includes(id), muted: muted.includes(id), notifyLevel: null }]
    }),
  )
}

/** The size in bytes of a base64 string's content. */
const base64Size = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0)

/** The last `count` working days before `now` (Sunday to Thursday: Friday and Saturday are off), oldest first, at 00:00 UTC. */
function workingDaysBefore(now: Date, count: number): Date[] {
  const days: Date[] = []
  for (let back = 1; days.length < count; back++) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back))
    if (day.getUTCDay() !== 5 && day.getUTCDay() !== 6) days.push(day)
  }
  return days.reverse()
}

// ── The seed ──────────────────────────────────────────────────────────────

export function seed(now: Date): SeedResult {
  /** ISO time `d` days, `h` hours and `m` minutes before now (negative values reach into the future). */
  const ago = (d: number, h = 0, m = 0) => new Date(now.getTime() - ((d * 24 + h) * 60 + m) * 60_000).toISOString()

  const msg = (id: string, channelId: string, senderId: string, createdAt: string, content: string, ...reactions: Reaction[]): RawMessage =>
    ({ id, channelId, senderId, createdAt, content, reactions })
  const reply = (id: string, messageId: string, senderId: string, createdAt: string, content: string, ...reactions: Reaction[]): RawReply =>
    ({ id, messageId, senderId, createdAt, content, reactions })

  // ── Users ───────────────────────────────────────────────────────────────
  const users: User[] = [
    { id: 'u-1', name: 'Youssef Abdelrahman', email: 'youssef.abdelrahman@spark-sys.com', title: 'Managing Director', roleIds: ['admin'], teamIds: [], presence: 'active' },
    { id: 'u-2', name: 'Nour El-Sayed', email: 'nour.elsayed@spark-sys.com', title: 'Project Manager · Backend', roleIds: ['pm'], teamIds: ['t-backend'], presence: 'active' },
    { id: 'u-3', name: 'Mariam Fathy', email: 'mariam.fathy@spark-sys.com', title: 'Frontend Engineer', roleIds: ['member'], teamIds: ['t-frontend'], presence: 'active' },
    { id: 'u-4', name: 'Ahmed Shawky', email: 'ahmed.shawky@spark-sys.com', title: 'Project Manager · Mobile', roleIds: ['pm'], teamIds: ['t-mobile'], presence: 'away' },
    { id: 'u-5', name: 'Salma Ibrahim', email: 'salma.ibrahim@spark-sys.com', title: 'QA Engineer', roleIds: ['member'], teamIds: ['t-qa'], presence: 'active' },
    { id: 'u-6', name: 'Hossam Gaber', email: 'hossam.gaber@spark-sys.com', title: 'DevOps Engineer', roleIds: ['member'], teamIds: ['t-backend'], presence: 'offline' },
    { id: 'u-7', name: 'Dina Mansour', email: 'dina.mansour@spark-sys.com', title: 'Product Designer', roleIds: ['member'], teamIds: ['t-frontend'], presence: 'away' },
    { id: 'u-8', name: 'Tarek Lotfy', email: 'tarek.lotfy@spark-sys.com', title: 'Android Engineer', roleIds: ['member'], teamIds: ['t-mobile'], presence: 'offline' },
    { id: 'u-9', name: 'Karim Hassan', email: 'karim.hassan@spark-sys.com', title: 'Sales Manager', roleIds: ['sales'], teamIds: [], presence: 'active' },
  ]

  const teams: Team[] = [
    { id: 't-frontend', workspaceId: 'ws-eng', name: 'Frontend', memberIds: ['u-3', 'u-7'] },
    { id: 't-backend', workspaceId: 'ws-eng', name: 'Backend', memberIds: ['u-2', 'u-6'] },
    { id: 't-mobile', workspaceId: 'ws-eng', name: 'Mobile', memberIds: ['u-4', 'u-8'] },
    { id: 't-qa', workspaceId: 'ws-eng', name: 'QA', memberIds: ['u-5'] },
  ]

  // ── Workspaces, projects and sprints ────────────────────────────────────
  const workspaces = [
    { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' },
    { id: 'ws-design', slug: 'design', name: 'Spark Design' },
  ]

  const projects: Project[] = [
    { id: 'p-nex', workspaceId: 'ws-eng', key: 'NEX', name: 'Nexus Core', description: 'API, database and web client for Spark Flow.', clientName: 'Spark Systems (internal)', logoFileId: null, links: [{ label: 'Staging', url: 'https://staging.nexus.spark-sys.com' }], managerId: 'u-2', memberIds: ['u-2', 'u-3', 'u-5', 'u-6'], teamIds: ['t-backend', 't-frontend'], methodology: 'agile', status: 'active', startDate: ago(35), dueDate: ago(-25), channelId: 'c-p-nex' },
    { id: 'p-mob', workspaceId: 'ws-eng', key: 'MOB', name: 'Mobile App', description: 'iOS and Android apps. Release 2.4.0 is the current target.', clientName: 'Spark Systems (internal)', logoFileId: null, links: [{ label: 'TestFlight', url: 'https://testflight.apple.com/join/spark-flow' }], managerId: 'u-4', memberIds: ['u-4', 'u-5', 'u-6', 'u-8'], teamIds: ['t-mobile'], methodology: 'waterfall', status: 'active', startDate: ago(40), dueDate: ago(2), channelId: 'c-p-mob' },
    { id: 'p-elm', workspaceId: 'ws-eng', key: 'ELM', name: 'El Moasser portal', description: 'Customer portal for El Moasser: orders, invoices and support tickets.', clientName: 'El Moasser', logoFileId: null, links: [{ label: 'Live portal', url: 'https://portal.elmoasser.com' }], managerId: 'u-2', memberIds: ['u-2', 'u-3', 'u-5', 'u-7'], teamIds: ['t-frontend'], methodology: 'waterfall', status: 'delivered', startDate: ago(120), dueDate: ago(20), channelId: 'c-p-elm' },
    { id: 'p-sel', workspaceId: 'ws-eng', key: 'SEL', name: 'Sela booking', description: 'Booking portal for 3 Sela branches. Sold this week; kickoff in 3 days.', clientName: 'Sela', logoFileId: null, links: [], managerId: 'u-4', memberIds: ['u-4', 'u-9'], teamIds: [], methodology: 'waterfall', status: 'planned', startDate: ago(-3), dueDate: ago(-90), channelId: 'c-p-sel' },
    { id: 'p-brd', workspaceId: 'ws-design', key: 'BRD', name: 'Brand Refresh', description: 'Logo lockup, color tokens and illustrations for Spark Flow.', clientName: 'Spark Systems (internal)', logoFileId: null, links: [], managerId: 'u-7', memberIds: ['u-7', 'u-3'], teamIds: [], methodology: 'agile', status: 'active', startDate: ago(10), dueDate: ago(-10), channelId: 'c-design' },
  ]

  // Waterfall stages. Dates are [start, due] in days before now (negative = ahead).
  const phase = (projectKey: string, order: number, name: string, start: number, due: number, status: PhaseStatus): Phase => ({
    id: `ph-${projectKey.toLowerCase()}-${name.toLowerCase()}`, projectId: `p-${projectKey.toLowerCase()}`, name, order, startDate: ago(start), dueDate: ago(due), status,
  })
  const phases: Phase[] = [
    phase('NEX', 1, 'Build', 35, -10, 'inProgress'),
    phase('NEX', 2, 'QA', -10, -20, 'notStarted'),
    phase('NEX', 3, 'Delivery', -20, -25, 'notStarted'),
    phase('MOB', 1, 'Analysis', 40, 33, 'done'),
    phase('MOB', 2, 'Design', 33, 20, 'done'),
    phase('MOB', 3, 'Build', 20, 5, 'inProgress'), // 5 days past due
    phase('MOB', 4, 'QA', 5, 3, 'notStarted'),
    phase('MOB', 5, 'Delivery', 3, 2, 'notStarted'),
    phase('ELM', 1, 'Analysis', 120, 100, 'done'),
    phase('ELM', 2, 'Design', 100, 80, 'done'),
    phase('ELM', 3, 'Build', 80, 40, 'done'),
    phase('ELM', 4, 'QA', 40, 25, 'done'),
    phase('ELM', 5, 'Delivery', 25, 20, 'done'),
    phase('SEL', 1, 'Analysis', -3, -10, 'notStarted'),
    phase('SEL', 2, 'Design', -10, -30, 'notStarted'),
    phase('SEL', 3, 'Build', -30, -75, 'notStarted'),
    phase('SEL', 4, 'QA', -75, -85, 'notStarted'),
    phase('SEL', 5, 'Delivery', -85, -90, 'notStarted'),
    phase('BRD', 1, 'Design', 10, -5, 'inProgress'),
    phase('BRD', 2, 'Delivery', -5, -10, 'notStarted'),
  ]

  const deliverables: Deliverable[] = [
    { id: 'd-nex-1', projectId: 'p-nex', phaseId: 'ph-nex-build', title: 'Refresh-token rotation live on staging', dueDate: ago(-2), doneAt: null },
    { id: 'd-nex-2', projectId: 'p-nex', phaseId: 'ph-nex-build', title: 'Invoice export fix shipped', dueDate: ago(1), doneAt: ago(1, 18) },
    { id: 'd-mob-1', projectId: 'p-mob', phaseId: 'ph-mob-analysis', title: 'Signed scope document', dueDate: ago(35), doneAt: ago(36) },
    { id: 'd-mob-2', projectId: 'p-mob', phaseId: 'ph-mob-design', title: 'Design sign-off for 14 screens', dueDate: ago(20), doneAt: ago(21) },
    { id: 'd-mob-3', projectId: 'p-mob', phaseId: 'ph-mob-delivery', title: 'Release 2.4.0 to the App Store and Google Play', dueDate: ago(2), doneAt: null },
    { id: 'd-elm-1', projectId: 'p-elm', phaseId: 'ph-elm-delivery', title: 'Portal launch', dueDate: ago(20), doneAt: ago(21) },
    { id: 'd-elm-2', projectId: 'p-elm', phaseId: 'ph-elm-delivery', title: 'Handover training for 12 El Moasser staff', dueDate: ago(18), doneAt: ago(18) },
    { id: 'd-sel-1', projectId: 'p-sel', phaseId: 'ph-sel-analysis', title: 'Requirements document signed by Sela', dueDate: ago(-10), doneAt: null },
    { id: 'd-sel-2', projectId: 'p-sel', phaseId: 'ph-sel-design', title: 'Clickable prototype for the 3 branches', dueDate: ago(-30), doneAt: null },
    { id: 'd-brd-1', projectId: 'p-brd', phaseId: 'ph-brd-design', title: 'Final logo lockup in SVG', dueDate: ago(-3), doneAt: null },
  ]

  // Agile projects only: one 14-day active sprint that started 7 days ago, then one planned sprint right after it.
  const sprint = (id: string, projectId: string, name: string, goal: string, state: 'active' | 'planned'): Sprint =>
    state === 'active'
      ? { id, projectId, name, goal, state, startDate: ago(7), endDate: ago(-7) }
      : { id, projectId, name, goal, state, startDate: ago(-8), endDate: ago(-22) }
  const sprints: Sprint[] = [
    sprint('s-nex-1', 'p-nex', 'Sprint 14', 'Rotate refresh tokens and fix the duplicate invoice rows.', 'active'),
    sprint('s-nex-2', 'p-nex', 'Sprint 15', 'Audit log for role changes and the first WebSocket load test.', 'planned'),
    sprint('s-brd-1', 'p-brd', 'Sprint 3', 'Final logo lockup and dark mode color tokens.', 'active'),
    sprint('s-brd-2', 'p-brd', 'Sprint 4', 'Empty-state illustrations.', 'planned'),
  ]

  // ── Tickets (key numbers start at 101 per project) ──────────────────────
  const rawTickets: RawTicket[] = [
    // Nexus Core (agile: sprints on top of phases). Every ticket is created before the first message that names it.
    { key: 'NEX-101', title: 'Rotate refresh tokens on POST /auth/refresh', description: 'Issue a new refresh token on every use. Keep the old one valid for 30 seconds so retries still work.',
      body: [...textBody('Issue a new refresh token on every use. Keep the old one valid for 30 seconds so retries still work.'), { type: 'file', id: 'a-nex-101-flow' }], files: ['a-nex-101-flow'], status: 'inReview', priority: 'high', points: 5, assigneeId: 'u-2', reporterId: 'u-1', sprintId: 's-nex-1', createdAt: ago(7, 4), updatedAt: ago(0, 6), phaseId: 'ph-nex-build', dueAt: ago(-2), estimate: 12 },
    { key: 'NEX-102', title: 'Return 429 with Retry-After from /v2/search', description: 'Limit each API key to 60 requests per minute. Send Retry-After in seconds.', status: 'todo', priority: 'medium', points: 3, assigneeId: 'u-2', reporterId: 'u-1', sprintId: 's-nex-1', createdAt: ago(6, 1), updatedAt: ago(1, 19), phaseId: 'ph-nex-build', dueAt: ago(-4), estimate: 6 },
    { key: 'NEX-103', title: 'Fix duplicate rows in GET /v2/invoices at page size 100', description: 'The last row of page 1 shows again as the first row of page 2. Compare the cursor with > instead of >=.', status: 'done', priority: 'urgent', points: 2, assigneeId: 'u-2', reporterId: 'u-5', sprintId: 's-nex-1', createdAt: ago(7, 3), updatedAt: ago(1, 18), phaseId: 'ph-nex-build', type: 'bug', dueAt: ago(2), estimate: 3 },
    { key: 'NEX-104', title: 'Add an index on messages (channel_id, created_at)', description: 'Channels with more than 50,000 messages take 1.8 s at p95. Target is under 100 ms.', status: 'done', priority: 'high', points: 2, assigneeId: 'u-6', reporterId: 'u-2', sprintId: 's-nex-1', createdAt: ago(5, 17), updatedAt: ago(4, 22), phaseId: 'ph-nex-build', estimate: 4 },
    { key: 'NEX-105', title: 'Board: drag a card to change its status', description: '', body: [
      { type: 'p', children: [{ type: 'text', text: 'Drag works with:' }] },
      { type: 'ul', items: [[{ type: 'text', text: 'Pointer' }], [{ type: 'text', text: 'Touch' }], [{ type: 'text', text: 'Keyboard' }]] },
      { type: 'p', children: [{ type: 'text', text: 'Drop threshold is ' }, { type: 'text', text: 'half the card height', marks: ['b'] }, { type: 'text', text: '. Works in light and dark mode at 390 px.' }] },
    ], status: 'inReview', priority: 'high', points: 8, assigneeId: 'u-3', reporterId: 'u-1', sprintId: 's-nex-1', createdAt: ago(7, 2), updatedAt: ago(0, 6), phaseId: 'ph-nex-build', dueAt: ago(-1), estimate: 20 },
    {
      key: 'NEX-106', title: 'Show an unread badge in the channel list', description: 'Show the unread count next to the channel name. Cap it at 99+. Clear it when the user opens the channel.',
      status: 'todo', priority: 'medium', points: 3, assigneeId: 'u-3', reporterId: 'u-1', sprintId: 's-nex-1', createdAt: ago(3, 20, 5), updatedAt: ago(2, 10),
      link: { channelId: 'c-frontend', messageId: 'm-f08' }, phaseId: 'ph-nex-build', dueAt: ago(-6), estimate: 6,
    },
    { key: 'NEX-107', title: 'Upgrade PostgreSQL from 15.6 to 16.4 on staging', description: 'Dump, upgrade, restore. Expect 30 minutes of downtime. Run the full test suite after.', status: 'inProgress', priority: 'medium', points: null, assigneeId: 'u-6', reporterId: 'u-2', sprintId: 's-nex-1', createdAt: ago(3, 8), updatedAt: ago(0, 5), phaseId: 'ph-nex-build', dueAt: ago(-1), estimate: 5 },
    { key: 'NEX-108', title: 'Load test WebSocket fan-out at 5,000 connections', description: 'One channel, 5,000 clients, 20 messages per second. Record p95 delivery time and memory per connection.', status: 'backlog', priority: 'low', points: null, assigneeId: null, reporterId: 'u-2', sprintId: null, createdAt: ago(5, 3), updatedAt: ago(5, 3), phaseId: 'ph-nex-qa' },
    { key: 'NEX-109', title: 'Export the ticket list to CSV', description: 'One row per ticket. Columns: key, title, status, priority, assignee, points.', status: 'backlog', priority: 'low', points: 3, assigneeId: null, reporterId: 'u-1', sprintId: null, createdAt: ago(4, 4), updatedAt: ago(4, 4), phaseId: 'ph-nex-build', estimate: 4 },
    { key: 'NEX-110', title: 'Audit log for workspace role changes', description: 'Record who changed which role, when, and from what value. Keep entries for 365 days.', status: 'todo', priority: 'medium', points: 5, assigneeId: null, reporterId: 'u-1', sprintId: 's-nex-2', createdAt: ago(3, 3), updatedAt: ago(3, 3), phaseId: 'ph-nex-build', dueAt: ago(-14), estimate: 10 },
    // Mobile App (waterfall, late: Build is past due, MOB-102 and MOB-103 are past their dates, MOB-104 is past its estimate)
    { key: 'MOB-101', title: 'Cold start crash on iOS 18.2 when the keychain is locked', description: '38 crashes in 24 hours, all on devices with a passcode. The app reads the keychain before the first unlock.', status: 'done', priority: 'urgent', points: 3, assigneeId: 'u-4', reporterId: 'u-5', sprintId: null, createdAt: ago(5, 14), updatedAt: ago(4, 15), phaseId: 'ph-mob-build', type: 'bug', dueAt: ago(4), estimate: 6 },
    { key: 'MOB-102', title: 'Push notification opens the wrong channel', description: 'Tapping a notification opens #general. On Android the channelId arrives as a number, so the comparison fails.', status: 'inReview', priority: 'high', points: 2, assigneeId: 'u-8', reporterId: 'u-5', sprintId: null, createdAt: ago(6, 12), updatedAt: ago(3, 22), phaseId: 'ph-mob-build', type: 'bug', dueAt: ago(3), estimate: 3 },
    { key: 'MOB-103', title: 'Add biometric unlock for Face ID and fingerprint', description: 'Offer it after the first sign-in. Fall back to the passcode after 3 failed attempts.', status: 'todo', priority: 'medium', points: 5, assigneeId: 'u-4', reporterId: 'u-1', sprintId: null, createdAt: ago(6, 6), updatedAt: ago(4, 6), phaseId: 'ph-mob-build', dueAt: ago(1), estimate: 12 },
    { key: 'MOB-104', title: 'Cache the last 50 messages per channel for offline reading', description: 'Store in SQLite. Show the cache first, then refresh from the network. Clear it on sign-out.', status: 'inProgress', priority: 'high', points: 8, assigneeId: 'u-8', reporterId: 'u-1', sprintId: null, createdAt: ago(6, 12), updatedAt: ago(0, 7), phaseId: 'ph-mob-build', dueAt: ago(-1), estimate: 16 },
    { key: 'MOB-105', title: 'Android 2.4.0 build fails at the signing step', description: 'CI uses an expired signing key secret. Replace the secret and rerun the release job.', status: 'done', priority: 'high', points: 1, assigneeId: 'u-6', reporterId: 'u-8', sprintId: null, createdAt: ago(4, 17), updatedAt: ago(3, 18), phaseId: 'ph-mob-build', type: 'bug', dueAt: ago(3), estimate: 2 },
    { key: 'MOB-106', title: 'Dark mode: attachment preview text is unreadable', description: 'Caption text is 2.1:1 against the preview background. It needs 4.5:1.', status: 'todo', priority: 'low', points: 1, assigneeId: null, reporterId: 'u-7', sprintId: null, createdAt: ago(2, 12), updatedAt: ago(2, 12), phaseId: 'ph-mob-build', estimate: 2 },
    { key: 'MOB-107', title: 'Reduce the Android APK from 41 MB to under 28 MB', description: 'Split by ABI, drop unused fonts, and compress images to WebP.', status: 'backlog', priority: 'low', points: null, assigneeId: null, reporterId: 'u-8', sprintId: null, createdAt: ago(5, 5), updatedAt: ago(5, 5), phaseId: 'ph-mob-qa' },
    { key: 'MOB-108', title: 'Open a ticket from a /t/NEX-101 deep link', description: 'Handle the link on cold start and while the app is open. Show the sign-in screen first if the session expired.', status: 'backlog', priority: 'medium', points: 3, assigneeId: 'u-8', reporterId: 'u-1', sprintId: null, createdAt: ago(3, 5), updatedAt: ago(3, 5), phaseId: 'ph-mob-build', estimate: 6 },
    // El Moasser portal (delivered: every task done)
    { key: 'ELM-101', title: 'Requirements workshop with El Moasser operations', description: '2 sessions, 6 hours. Output: 38 user stories and the invoice rules.', status: 'done', priority: 'high', points: null, assigneeId: 'u-2', reporterId: 'u-2', sprintId: null, createdAt: ago(118), updatedAt: ago(101), phaseId: 'ph-elm-analysis', dueAt: ago(100), estimate: 8 },
    { key: 'ELM-102', title: 'Design the order and invoice screens', description: '9 screens in light and dark mode, Arabic and English.', status: 'done', priority: 'high', points: null, assigneeId: 'u-7', reporterId: 'u-2', sprintId: null, createdAt: ago(99), updatedAt: ago(81), phaseId: 'ph-elm-design', dueAt: ago(80), estimate: 40 },
    { key: 'ELM-103', title: 'Build the order history page with filters', description: 'Filter by date, branch and status. 50 orders per page.', status: 'done', priority: 'medium', points: null, assigneeId: 'u-3', reporterId: 'u-2', sprintId: null, createdAt: ago(78), updatedAt: ago(45), phaseId: 'ph-elm-build', dueAt: ago(40), estimate: 32 },
    { key: 'ELM-104', title: 'Invoice PDF shows the wrong VAT total for credit notes', description: 'Credit notes add VAT instead of subtracting it. Found in QA on 14 sample invoices.', status: 'done', priority: 'urgent', points: null, assigneeId: 'u-3', reporterId: 'u-5', sprintId: null, createdAt: ago(38), updatedAt: ago(33), phaseId: 'ph-elm-qa', type: 'bug', dueAt: ago(32), estimate: 4 },
    { key: 'ELM-105', title: 'Full regression run before launch', description: '126 test cases on Chrome, Safari and the Android app view.', status: 'done', priority: 'high', points: null, assigneeId: 'u-5', reporterId: 'u-2', sprintId: null, createdAt: ago(36), updatedAt: ago(26), phaseId: 'ph-elm-qa', dueAt: ago(25), estimate: 16 },
    { key: 'ELM-106', title: 'Handover training for El Moasser staff', description: '2 sessions for 12 people. Recordings go to the client drive.', status: 'done', priority: 'medium', points: null, assigneeId: 'u-2', reporterId: 'u-2', sprintId: null, createdAt: ago(24), updatedAt: ago(18), phaseId: 'ph-elm-delivery', dueAt: ago(18), estimate: 6 },
    // Sela booking (just sold)
    { key: 'SEL-101', title: 'Requirements workshop with the Sela branch managers', description: 'Day 1 of the project. Cover booking rules, deposits and cancellations for 3 branches.', status: 'todo', priority: 'high', points: null, assigneeId: 'u-4', reporterId: 'u-9', sprintId: null, createdAt: ago(1, 3), updatedAt: ago(1, 3), phaseId: 'ph-sel-analysis', dueAt: ago(-5), estimate: 6 },
    { key: 'SEL-102', title: 'Estimate build effort per module', description: 'Booking, payments, staff calendar and reports. Hours per module, for the price check.', status: 'backlog', priority: 'medium', points: null, assigneeId: 'u-4', reporterId: 'u-9', sprintId: null, createdAt: ago(1, 3), updatedAt: ago(1, 3), phaseId: 'ph-sel-analysis', dueAt: ago(-8), estimate: 8 },
    // Brand Refresh (agile)
    { key: 'BRD-101', title: 'Redraw the logo lockup at 16 px and 24 px', description: 'The divider and FLOW text touch at 16 px. Add 6 px of space and export SVG.', status: 'inProgress', priority: 'high', points: 3, assigneeId: 'u-7', reporterId: 'u-1', sprintId: 's-brd-1', createdAt: ago(5, 17), updatedAt: ago(2, 9), phaseId: 'ph-brd-design', dueAt: ago(-3), estimate: 10 },
    { key: 'BRD-102', title: 'Publish dark mode values for all 24 color tokens', description: 'Body text must pass 4.5:1 on every surface. Large text must pass 3:1.', status: 'inReview', priority: 'medium', points: 2, assigneeId: 'u-3', reporterId: 'u-7', sprintId: 's-brd-1', createdAt: ago(3, 6), updatedAt: ago(1, 23), phaseId: 'ph-brd-design', estimate: 6 },
    { key: 'BRD-103', title: 'Draw empty-state illustrations for 5 screens', description: 'Board, channels, search, notifications and tickets. SVG, under 8 KB each.', status: 'todo', priority: 'low', points: 5, assigneeId: 'u-7', reporterId: 'u-7', sprintId: 's-brd-2', createdAt: ago(2, 5), updatedAt: ago(0, 9), phaseId: 'ph-brd-design', estimate: 12 },
    { key: 'BRD-104', title: 'Update the brand guideline PDF to v1.2', description: 'Add the new lockup, the dark mode tokens and the spacing scale.', status: 'backlog', priority: 'medium', points: null, assigneeId: null, reporterId: 'u-7', sprintId: null, createdAt: ago(1, 4), updatedAt: ago(1, 4), phaseId: 'ph-brd-delivery' },
  ]

  // ── Channels ────────────────────────────────────────────────────────────
  const rawChannels: RawChannel[] = [
    { id: 'c-general', workspaceId: 'ws-eng', kind: 'channel', name: 'general', topic: 'Updates for all of Spark Engineering. Ticket talk goes in the project channels.', memberIds: ['u-1', 'u-2', 'u-3', 'u-4', 'u-5', 'u-6', 'u-7', 'u-8', 'u-9'], isPrivate: false, isDefault: true },
    { id: 'c-frontend', workspaceId: 'ws-eng', kind: 'channel', name: 'frontend-dev', topic: 'React web client. Pull requests, design handoff and browser bugs.', memberIds: ['u-1', 'u-3', 'u-5', 'u-7'], isPrivate: false },
    { id: 'c-backend', workspaceId: 'ws-eng', kind: 'channel', name: 'backend', topic: 'API, database and queues. Post slow queries with the EXPLAIN output.', memberIds: ['u-1', 'u-2', 'u-5', 'u-6'], isPrivate: false },
    { id: 'c-release', workspaceId: 'ws-eng', kind: 'channel', name: 'release-v2', topic: 'Release 2.4.0: scope, QA status and the go/no-go call. Members only.', memberIds: ['u-1', 'u-2', 'u-4', 'u-5', 'u-6', 'u-8'], isPrivate: true },
    { id: 'c-design', workspaceId: 'ws-design', kind: 'channel', name: 'design', topic: 'Brand Refresh. Files live in Figma. Decisions are posted here.', memberIds: ['u-1', 'u-3', 'u-7'], isPrivate: false },
    // One channel per project
    { id: 'c-p-nex', workspaceId: 'ws-eng', kind: 'channel', name: 'nexus-core', topic: 'Nexus Core project chat. Task comments and bugs post here too.', memberIds: ['u-1', 'u-2', 'u-3', 'u-5', 'u-6'], isPrivate: false },
    { id: 'c-p-mob', workspaceId: 'ws-eng', kind: 'channel', name: 'mobile-app', topic: 'Mobile App project chat. Task comments and bugs post here too.', memberIds: ['u-1', 'u-4', 'u-5', 'u-6', 'u-8'], isPrivate: false },
    { id: 'c-p-elm', workspaceId: 'ws-eng', kind: 'channel', name: 'el-moasser', topic: 'El Moasser portal (delivered).', memberIds: ['u-1', 'u-2', 'u-3', 'u-5', 'u-7'], isPrivate: false },
    { id: 'c-p-sel', workspaceId: 'ws-eng', kind: 'channel', name: 'sela-booking', topic: 'Sela booking project chat. Kickoff in 3 days.', memberIds: ['u-1', 'u-4', 'u-9'], isPrivate: false },
    { id: 'c-dm-1', workspaceId: 'ws-eng', kind: 'dm', name: null, topic: '', memberIds: ['u-1', 'u-2'], isPrivate: true },
    { id: 'c-dm-2', workspaceId: 'ws-eng', kind: 'dm', name: null, topic: '', memberIds: ['u-1', 'u-3'], isPrivate: true },
    { id: 'c-dm-3', workspaceId: 'ws-design', kind: 'dm', name: null, topic: '', memberIds: ['u-1', 'u-7'], isPrivate: true },
  ]

  // ── Messages and replies ────────────────────────────────────────────────
  const rawMessages: RawMessage[] = [
    // #general
    msg('m-g01', 'c-general', 'u-1', ago(6, 20), 'Sprint 14 started this morning. Goals: ship refresh-token rotation (NEX-101) and fix the duplicate invoice rows (NEX-103).'),
    msg('m-g02', 'c-general', 'u-6', ago(6, 18), 'Staging was down for 12 minutes after the 09:40 deploy. Cause: the REDIS_URL variable was missing. It is set, and the app now checks it at startup.'),
    msg('m-g03', 'c-general', 'u-5', ago(5, 22), 'Regression run on build 2.3.9: 412 passed, 3 failed. All 3 failures are in the invoice export.'),
    msg('m-g04', 'c-general', 'u-2', ago(5, 21), 'The 3 failures come from NEX-103. At page size 100 the last row appears twice. I have a fix and I am writing the test.'),
    msg('m-g05', 'c-general', 'u-4', ago(4, 17), 'TestFlight build 2.4.0 (118) is out. Please sign in on iOS 18.2 and report any crash on MOB-101.'),
    msg('m-g06', 'c-general', 'u-8', ago(4, 16), 'The Android 2.4.0 build failed at the signing step. Hossam is on it, see MOB-105.'),
    msg('m-g07', 'c-general', 'u-1', ago(3, 19), 'Demo for the Cairo team is in 2 days at 14:00. Send me your numbers by tomorrow noon.'),
    msg('m-g08', 'c-general', 'u-3', ago(2, 15), 'Team lunch order closes at 13:00. Koshary or shawarma? Reply with one.', react('👍', 'u-1', 'u-5', 'u-8'), react('😂', 'u-2')),
    msg('m-g09', 'c-general', 'u-6', ago(1, 20), 'Heads-up: the staging database moves to PostgreSQL 16.4 this week, in a 30-minute window. I will post the exact time in #backend.'),
    msg('m-g10', 'c-general', 'u-1', ago(0, 3), 'Good work on the invoice fix. Release notes for 2.4.0 go out after QA signs off.', react('🎉', 'u-2', 'u-3', 'u-5')),

    // #frontend-dev (the last 3 messages are unread for the current user)
    msg('m-f01', 'c-frontend', 'u-3', ago(6, 17), 'NEX-105: board drag and drop works with pointer events. Touch still jumps one column. I am on it.'),
    msg('m-f02', 'c-frontend', 'u-1', ago(6, 16), 'Use the card height for the drop threshold, not a fixed 50 px. Short cards fail with a fixed value.'),
    msg('m-f03', 'c-frontend', 'u-3', ago(6, 15), 'Done. The threshold is half the card height. Tested at 390, 768, 1024 and 1440 px.'),
    msg('m-f04', 'c-frontend', 'u-7', ago(5, 19), 'Dark mode check: card borders vanish on the sunken column. Use border-line-subtle, not border-line.', react('👍', 'u-3', 'u-1')),
    msg('m-f05', 'c-frontend', 'u-3', ago(5, 18), 'Fixed. Border contrast went from 1.9:1 to 3.4:1.'),
    msg('m-f06', 'c-frontend', 'u-5', ago(4, 20), 'Bug: a long ticket title pushes the assignee avatar out of the card at 390 px.'),
    msg('m-f07', 'c-frontend', 'u-3', ago(4, 2), 'Arabic titles wrap at a different point. I am testing both directions before I push.'),
    msg('m-f08', 'c-frontend', 'u-1', ago(3, 21), 'The channel list needs an unread badge. People miss messages in channels they do not open. Cap it at 99+.'),
    msg('m-f09', 'c-frontend', 'u-3', ago(3, 20), 'Filed NEX-106 for the badge. I will take it after NEX-105.'),
    msg('m-f10', 'c-frontend', 'u-7', ago(2, 18), 'Sidebar group labels: 11 px, uppercase, 0.04em tracking. The spec is on the Figma page.'),
    msg('m-f11', 'c-frontend', 'u-3', ago(2, 17), 'Applied. The sidebar is 264 px wide on desktop and becomes a drawer under 1024 px.'),
    msg('m-f12', 'c-frontend', 'u-5', ago(1, 21), 'Bundle check: the main chunk is 187 kB gzipped. The budget is 200 kB.'),
    msg('m-f13', 'c-frontend', 'u-1', ago(1, 20), 'Stay under it. Lazy-load the thread panel. Nobody opens it on first paint.'),
    msg('m-f14', 'c-frontend', 'u-3', ago(1, 3), 'The thread panel loads on demand. The main chunk is 171 kB gzipped.'),
    msg('m-f15', 'c-frontend', 'u-3', ago(0, 6), 'NEX-105 is in review. Dragging between all 5 columns works with mouse, touch and keyboard.', react('👀', 'u-1')),
    msg('m-f16', 'c-frontend', 'u-5', ago(0, 4), 'I will test NEX-105 on Safari 18 and Chrome 130 this afternoon.'),
    msg('m-f17', 'c-frontend', 'u-7', ago(0, 2), 'The board looks right in dark mode now. Only the empty-column text is too faint, at 2.9:1.'),

    // #backend
    msg('m-b01', 'c-backend', 'u-2', ago(6, 19), 'NEX-101 design: refresh tokens rotate on every use. The old token stays valid for 30 seconds so retries work.'),
    msg('m-b02', 'c-backend', 'u-1', ago(6, 18), '30 seconds is fine. Store a salted hash of the token, never the token itself.'),
    msg('m-b03', 'c-backend', 'u-6', ago(5, 17), 'The messages query is slow: 1.8 s at p95 for channels over 50,000 rows. EXPLAIN shows a sequential scan.'),
    msg('m-b04', 'c-backend', 'u-2', ago(5, 16), 'I am adding a composite index on (channel_id, created_at). Ticket is NEX-104. I expect p95 under 80 ms.'),
    msg('m-b05', 'c-backend', 'u-6', ago(4, 22), 'NEX-104 is on staging. p95 fell from 1.8 s to 62 ms. The index adds 410 MB.', react('✅', 'u-1', 'u-5'), react('🎉', 'u-2')),
    msg('m-b06', 'c-backend', 'u-5', ago(4, 14), 'GET /v2/invoices?limit=100 returns the last row twice. Page 2 starts with the same invoice. Steps are in NEX-103.'),
    msg('m-b07', 'c-backend', 'u-2', ago(4, 13), 'Found it. The cursor filter uses >= and should use >. The fix is 1 line plus a test.'),
    msg('m-b08', 'c-backend', 'u-2', ago(3, 17), 'NEX-103 is in review. Youssef, can you look at it today?'),
    msg('m-b09', 'c-backend', 'u-1', ago(3, 16), 'Reviewing now.'),
    msg('m-b10', 'c-backend', 'u-1', ago(2, 20), 'Approved. Add regression tests for page sizes 100 and 101 before you merge.'),
    msg('m-b11', 'c-backend', 'u-2', ago(1, 19), 'NEX-102: the limit is 60 requests per minute per API key on /v2/search. Over the limit, the API returns 429 with Retry-After in seconds.', react('👍', 'u-1', 'u-5')),
    msg('m-b12', 'c-backend', 'u-6', ago(0, 5), 'The PostgreSQL 16.4 upgrade on staging runs tonight at 23:00. NEX-107. Expect 30 minutes of downtime.'),

    // #release-v2
    msg('m-r01', 'c-release', 'u-1', ago(6, 10), 'Scope for 2.4.0 is locked: NEX-101, NEX-103, MOB-102 and MOB-104. Code freeze is in 6 days.'),
    msg('m-r02', 'c-release', 'u-4', ago(5, 12), 'MOB-101: cold start crash on iOS 18.2 when the keychain is locked. 38 crashes in 24 hours, all on devices with a passcode.'),
    msg('m-r03', 'c-release', 'u-1', ago(5, 11), 'Treat MOB-101 as urgent. It blocks the release.'),
    msg('m-r04', 'c-release', 'u-4', ago(4, 21), 'Root cause: we read the keychain before the first unlock. I moved the read to after the app becomes active. The fix ships in build 118.'),
    msg('m-r05', 'c-release', 'u-5', ago(4, 15), 'Build 118 on iOS 18.2: 0 crashes in 200 cold starts, on iPhone 13 and iPhone 15.', react('🎉', 'u-4', 'u-1')),
    msg('m-r06', 'c-release', 'u-8', ago(4, 14), 'MOB-102: tapping a push notification opens #general. On Android the channelId arrives as a number and we compare it as a string.'),
    msg('m-r07', 'c-release', 'u-8', ago(3, 22), 'Fixed with String(channelId). The pull request is in review.'),
    msg('m-r08', 'c-release', 'u-6', ago(3, 18), 'MOB-105 is fixed. The signing key secret in CI had expired. The new secret is in place and the release job passes.'),
    msg('m-r09', 'c-release', 'u-5', ago(2, 19), 'QA status for 2.4.0: 38 of 41 test cases pass. Open: MOB-104 offline cache (2) and NEX-101 token expiry (1).'),
    msg('m-r10', 'c-release', 'u-1', ago(1, 22), 'Code freeze is tomorrow evening. Anything not in review by then moves to 2.5.'),
    msg('m-r11', 'c-release', 'u-8', ago(0, 7), 'MOB-104 works offline for the last 50 messages. One bug left: unsent messages vanish after a force quit.'),
    msg('m-r12', 'c-release', 'u-1', ago(0, 1), 'Decision: unsent messages are out of scope for 2.4.0. We ship the 50-message cache and file the rest after release.'),

    // #design
    msg('m-d01', 'c-design', 'u-7', ago(5, 16), 'Brand Refresh kickoff. 4 tickets this sprint. BRD-101 comes first: the logo lockup at 16 px and 24 px.'),
    msg('m-d02', 'c-design', 'u-7', ago(4, 18), 'Draft lockup is in Figma. At 16 px the divider and FLOW touch, so I am adding 6 px of space.'),
    msg('m-d03', 'c-design', 'u-3', ago(4, 17), 'Send me the SVG when it is ready. I will swap it into the sidebar and the sign-in page.'),
    msg('m-d04', 'c-design', 'u-1', ago(2, 14), 'BRD-102: we need dark mode values for every color token before the release.'),
    msg('m-d05', 'c-design', 'u-3', ago(1, 23), 'BRD-102 is in review. 24 tokens, all at 4.5:1 or better for body text.'),
    msg('m-d06', 'c-design', 'u-7', ago(0, 9), 'Empty-state illustrations (BRD-103) start next sprint. 5 screens: board, channels, search, notifications, tickets.', react('👍', 'u-1', 'u-3')),

    // Project channels
    msg('m-pn01', 'c-p-nex', 'u-2', ago(2, 9), '@all Build phase ends in 10 days. @NEX-101 and @NEX-105 are in review; NEX-103 shipped yesterday.'),
    msg('m-pn02', 'c-p-nex', 'u-5', ago(2, 8), 'I will run the token expiry cases on @NEX-101 first thing tomorrow.'),
    msg('m-pn03', 'c-p-nex', 'u-5', ago(0, 5), '@[Nour El-Sayed](u-2) the 30-second window passes on staging. @NEX-101 is ready for your review.'),
    msg('m-pn04', 'c-p-nex', 'u-2', ago(0, 3), '@[Mariam Fathy](u-3) can you take @NEX-106 today? The unread badge is next on the board.'),
    msg('m-pm01', 'c-p-mob', 'u-4', ago(1, 6), '@all Build is 5 days past its due date. @MOB-104 is over its 16-hour estimate and @MOB-103 was due yesterday.'),
    msg('m-pm02', 'c-p-mob', 'u-8', ago(1, 5), 'MOB-104: 2 offline cases left. I need 4 more hours.'),
    msg('m-pm03', 'c-p-mob', 'u-1', ago(0, 8), '@MOB gets a new release date today. @[Ahmed Shawky](u-4), send me the plan before noon so I can tell the client.'),
    msg('m-pe01', 'c-p-elm', 'u-2', ago(20), 'The El Moasser portal is live. The client signed off on all 5 phases.', react('🎉', 'u-1', 'u-3', 'u-5', 'u-7')),
    msg('m-pe02', 'c-p-elm', 'u-1', ago(19, 20), 'Well done. Close the project after the handover training.'),
    msg('m-ps01', 'c-p-sel', 'u-9', ago(1, 4), '@all Sela signed: a booking portal for 3 branches, 90 days, kickoff in 3 days. Ahmed is the project manager.'),
    msg('m-ps02', 'c-p-sel', 'u-4', ago(1, 2), 'Thanks Karim. The requirements workshop (@SEL-101) is on day 1.'),

    // Direct messages
    msg('m-e01', 'c-dm-1', 'u-2', ago(3, 14), 'Can we pair on the refresh token tests tomorrow at 11:00? I want to cover the 30-second grace window.'),
    msg('m-e02', 'c-dm-1', 'u-1', ago(3, 13, 40), 'Yes, 11:00 works. Bring the test plan.'),
    msg('m-e03', 'c-dm-1', 'u-2', ago(1, 12), 'The NEX-101 tests pass: 14 cases, 0 flaky. I am pushing the pull request now.'),
    msg('m-n01', 'c-dm-2', 'u-1', ago(2, 11), 'Do you have room for NEX-106 this sprint?'),
    msg('m-n02', 'c-dm-2', 'u-3', ago(2, 10), 'Yes, it is 3 points. I finish NEX-105 first.'),
    msg('m-n03', 'c-dm-2', 'u-1', ago(1, 10), 'Good. I will review it.'),
    msg('m-n04', 'c-dm-2', 'u-3', ago(0, 3, 30), 'The NEX-105 pull request is open: 412 lines changed in 9 files. A screen recording is attached.'),
    msg('m-y01', 'c-dm-3', 'u-7', ago(4, 11), 'Can you review the lockup before I send it to Mariam?'),
    msg('m-y02', 'c-dm-3', 'u-1', ago(4, 10), 'It looks right. Send it.'),
    msg('m-y03', 'c-dm-3', 'u-7', ago(4, 9, 30), 'Sent. She will swap it in tomorrow.'),
  ]

  const rawReplies: RawReply[] = [
    // m-g04: 2 replies
    reply('r-001', 'm-g04', 'u-5', ago(5, 20), 'Confirmed. 3 failures, 1 root cause.'),
    reply('r-002', 'm-g04', 'u-1', ago(5, 19), 'Good. Hold the release notes until NEX-103 merges.'),
    // m-f06: 3 replies
    reply('r-003', 'm-f06', 'u-3', ago(4, 19, 30), 'Reproduced at 390 px. The title needs line-clamp-2.'),
    reply('r-004', 'm-f06', 'u-5', ago(4, 18), 'It also happens with Arabic titles. They wrap at a different point.'),
    reply('r-005', 'm-f06', 'u-3', ago(3, 23), 'Fixed both. Titles clamp to 2 lines in English and Arabic.', react('👍', 'u-5')),
    // m-b07: 2 replies
    reply('r-006', 'm-b07', 'u-1', ago(4, 12), 'Add a test for exactly 100 rows and one for 101.'),
    reply('r-007', 'm-b07', 'u-2', ago(4, 10), 'Added both. They fail on main and pass on the branch.', react('✅', 'u-1')),
    // m-r09: 4 replies
    reply('r-008', 'm-r09', 'u-8', ago(2, 18), 'The 2 offline cache failures are mine. The fix lands today.'),
    reply('r-009', 'm-r09', 'u-2', ago(2, 17), 'Which NEX-101 case failed?'),
    reply('r-010', 'm-r09', 'u-5', ago(2, 16), 'Case 17. A refresh exactly 30 seconds after rotation returns 401. The spec says 30 seconds is still valid.'),
    reply('r-011', 'm-r09', 'u-2', ago(2, 15), 'Off by one. I compared with < instead of <=. Pushing the fix now.'),
  ]

  // ── Assemble, then derive ───────────────────────────────────────────────
  const replies = buildReplies(rawReplies, rawMessages)
  const messages = buildMessages(rawMessages, replies)
  // A project's channel holds exactly its people, as every later project edit keeps it (spec §4.4).
  for (const c of rawChannels) {
    const project = projects.find((p) => p.channelId === c.id)
    if (project) c.memberIds = [...projectPeopleIds(project, users)]
  }
  const channels = buildChannels(rawChannels, messages, replies, now)
  const tickets = buildTickets(rawTickets)

  // ── Work: timers on the last 5 working days (Sun–Thu), 05:50–15:05 UTC: Attendance's days come from them ──
  const days = workingDaysBefore(now, 5)
  const at = (day: Date, h: number, m = 0) => new Date(day.getTime() + (h * 60 + m) * 60_000).toISOString()
  const taskProject = new Map(tickets.map((t) => [t.key, t.projectId]))
  // Who works on what: two tasks each, morning and afternoon. MOB-104 ends past its 16-hour estimate (5 × 5 h 10 min).
  const workPlan: [userId: string, morning: string, afternoon: string][] = [
    ['u-2', 'NEX-101', 'NEX-102'],
    ['u-3', 'NEX-105', 'NEX-106'],
    ['u-4', 'MOB-103', 'MOB-101'],
    ['u-5', 'NEX-103', 'MOB-102'],
    ['u-6', 'NEX-107', 'MOB-105'],
    ['u-7', 'BRD-101', 'BRD-103'],
    ['u-8', 'MOB-104', 'MOB-102'],
  ]
  const timeEntries: TimeEntry[] = []
  const visits: Visit[] = []
  // Where timers start from (slice 5, timer slice 3): the office network and each person's laptop, with a few exceptions
  // so Attendance has something to show: Salma in late from her phone at home one day, Dina leaving early, Tarek's
  // place blocked.
  const office = '41.233.18.9'
  const laptop: Record<string, string> = { 'u-2': 'Chrome 130 · macOS', 'u-3': 'Chrome 130 · Windows', 'u-4': 'Edge 130 · Windows', 'u-5': 'Chrome 130 · Windows', 'u-6': 'Firefox 131 · Linux', 'u-7': 'Safari 18 · macOS', 'u-8': 'Chrome 130 · Windows' }
  const desk = (userId: string): CheckLocation => (userId === 'u-8' ? 'blocked' : { lat: (3_005_710 + Number(userId.slice(2))) / 100_000, lng: 31.2272, accuracy: 25 })
  const from = (userId: string): CheckSource => ({ ip: office, device: laptop[userId] ?? null, location: desk(userId) })
  days.forEach((day, d) => {
    for (const [userId, morning, afternoon] of workPlan) {
      const late = userId === 'u-5' && d === 1
      const early = userId === 'u-7' && d === 3
      // Cairo is UTC+2, or +3 in summer time (late April to late October): 5:50 UTC is 7:50 or 8:50 there, on time
      // either way; 7:40 is late and 13:30 early either way.
      const inAt = late ? at(day, 7, 40) : at(day, 5, 50)
      const outAt = early ? at(day, 13, 30) : at(day, 15, 5)
      const inFrom = late ? { ip: '197.48.112.6', device: 'Chrome 130 · Android', location: { lat: 30.0626, lng: 31.3409, accuracy: 12 } } : from(userId)
      const device = laptop[userId] ?? null
      visits.push(
        { id: `v-${userId}-${d}-a`, userId, day: day.toISOString().slice(0, 10), startedAt: inAt, endedAt: at(day, 11), minutes: late ? 170 : 205, ip: inFrom.ip, device: inFrom.device },
        { id: `v-${userId}-${d}-b`, userId, day: day.toISOString().slice(0, 10), startedAt: at(day, 11, 30), endedAt: outAt, minutes: early ? 110 : 190, ip: office, device },
      )
      const task = (key: string) => ({ projectId: taskProject.get(key) ?? '', taskId: `t-${key.toLowerCase()}` })
      // The day's first timer starts it and its last ends it. On the third day the timer stopped at 9 and the rest of
      // the morning was added by hand: it counts as time, not towards the day.
      const forgot = d === 2
      timeEntries.push(
        { id: `te-${userId}-${d}-a`, userId, ...task(morning), startedAt: inAt, endedAt: at(day, forgot ? 9 : 11), source: 'timer', note: '', endReason: 'stopped', startedFrom: inFrom },
        ...(forgot ? [{ id: `te-${userId}-${d}-m`, userId, ...task(morning), startedAt: at(day, 9), endedAt: at(day, 11), source: 'manual' as const, note: 'Added after the fact: forgot the timer.', endReason: null }] : []),
        { id: `te-${userId}-${d}-b`, userId, ...task(afternoon), startedAt: at(day, 11, 30), endedAt: outAt, source: 'timer', note: '', endReason: 'stopped', startedFrom: from(userId) },
      )
    }
  })

  // Right now: three people with a timer running, so the dashboard's "Working now" has a story. Admin, Ahmed, Salma and
  // Tarek stay free to start one live during the demo.
  // Never before today's midnight, so a seed made just after midnight still starts them today.
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const shift = (ms: number) => new Date(Math.max(now.getTime() - ms, midnight)).toISOString()
  for (const [userId, taskKey] of [['u-2', 'NEX-101'], ['u-3', 'NEX-106'], ['u-6', 'NEX-107']] as const) {
    const [start, end] = [shift(3 * 3_600_000), shift(60_000)]
    visits.push({ id: `v-${userId}-now`, userId, day: localDay(now), startedAt: start, endedAt: end, minutes: Math.round((Date.parse(end) - Date.parse(start)) / 70_000), ip: office, device: laptop[userId] ?? null })
    timeEntries.push({ id: `te-${userId}-now`, userId, projectId: 'p-nex', taskId: `t-${taskKey.toLowerCase()}`, startedAt: shift(3_600_000), endedAt: null, source: 'timer', note: '', endReason: null, startedFrom: from(userId) })
  }

  // Hourly cost in EGP (Admin only)
  const rates: Rate[] = [
    ['u-1', 650], ['u-2', 420], ['u-3', 300], ['u-4', 400], ['u-5', 240], ['u-6', 320], ['u-7', 280], ['u-8', 300], ['u-9', 260],
  ].map(([userId, hourlyCost]) => ({ id: `r-${userId}`, userId: userId as string, hourlyCost: hourlyCost as number, currency: 'EGP', effectiveFrom: '1970-01-01T00:00:00.000Z' }))

  // ── Files, comments and bugs ────────────────────────────────────────────
  const fileOf = (id: string, name: string, mimeType: string, base64: string, createdAt: string, uploadedBy: string, clip: Attachment['clip'] = null) => ({
    attachment: {
      id, name, mimeType, size: base64Size(base64), createdAt, uploadedBy, title: clip ? 'Voice message' : name, description: '', scanStatus: 'clean', thumbUrl: null, previewUrl: null, deletedAt: null,
    snippet: null, clip, folderId: null,
    } satisfies Attachment,
    bytes: { mimeType, base64 },
  })
  const files = [
    fileOf('a-shot-105', 'safari-focus-ring.png', 'image/png', screenshotPng, ago(0, 5), 'u-5'),
    fileOf('a-mob-scope', 'mobile-2.4.0-scope.pdf', 'application/pdf', scopePdf, ago(36), 'u-9'),
    fileOf('a-mob-checklist', 'release-2.4.0-checklist.txt', 'text/plain', checklistTxt, ago(3), 'u-4'),
    fileOf('a-nex-101-flow', 'token-rotation.pdf', 'application/pdf', scopePdf, ago(7, 4), 'u-2'),
  ]
  // Nour's note on the NEX-103 fix in #general carries a voice message (chat spec 6.9), so the player shows in the
  // prototype. On an existing message: #general's order and seq numbers stay as they were.
  const g04 = messages.find((m) => m.id === 'm-g04')!
  const waveform = Array.from({ length: 48 }, (_, i) => Math.round((0.35 + 0.6 * Math.abs(Math.sin(i / 3))) * 100) / 100)
  const voiceNote = fileOf('a-voice-g04', 'Voice message.wav', 'audio/wav', voiceNoteWav(), g04.createdAt, 'u-2', { kind: 'voice', durationMs: 4000, waveform })
  files.push(voiceNote)
  g04.attachments = [voiceNote.attachment]
  const attachments = files.map((f) => f.attachment)
  const projectFiles: ProjectFile[] = [
    { id: 'pf-mob-1', projectId: 'p-mob', attachmentId: 'a-mob-scope', uploadedBy: 'u-9', createdAt: ago(36) },
    { id: 'pf-mob-2', projectId: 'p-mob', attachmentId: 'a-mob-checklist', uploadedBy: 'u-4', createdAt: ago(3) },
  ]
  const comments: Comment[] = [
    { id: 'cm-001', taskId: 't-nex-101', projectId: 'p-nex', authorId: 'u-1', kind: 'comment', body: 'Approved once the 30-second window test passes.', attachmentIds: [], createdAt: ago(0, 8) },
    { id: 'cm-002', taskId: 't-nex-105', projectId: 'p-nex', authorId: 'u-5', kind: 'bug', body: 'Safari 18: the focus ring is missing on the last column when you move a card with the keyboard.', attachmentIds: ['a-shot-105'], createdAt: ago(0, 5) },
    { id: 'cm-003', taskId: 't-nex-105', projectId: 'p-nex', authorId: 'u-3', kind: 'comment', body: 'Fixed in the latest push. Every column now shows the ring on focus-visible.', attachmentIds: [], createdAt: ago(0, 4, 30) },
    { id: 'cm-004', taskId: 't-mob-104', projectId: 'p-mob', authorId: 'u-8', kind: 'bug', body: 'Unsent messages vanish after a force quit. Steps: airplane mode, send 2 messages, force quit, reopen.', attachmentIds: [], createdAt: ago(0, 7) },
    { id: 'cm-005', taskId: 't-mob-104', projectId: 'p-mob', authorId: 'u-4', kind: 'comment', body: 'Out of scope for 2.4.0. We are past the 16-hour estimate, so we stop here and file a follow-up.', attachmentIds: [], createdAt: ago(0, 6) },
    { id: 'cm-006', taskId: 't-elm-104', projectId: 'p-elm', authorId: 'u-5', kind: 'bug', body: 'Credit note 0042: VAT shows +140 EGP instead of -140 EGP.', attachmentIds: [], createdAt: ago(37) },
  ]

  const data = {
    version: DB_VERSION,
    currentUserId: 'u-1',
    users,
    workspaces,
    projects,
    sprints,
    tickets,
    channels,
    messages,
    replies,
    teams,
    phases,
    deliverables,
    comments,
    attachments,
    projectFiles,
    timeEntries,
    rates,
    // Everyone starts with the same state, so each persona sees the demo's unread badges, a starred and a muted channel.
    channelState: Object.fromEntries(
      users.map((u) => [u.id, buildChannelState(rawChannels, messages, { unread: { 'c-frontend': 3, 'c-dm-2': 1 }, starred: ['c-backend'], muted: ['c-design'] })]),
    ),
    counters: buildCounters(projects.map((p) => p.id), tickets),
    mentionReads: {} as Record<string, string[]>,
    // History starts with each task's creation, by whoever reported it, so the History tabs aren't empty.
    drafts: [],
    trash: [],
    threadFollows: [],
    notifications: [],
    invitations: [],
    saved: [],
    scheduled: [],
    pins: [],
    folders: [],
    bookmarks: [],
    pages: [],
    pageVersions: [],
    pageMentions: [],
    sidebarOrders: [],
    notificationPrefs: [],
    roles: builtInRoles(),
    audit: [],
    settings: { archiveRetentionDays: 365, workHours: { ...DEFAULT_WORK_HOURS, days: [...DEFAULT_WORK_HOURS.days] }, timerTimeoutHours: DEFAULT_TIMEOUT_HOURS },
    visits: visits.sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1)),
    activity: tickets
      .map((t) => ({ id: `act-${t.id}`, projectId: t.projectId, taskKey: t.key, actorId: t.reporterId, at: t.createdAt, kind: 'task.created' as const, changes: [] }))
      .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)),
  }
  // The bell starts with the last day's mentions only: everything older counts as read.
  const dayAgo = new Date(now.getTime() - 24 * 3_600_000).toISOString()
  for (const user of users) data.mentionReads[user.id] = inboxFor(data, user.id, () => true, Infinity).filter((m) => m.createdAt < dayAgo).map((m) => m.id)
  seedAuditHistory(data, now)
  return { data, files: Object.fromEntries(files.map((f) => [f.attachment.id, f.bytes])) }
}
