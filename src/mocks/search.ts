import type { Api, Attachment, ChatMessage, MessageHit, SearchHit, SearchRequest, SearchTab, TaskRef, ThreadReply } from '@/api/types'
import { columnsOf } from '@/lib/boardColumns'
import { bodyText, type Block, type Body, type Inline } from '@/lib/messageBody'
import { matches, parseQuery, relevance, type ParsedQuery } from '@/lib/searchQuery'
import { withUnread } from './chat'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import { badRequest, clone, currentUser } from './shared'

const PAGE = 20
const OTHER_LIMIT = 50
const TABS: SearchTab[] = ['messages', 'files', 'tasks', 'channels', 'people']

/** A block's inlines, code left out (as the link preview reads them). */
const inlines = (b: Block): Inline[] => (b.type === 'p' ? b.children : b.type === 'quote' ? b.children.flatMap(inlines) : b.type === 'code' ? [] : b.items.flat())
const hasLink = (body: Body) => body.flatMap(inlines).some((n) => n.type === 'link')
const liveFiles = (files: Attachment[]) => files.filter((f) => !f.deletedAt)

/** The day a time falls on, YYYY-MM-DD, in the browser's zone (the mock runs there; a server uses the request's `tz`). */
const dayOf = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Row = { hit: MessageHit; row: ChatMessage | ThreadReply; score: number }

/** Messages and replies I may read in this workspace (§9): public channels, and private ones and DMs I'm in. */
function readableChannelIds(data: DbData, userId: string, workspaceId: string): Set<string> {
  return new Set(data.channels.filter((c) => c.workspaceId === workspaceId && (!c.isPrivate || c.memberIds.includes(userId))).map((c) => c.id))
}

function messageRows(data: DbData, readable: Set<string>, q: ParsedQuery, r: SearchRequest): Row[] {
  const pinned = new Set(data.pins.map((p) => p.messageId))
  const keep = (row: ChatMessage | ThreadReply, isReply: boolean, threaded: boolean) => {
    if (!readable.has(row.channelId) || row.deletedAt) return false
    if (r.from.length && !r.from.includes(row.senderId)) return false
    if (r.in && row.channelId !== r.in) return false
    if (r.thread && !threaded) return false
    if (r.after && dayOf(row.createdAt) < r.after) return false
    if (r.before && dayOf(row.createdAt) >= r.before) return false
    if (r.has === 'file' && liveFiles(row.attachments).length === 0) return false
    if (r.has === 'link' && !hasLink(row.body)) return false
    if (r.has === 'pin' && (isReply || !pinned.has(row.id))) return false
    if (r.has === 'reaction' && row.reactions.length === 0) return false
    return matches(bodyText(row.body), q)
  }
  const rows: Row[] = []
  for (const m of data.messages) {
    // System lines and task cards aren't anyone's words; a reply's channel copy is found as the reply.
    if (m.system || m.taskEvent || m.broadcast) continue
    if (!keep(m, false, m.threadCount > 0)) continue
    const text = bodyText(m.body)
    rows.push({ row: m, score: relevance(text, q), hit: { kind: 'message', target: { kind: 'message', id: m.id }, channelId: m.channelId, rootId: null, senderId: m.senderId, text, createdAt: m.createdAt } })
  }
  for (const reply of data.replies) {
    if (!keep(reply, true, true)) continue
    const text = bodyText(reply.body)
    rows.push({ row: reply, score: relevance(text, q), hit: { kind: 'message', target: { kind: 'reply', id: reply.id }, channelId: reply.channelId, rootId: reply.messageId, senderId: reply.senderId, text, createdAt: reply.createdAt } })
  }
  const newest = (a: Row, b: Row) => (a.hit.createdAt < b.hit.createdAt ? 1 : a.hit.createdAt > b.hit.createdAt ? -1 : 0)
  return rows.sort(r.sort === 'newest' ? newest : (a, b) => b.score - a.score || newest(a, b))
}

/** Files shared where I may read, by title or name; each once, where it was shared last. */
function fileHits(data: DbData, readable: Set<string>, q: ParsedQuery, r: SearchRequest): SearchHit[] {
  const byId = new Map<string, SearchHit & { kind: 'file' }>()
  const add = (row: ChatMessage | ThreadReply, messageId: string, replyId: string | null) => {
    if (!readable.has(row.channelId) || row.deletedAt) return
    if ((r.from.length && !r.from.includes(row.senderId)) || (r.in && row.channelId !== r.in)) return
    if ((r.after && dayOf(row.createdAt) < r.after) || (r.before && dayOf(row.createdAt) >= r.before)) return
    for (const file of liveFiles(row.attachments)) {
      if (!matches(`${file.title} ${file.name}`, q)) continue
      const seen = byId.get(file.id)
      if (!seen || seen.at < row.createdAt) byId.set(file.id, { kind: 'file', file, channelId: row.channelId, messageId, replyId, senderId: row.senderId, at: row.createdAt })
    }
  }
  for (const m of data.messages) if (!m.broadcast) add(m, m.id, null)
  for (const reply of data.replies) add(reply, reply.messageId, reply.id)
  return [...byId.values()].sort((a, b) => (a.at < b.at ? 1 : -1))
}

function taskRefOf(data: DbData, ticket: DbData['tickets'][number]): TaskRef | null {
  const project = data.projects.find((p) => p.id === ticket.projectId)
  if (!project) return null
  const column = columnsOf(project).find((c) => c.id === ticket.status)
  return {
    key: ticket.key, title: ticket.title, status: ticket.status, statusLabel: column?.label ?? ticket.status, category: column?.category ?? 'todo',
    projectKey: project.key, projectName: project.name, assigneeId: ticket.assigneeId,
  }
}

/**
 * Search (spec 6.12), over what this person may read (§9). Messages and files take every filter; tasks, channels and
 * people go by the words alone, and need some. Messages come 20 a page, the other tabs up to 50.
 */
export function searchApi(db: MockDb): Api['search'] {
  return {
    async run(workspaceId, request) {
      await delay()
      if (!TABS.includes(request.tab)) throw badRequest('Pick a tab.')
      const data = await db.read()
      const me = currentUser(data).id
      const q = parseQuery(request.q)
      const worded = q.words.length + q.phrases.length > 0
      const filtered = worded || request.from.length > 0 || request.in !== null || request.has !== null || request.thread || request.after !== null || request.before !== null
      const readable = readableChannelIds(data, me, workspaceId)

      const messages = filtered ? messageRows(data, readable, q, request).map((r) => r.hit) : []
      const files = filtered ? fileHits(data, readable, q, request) : []
      const projects = new Set(data.projects.filter((p) => p.workspaceId === workspaceId && !p.archivedAt).map((p) => p.id))
      const tasks: SearchHit[] = worded
        ? data.tickets
            .filter((t) => projects.has(t.projectId) && !t.archivedAt && matches(`${t.key} ${t.title}`, q))
            .flatMap((t) => {
              const task = taskRefOf(data, t)
              return task ? [{ kind: 'task' as const, task }] : []
            })
        : []
      const channels: SearchHit[] = worded
        ? data.channels
            .filter((c) => c.kind === 'channel' && readable.has(c.id) && matches(`${c.name ?? ''} ${c.topic ?? ''}`, q))
            .map((c) => ({ kind: 'channel' as const, channel: withUnread(data, c) }))
        : []
      const people: SearchHit[] = worded ? data.users.filter((u) => matches(`${u.name} ${u.title ?? ''}`, q)).map((user) => ({ kind: 'person' as const, user })) : []

      const all: Record<SearchTab, SearchHit[]> = { messages, files, tasks, channels, people }
      const counts = Object.fromEntries(TABS.map((t) => [t, all[t].length])) as Record<SearchTab, number>
      const list = all[request.tab]
      if (request.tab !== 'messages') return clone({ counts, items: list.slice(0, OTHER_LIMIT), nextCursor: null })
      const from = request.cursor === undefined ? 0 : Number(request.cursor)
      if (!Number.isInteger(from) || from < 0) throw badRequest('That page is gone. Search again.')
      return clone({ counts, items: list.slice(from, from + PAGE), nextCursor: from + PAGE < list.length ? String(from + PAGE) : null })
    },
  }
}
