import type {
  ChatMessage,
  Priority,
  Reaction,
  Sprint,
  StoredChannel,
  ThreadReply,
  Ticket,
  TicketStatus,
  User,
} from '@/api/types'
import { DB_VERSION, type DbData } from './db'
import { parseTicketKeys } from './text'

// ── Builders and derived-field helpers ────────────────────────────────────
// Everything below is pure: the same `now` always gives the same data (no Math.random, no Date.now).

type RawMessage = {
  id: string; channelId: string; senderId: string; createdAt: string; content: string; reactions: Reaction[]
}
type RawReply = { id: string; messageId: string; senderId: string; createdAt: string; content: string; reactions: Reaction[] }
type RawChannel = Omit<StoredChannel, 'lastMessageAt'>
type RawTicket = {
  key: string; title: string; description: string; status: TicketStatus; priority: Priority
  points: number | null; assigneeId: string | null; reporterId: string; sprintId: string | null
  createdAt: string; updatedAt: string; link?: { channelId: string; messageId: string }
}

const react = (emoji: string, ...userIds: string[]): Reaction => ({ emoji, userIds })

const byTimeThenId = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1

const latestOf = (times: string[]): string | null => (times.length ? times.reduce((a, b) => (a >= b ? a : b)) : null)

/** Adds threadCount, lastReplyAt and linkedTicketKeys, which the server works out. */
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
        editedAt: null,
      }
    })
    .sort(byTimeThenId)
}

function buildReplies(raw: RawReply[], messages: RawMessage[]): ThreadReply[] {
  const channelOf = new Map(messages.map((m) => [m.id, m.channelId]))
  return raw
    .map((r) => ({ ...r, channelId: channelOf.get(r.messageId) ?? '', attachments: [] }))
    .sort(byTimeThenId)
}

/** lastMessageAt is the newest message or reply in the channel. */
function buildChannels(raw: RawChannel[], messages: ChatMessage[], replies: ThreadReply[]): StoredChannel[] {
  return raw.map((c) => ({
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
    return {
      id: `t-${t.key.toLowerCase()}`,
      key: t.key,
      projectId: `p-${projectKey.toLowerCase()}`,
      title: t.title,
      description: t.description,
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
 * The current user's last-read time per channel. A channel with `unread[id] = n` is read up to the message
 * just before its last n; every other channel is read up to `now`.
 */
function buildReads(
  channelIds: string[],
  messages: ChatMessage[],
  unread: Record<string, number>,
  now: Date,
): Record<string, string> {
  return Object.fromEntries(
    channelIds.map((id) => {
      const n = unread[id] ?? 0
      if (n === 0) return [id, now.toISOString()]
      const own = messages.filter((m) => m.channelId === id) // already oldest first
      return [id, own[own.length - n - 1].createdAt]
    }),
  )
}

// ── The seed ──────────────────────────────────────────────────────────────

export function seed(now: Date): DbData {
  /** ISO time `d` days, `h` hours and `m` minutes before now (negative values reach into the future). */
  const ago = (d: number, h = 0, m = 0) => new Date(now.getTime() - ((d * 24 + h) * 60 + m) * 60_000).toISOString()

  const msg = (id: string, channelId: string, senderId: string, createdAt: string, content: string, ...reactions: Reaction[]): RawMessage =>
    ({ id, channelId, senderId, createdAt, content, reactions })
  const reply = (id: string, messageId: string, senderId: string, createdAt: string, content: string, ...reactions: Reaction[]): RawReply =>
    ({ id, messageId, senderId, createdAt, content, reactions })

  // ── Users ───────────────────────────────────────────────────────────────
  const users: User[] = [
    { id: 'u-1', name: 'Youssef Abdelrahman', email: 'youssef.abdelrahman@spark-sys.com', title: 'Engineering Lead', role: 'Management', presence: 'active' },
    { id: 'u-2', name: 'Nour El-Sayed', email: 'nour.elsayed@spark-sys.com', title: 'Senior Backend Engineer', role: 'Management', presence: 'active' },
    { id: 'u-3', name: 'Mariam Fathy', email: 'mariam.fathy@spark-sys.com', title: 'Frontend Engineer', role: 'Management', presence: 'active' },
    { id: 'u-4', name: 'Ahmed Shawky', email: 'ahmed.shawky@spark-sys.com', title: 'iOS Engineer', role: 'Management', presence: 'away' },
    { id: 'u-5', name: 'Salma Ibrahim', email: 'salma.ibrahim@spark-sys.com', title: 'QA Engineer', role: 'Management', presence: 'active' },
    { id: 'u-6', name: 'Hossam Gaber', email: 'hossam.gaber@spark-sys.com', title: 'DevOps Engineer', role: 'Management', presence: 'offline' },
    { id: 'u-7', name: 'Dina Mansour', email: 'dina.mansour@spark-sys.com', title: 'Product Designer', role: 'Management', presence: 'away' },
    { id: 'u-8', name: 'Tarek Lotfy', email: 'tarek.lotfy@spark-sys.com', title: 'Android Engineer', role: 'Management', presence: 'offline' },
  ]

  // ── Workspaces, projects and sprints ────────────────────────────────────
  const workspaces = [
    { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' },
    { id: 'ws-design', slug: 'design', name: 'Spark Design' },
  ]

  const projects = [
    { id: 'p-nex', workspaceId: 'ws-eng', key: 'NEX', name: 'Nexus Core', description: 'API, database and web client for Spark Flow.', leadId: 'u-2' },
    { id: 'p-mob', workspaceId: 'ws-eng', key: 'MOB', name: 'Mobile App', description: 'iOS and Android apps. Release 2.4.0 is the current target.', leadId: 'u-4' },
    { id: 'p-brd', workspaceId: 'ws-design', key: 'BRD', name: 'Brand Refresh', description: 'Logo lockup, color tokens and illustrations for Spark Flow.', leadId: 'u-7' },
  ]

  // Each project: one 14-day active sprint that started 7 days ago, then one planned sprint right after it.
  const sprint = (id: string, projectId: string, name: string, goal: string, state: 'active' | 'planned'): Sprint =>
    state === 'active'
      ? { id, projectId, name, goal, state, startDate: ago(7), endDate: ago(-7) }
      : { id, projectId, name, goal, state, startDate: ago(-8), endDate: ago(-22) }
  const sprints: Sprint[] = [
    sprint('s-nex-1', 'p-nex', 'Sprint 14', 'Rotate refresh tokens and fix the duplicate invoice rows.', 'active'),
    sprint('s-nex-2', 'p-nex', 'Sprint 15', 'Audit log for role changes and the first WebSocket load test.', 'planned'),
    sprint('s-mob-1', 'p-mob', 'Sprint 9', 'Ship 2.4.0 with offline reading and no cold start crash.', 'active'),
    sprint('s-mob-2', 'p-mob', 'Sprint 10', 'Biometric unlock and dark mode fixes.', 'planned'),
    sprint('s-brd-1', 'p-brd', 'Sprint 3', 'Final logo lockup and dark mode color tokens.', 'active'),
    sprint('s-brd-2', 'p-brd', 'Sprint 4', 'Empty-state illustrations.', 'planned'),
  ]

  // ── Tickets (key numbers start at 101 per project) ──────────────────────
  const rawTickets: RawTicket[] = [
    // Nexus Core
    { key: 'NEX-101', title: 'Rotate refresh tokens on POST /auth/refresh', description: 'Issue a new refresh token on every use. Keep the old one valid for 30 seconds so retries still work.', status: 'inReview', priority: 'high', points: 5, assigneeId: 'u-2', reporterId: 'u-1', sprintId: 's-nex-1', createdAt: ago(6, 2), updatedAt: ago(0, 6) },
    { key: 'NEX-102', title: 'Return 429 with Retry-After from /v2/search', description: 'Limit each API key to 60 requests per minute. Send Retry-After in seconds.', status: 'todo', priority: 'medium', points: 3, assigneeId: 'u-2', reporterId: 'u-1', sprintId: 's-nex-1', createdAt: ago(6, 1), updatedAt: ago(1, 19) },
    { key: 'NEX-103', title: 'Fix duplicate rows in GET /v2/invoices at page size 100', description: 'The last row of page 1 shows again as the first row of page 2. Compare the cursor with > instead of >=.', status: 'done', priority: 'urgent', points: 2, assigneeId: 'u-2', reporterId: 'u-5', sprintId: 's-nex-1', createdAt: ago(4, 14), updatedAt: ago(1, 18) },
    { key: 'NEX-104', title: 'Add an index on messages (channel_id, created_at)', description: 'Channels with more than 50,000 messages take 1.8 s at p95. Target is under 100 ms.', status: 'done', priority: 'high', points: 2, assigneeId: 'u-6', reporterId: 'u-2', sprintId: 's-nex-1', createdAt: ago(5, 16), updatedAt: ago(4, 22) },
    { key: 'NEX-105', title: 'Board: drag a card to change its status', description: 'Pointer, touch and keyboard. Drop threshold is half the card height. Works in light and dark mode at 390 px.', status: 'inReview', priority: 'high', points: 8, assigneeId: 'u-3', reporterId: 'u-1', sprintId: 's-nex-1', createdAt: ago(6, 6), updatedAt: ago(0, 6) },
    {
      key: 'NEX-106', title: 'Show an unread badge in the channel list', description: 'Show the unread count next to the channel name. Cap it at 99+. Clear it when the user opens the channel.',
      status: 'todo', priority: 'medium', points: 3, assigneeId: 'u-3', reporterId: 'u-1', sprintId: 's-nex-1', createdAt: ago(3, 20, 5), updatedAt: ago(2, 10),
      link: { channelId: 'c-frontend', messageId: 'm-f08' },
    },
    { key: 'NEX-107', title: 'Upgrade PostgreSQL from 15.6 to 16.4 on staging', description: 'Dump, upgrade, restore. Expect 30 minutes of downtime. Run the full test suite after.', status: 'inProgress', priority: 'medium', points: null, assigneeId: 'u-6', reporterId: 'u-2', sprintId: 's-nex-1', createdAt: ago(3, 8), updatedAt: ago(0, 5) },
    { key: 'NEX-108', title: 'Load test WebSocket fan-out at 5,000 connections', description: 'One channel, 5,000 clients, 20 messages per second. Record p95 delivery time and memory per connection.', status: 'backlog', priority: 'low', points: null, assigneeId: null, reporterId: 'u-2', sprintId: null, createdAt: ago(5, 3), updatedAt: ago(5, 3) },
    { key: 'NEX-109', title: 'Export the ticket list to CSV', description: 'One row per ticket. Columns: key, title, status, priority, assignee, points.', status: 'backlog', priority: 'low', points: 3, assigneeId: null, reporterId: 'u-1', sprintId: null, createdAt: ago(4, 4), updatedAt: ago(4, 4) },
    { key: 'NEX-110', title: 'Audit log for workspace role changes', description: 'Record who changed which role, when, and from what value. Keep entries for 365 days.', status: 'todo', priority: 'medium', points: 5, assigneeId: null, reporterId: 'u-1', sprintId: 's-nex-2', createdAt: ago(3, 3), updatedAt: ago(3, 3) },
    // Mobile App
    { key: 'MOB-101', title: 'Cold start crash on iOS 18.2 when the keychain is locked', description: '38 crashes in 24 hours, all on devices with a passcode. The app reads the keychain before the first unlock.', status: 'done', priority: 'urgent', points: 3, assigneeId: 'u-4', reporterId: 'u-5', sprintId: 's-mob-1', createdAt: ago(5, 12), updatedAt: ago(4, 15) },
    { key: 'MOB-102', title: 'Push notification opens the wrong channel', description: 'Tapping a notification opens #general. On Android the channelId arrives as a number, so the comparison fails.', status: 'inReview', priority: 'high', points: 2, assigneeId: 'u-8', reporterId: 'u-5', sprintId: 's-mob-1', createdAt: ago(5, 10), updatedAt: ago(3, 22) },
    { key: 'MOB-103', title: 'Add biometric unlock for Face ID and fingerprint', description: 'Offer it after the first sign-in. Fall back to the passcode after 3 failed attempts.', status: 'todo', priority: 'medium', points: 5, assigneeId: 'u-4', reporterId: 'u-1', sprintId: 's-mob-2', createdAt: ago(4, 6), updatedAt: ago(4, 6) },
    { key: 'MOB-104', title: 'Cache the last 50 messages per channel for offline reading', description: 'Store in SQLite. Show the cache first, then refresh from the network. Clear it on sign-out.', status: 'inProgress', priority: 'high', points: 8, assigneeId: 'u-8', reporterId: 'u-1', sprintId: 's-mob-1', createdAt: ago(6, 3), updatedAt: ago(0, 7) },
    { key: 'MOB-105', title: 'Android 2.4.0 build fails at the signing step', description: 'CI uses an expired signing key secret. Replace the secret and rerun the release job.', status: 'done', priority: 'high', points: 1, assigneeId: 'u-6', reporterId: 'u-8', sprintId: 's-mob-1', createdAt: ago(4, 16), updatedAt: ago(3, 18) },
    { key: 'MOB-106', title: 'Dark mode: attachment preview text is unreadable', description: 'Caption text is 2.1:1 against the preview background. It needs 4.5:1.', status: 'todo', priority: 'low', points: 1, assigneeId: null, reporterId: 'u-7', sprintId: 's-mob-2', createdAt: ago(2, 12), updatedAt: ago(2, 12) },
    { key: 'MOB-107', title: 'Reduce the Android APK from 41 MB to under 28 MB', description: 'Split by ABI, drop unused fonts, and compress images to WebP.', status: 'backlog', priority: 'low', points: null, assigneeId: null, reporterId: 'u-8', sprintId: null, createdAt: ago(5, 5), updatedAt: ago(5, 5) },
    { key: 'MOB-108', title: 'Open a ticket from a /t/NEX-101 deep link', description: 'Handle the link on cold start and while the app is open. Show the sign-in screen first if the session expired.', status: 'backlog', priority: 'medium', points: 3, assigneeId: 'u-8', reporterId: 'u-1', sprintId: null, createdAt: ago(3, 5), updatedAt: ago(3, 5) },
    // Brand Refresh
    { key: 'BRD-101', title: 'Redraw the logo lockup at 16 px and 24 px', description: 'The divider and FLOW text touch at 16 px. Add 6 px of space and export SVG.', status: 'inProgress', priority: 'high', points: 3, assigneeId: 'u-7', reporterId: 'u-1', sprintId: 's-brd-1', createdAt: ago(5, 17), updatedAt: ago(2, 9) },
    { key: 'BRD-102', title: 'Publish dark mode values for all 24 color tokens', description: 'Body text must pass 4.5:1 on every surface. Large text must pass 3:1.', status: 'inReview', priority: 'medium', points: 2, assigneeId: 'u-3', reporterId: 'u-7', sprintId: 's-brd-1', createdAt: ago(3, 6), updatedAt: ago(1, 23) },
    { key: 'BRD-103', title: 'Draw empty-state illustrations for 5 screens', description: 'Board, channels, search, notifications and tickets. SVG, under 8 KB each.', status: 'todo', priority: 'low', points: 5, assigneeId: 'u-7', reporterId: 'u-7', sprintId: 's-brd-2', createdAt: ago(2, 5), updatedAt: ago(0, 9) },
    { key: 'BRD-104', title: 'Update the brand guideline PDF to v1.2', description: 'Add the new lockup, the dark mode tokens and the spacing scale.', status: 'backlog', priority: 'medium', points: null, assigneeId: null, reporterId: 'u-7', sprintId: null, createdAt: ago(1, 4), updatedAt: ago(1, 4) },
  ]

  // ── Channels ────────────────────────────────────────────────────────────
  const rawChannels: RawChannel[] = [
    { id: 'c-general', workspaceId: 'ws-eng', kind: 'channel', name: 'general', topic: 'Updates for all of Spark Engineering. Ticket talk goes in the project channels.', memberIds: ['u-1', 'u-2', 'u-3', 'u-4', 'u-5', 'u-6', 'u-7', 'u-8'], isPrivate: false },
    { id: 'c-frontend', workspaceId: 'ws-eng', kind: 'channel', name: 'frontend-dev', topic: 'React web client. Pull requests, design handoff and browser bugs.', memberIds: ['u-1', 'u-3', 'u-5', 'u-7'], isPrivate: false },
    { id: 'c-backend', workspaceId: 'ws-eng', kind: 'channel', name: 'backend', topic: 'API, database and queues. Post slow queries with the EXPLAIN output.', memberIds: ['u-1', 'u-2', 'u-5', 'u-6'], isPrivate: false },
    { id: 'c-release', workspaceId: 'ws-eng', kind: 'channel', name: 'release-v2', topic: 'Release 2.4.0: scope, QA status and the go/no-go call. Members only.', memberIds: ['u-1', 'u-2', 'u-4', 'u-5', 'u-6', 'u-8'], isPrivate: true },
    { id: 'c-design', workspaceId: 'ws-design', kind: 'channel', name: 'design', topic: 'Brand Refresh. Files live in Figma. Decisions are posted here.', memberIds: ['u-1', 'u-3', 'u-7'], isPrivate: false },
    { id: 'c-dm-1', workspaceId: 'ws-eng', kind: 'dm', name: null, topic: '', memberIds: ['u-1', 'u-2'], isPrivate: true },
    { id: 'c-dm-2', workspaceId: 'ws-eng', kind: 'dm', name: null, topic: '', memberIds: ['u-1', 'u-3'], isPrivate: true },
    { id: 'c-dm-3', workspaceId: 'ws-design', kind: 'dm', name: null, topic: '', memberIds: ['u-1', 'u-7'], isPrivate: true },
  ]

  // ── Messages and replies ────────────────────────────────────────────────
  const rawMessages: RawMessage[] = [
    // #general
    msg('m-g01', 'c-general', 'u-1', ago(6, 20), 'Sprint 14 starts today. Goals: ship refresh-token rotation (NEX-101) and fix the duplicate invoice rows (NEX-103).'),
    msg('m-g02', 'c-general', 'u-6', ago(6, 18), 'Staging was down for 12 minutes after the 09:40 deploy. Cause: the REDIS_URL variable was missing. It is set, and the app now checks it at startup.'),
    msg('m-g03', 'c-general', 'u-5', ago(5, 22), 'Regression run on build 2.3.9: 412 passed, 3 failed. All 3 failures are in the invoice export.'),
    msg('m-g04', 'c-general', 'u-2', ago(5, 21), 'The 3 failures come from NEX-103. At page size 100 the last row appears twice. I have a fix and I am writing the test.'),
    msg('m-g05', 'c-general', 'u-4', ago(4, 17), 'TestFlight build 2.4.0 (118) is out. Please sign in on iOS 18.2 and report any crash on MOB-101.'),
    msg('m-g06', 'c-general', 'u-8', ago(4, 16), 'The Android 2.4.0 build failed at the signing step. Hossam is on it, see MOB-105.'),
    msg('m-g07', 'c-general', 'u-1', ago(3, 19), 'Demo for the Cairo team is in 2 days at 14:00. Send me your numbers by tomorrow noon.'),
    msg('m-g08', 'c-general', 'u-3', ago(2, 15), 'Team lunch order closes at 13:00. Koshary or shawarma? Reply with one.', react('👍', 'u-1', 'u-5', 'u-8'), react('😂', 'u-2')),
    msg('m-g09', 'c-general', 'u-6', ago(1, 20), 'Maintenance tonight from 23:00 to 23:30. The staging database moves to PostgreSQL 16.4.'),
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
    msg('m-f09', 'c-frontend', 'u-3', ago(3, 20), 'Filed NEX-106 for the badge. I take it after NEX-105.'),
    msg('m-f10', 'c-frontend', 'u-7', ago(2, 18), 'Sidebar group labels: 11 px, uppercase, 0.04em tracking. The spec is on the Figma page.'),
    msg('m-f11', 'c-frontend', 'u-3', ago(2, 17), 'Applied. The sidebar is 264 px wide on desktop and becomes a drawer under 1024 px.'),
    msg('m-f12', 'c-frontend', 'u-5', ago(1, 21), 'Bundle check: the main chunk is 187 kB gzipped. The budget is 200 kB.'),
    msg('m-f13', 'c-frontend', 'u-1', ago(1, 20), 'Stay under it. Lazy-load the thread panel. Nobody opens it on first paint.'),
    msg('m-f14', 'c-frontend', 'u-3', ago(1, 3), 'The thread panel loads on demand. The main chunk is 171 kB gzipped.'),
    msg('m-f15', 'c-frontend', 'u-3', ago(0, 6), 'NEX-105 is in review. Dragging between all 5 columns works with mouse, touch and keyboard.', react('👀', 'u-1')),
    msg('m-f16', 'c-frontend', 'u-5', ago(0, 4), 'I test NEX-105 on Safari 18 and Chrome 130 this afternoon.'),
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
    msg('m-r10', 'c-release', 'u-1', ago(1, 22), 'Code freeze is tomorrow at 18:00. Anything not in review by then moves to 2.5.'),
    msg('m-r11', 'c-release', 'u-8', ago(0, 7), 'MOB-104 works offline for the last 50 messages. One bug left: unsent messages vanish after a force quit.'),
    msg('m-r12', 'c-release', 'u-1', ago(0, 1), 'Decision: unsent messages are out of scope for 2.4.0. We ship the 50-message cache and file the rest after release.'),

    // #design
    msg('m-d01', 'c-design', 'u-7', ago(5, 16), 'Brand Refresh kickoff. 4 tickets this sprint. BRD-101 comes first: the logo lockup at 16 px and 24 px.'),
    msg('m-d02', 'c-design', 'u-7', ago(4, 18), 'Draft lockup is in Figma. At 16 px the divider and FLOW touch, so I am adding 6 px of space.'),
    msg('m-d03', 'c-design', 'u-3', ago(4, 17), 'Send me the SVG when it is ready. I will swap it into the sidebar and the sign-in page.'),
    msg('m-d04', 'c-design', 'u-1', ago(2, 14), 'BRD-102: we need dark mode values for every color token before the release.'),
    msg('m-d05', 'c-design', 'u-3', ago(1, 23), 'BRD-102 is in review. 24 tokens, all at 4.5:1 or better for body text.'),
    msg('m-d06', 'c-design', 'u-7', ago(0, 9), 'Empty-state illustrations (BRD-103) start next sprint. 5 screens: board, channels, search, notifications, tickets.', react('👍', 'u-1', 'u-3')),

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
  const channels = buildChannels(rawChannels, messages, replies)
  const tickets = buildTickets(rawTickets)

  return {
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
    reads: buildReads(rawChannels.map((c) => c.id), messages, { 'c-frontend': 3, 'c-dm-2': 1 }, now),
    counters: buildCounters(projects.map((p) => p.id), tickets),
  }
}
