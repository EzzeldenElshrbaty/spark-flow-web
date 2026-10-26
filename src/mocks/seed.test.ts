import { describe, expect, it } from 'vitest'
import type { ChatMessage, ThreadReply } from '@/api/types'
import { DB_VERSION } from './db'
import { seed } from './seed'
import { parseTicketKeys } from './text'

const now = new Date('2026-10-26T12:00:00Z')
const data = seed(now)
const DAY = 24 * 60 * 60 * 1000

const ids = (rows: { id: string }[]) => rows.map((r) => r.id)
const latest = (times: string[]) => times.reduce((a, b) => (a >= b ? a : b))
const keyNumber = (key: string) => Number(key.split('-')[1])

describe('seed', () => {
  it('roles cover all four', () => {
    expect(new Set(data.users.map((u) => u.role))).toEqual(new Set(['admin', 'sales', 'pm', 'member']))
  })

  it('new collections exist', () => {
    for (const name of ['teams', 'phases', 'deliverables', 'comments', 'attachments', 'projectFiles', 'timeEntries', 'checkIns', 'rates'] as const)
      expect(Array.isArray(data[name])).toBe(true)
  })

  it('matches the spec volumes', () => {
    expect(data.version).toBe(DB_VERSION)
    expect(data.workspaces.map((w) => w.slug)).toEqual(['engineering', 'design'])
    expect(data.projects.map((p) => p.key)).toEqual(['NEX', 'MOB', 'BRD'])
    expect(data.tickets.filter((t) => t.projectId !== 'p-brd').length).toBeGreaterThanOrEqual(14)
    expect(data.tickets.filter((t) => t.projectId === 'p-brd')).toHaveLength(4)
    expect(data.channels.filter((c) => c.kind === 'channel').map((c) => c.name)).toEqual(
      expect.arrayContaining(['general', 'frontend-dev', 'backend', 'release-v2', 'design']))
    expect(data.channels.filter((c) => c.kind === 'dm')).toHaveLength(3)
    expect(data.channels.some((c) => c.isPrivate)).toBe(true)
    expect(data.messages.length).toBeGreaterThanOrEqual(55)
    expect(data.users).toHaveLength(8)
  })

  it('uses the fixed ids the other tasks rely on', () => {
    expect(data.currentUserId).toBe('u-1')
    expect(ids(data.users)).toEqual(['u-1', 'u-2', 'u-3', 'u-4', 'u-5', 'u-6', 'u-7', 'u-8'])
    expect(ids(data.workspaces)).toEqual(['ws-eng', 'ws-design'])
    expect(ids(data.projects)).toEqual(['p-nex', 'p-mob', 'p-brd'])
    expect(data.projects.map((p) => p.workspaceId)).toEqual(['ws-eng', 'ws-eng', 'ws-design'])
    expect(ids(data.channels)).toEqual(
      expect.arrayContaining(['c-general', 'c-frontend', 'c-backend', 'c-release', 'c-design', 'c-dm-1', 'c-dm-2', 'c-dm-3']))
    expect(data.channels.filter((c) => c.kind === 'dm' && c.workspaceId === 'ws-eng').length).toBeGreaterThanOrEqual(2)
    expect(data.channels.find((c) => c.id === 'c-design')?.workspaceId).toBe('ws-design')
    expect(data.workspaces.map((w) => w.name)).toEqual(['Spark Engineering', 'Spark Design'])
    expect(data.projects.map((p) => p.name)).toEqual(['Nexus Core', 'Mobile App', 'Brand Refresh'])
  })

  it('covers every status and priority, unassigned, unpointed and sprintless tickets', () => {
    expect(new Set(data.tickets.map((t) => t.status))).toEqual(
      new Set(['backlog', 'todo', 'inProgress', 'inReview', 'done']))
    expect(new Set(data.tickets.map((t) => t.priority))).toEqual(new Set(['urgent', 'high', 'medium', 'low']))
    expect(data.tickets.some((t) => t.assigneeId === null)).toBe(true)
    expect(data.tickets.some((t) => t.storyPoints === null)).toBe(true)
    expect(data.tickets.some((t) => t.sprintId === null)).toBe(true)
    // Engineering alone covers all five statuses and four priorities.
    const eng = data.tickets.filter((t) => t.projectId !== 'p-brd')
    expect(new Set(eng.map((t) => t.status)).size).toBe(5)
    expect(new Set(eng.map((t) => t.priority)).size).toBe(4)
  })

  it('resolves every reference', () => {
    const userIds = new Set(ids(data.users))
    const workspaceIds = new Set(ids(data.workspaces))
    const projectIds = new Set(ids(data.projects))
    const sprintById = new Map(data.sprints.map((s) => [s.id, s]))
    const channelIds = new Set(ids(data.channels))
    const messageById = new Map(data.messages.map((m) => [m.id, m]))
    const ticketKeys = new Set(data.tickets.map((t) => t.key))

    expect(userIds.has(data.currentUserId)).toBe(true)
    for (const p of data.projects) {
      expect(workspaceIds.has(p.workspaceId)).toBe(true)
      expect(userIds.has(p.managerId)).toBe(true)
    }
    for (const s of data.sprints) expect(projectIds.has(s.projectId)).toBe(true)
    for (const t of data.tickets) {
      expect(projectIds.has(t.projectId)).toBe(true)
      if (t.assigneeId) expect(userIds.has(t.assigneeId)).toBe(true)
      expect(userIds.has(t.reporterId)).toBe(true)
      if (t.sprintId) expect(sprintById.get(t.sprintId)?.projectId).toBe(t.projectId)
      if (t.linkedMessageId || t.linkedChannelId) {
        expect(messageById.get(t.linkedMessageId ?? '')?.channelId).toBe(t.linkedChannelId)
      }
    }
    for (const c of data.channels) {
      expect(workspaceIds.has(c.workspaceId)).toBe(true)
      expect(c.memberIds.length).toBeGreaterThan(0)
      for (const id of c.memberIds) expect(userIds.has(id)).toBe(true)
    }
    for (const m of data.messages) {
      expect(channelIds.has(m.channelId)).toBe(true)
      const channel = data.channels.find((c) => c.id === m.channelId)
      expect(channel?.memberIds).toContain(m.senderId)
      for (const key of m.linkedTicketKeys) expect(ticketKeys.has(key)).toBe(true)
      for (const r of m.reactions) for (const id of r.userIds) expect(userIds.has(id)).toBe(true)
    }
    for (const r of data.replies) {
      const parent = messageById.get(r.messageId)
      expect(parent).toBeDefined()
      expect(r.channelId).toBe(parent?.channelId)
      expect(userIds.has(r.senderId)).toBe(true)
      for (const x of r.reactions) for (const id of x.userIds) expect(userIds.has(id)).toBe(true)
    }
    for (const channelId of Object.keys(data.reads)) expect(channelIds.has(channelId)).toBe(true)
  })

  it('has unique ids and ticket keys numbered from 101 per project', () => {
    for (const rows of [data.users, data.workspaces, data.projects, data.sprints, data.tickets, data.channels]) {
      expect(new Set(ids(rows)).size).toBe(rows.length)
    }
    const messageAndReplyIds = [...ids(data.messages), ...ids(data.replies)]
    expect(new Set(messageAndReplyIds).size).toBe(messageAndReplyIds.length)
    expect(new Set(data.tickets.map((t) => t.key)).size).toBe(data.tickets.length)

    for (const t of data.tickets) expect(t.key).toMatch(/^(NEX|MOB|BRD)-1\d\d$/)
    for (const p of data.projects) {
      const own = data.tickets.filter((t) => t.projectId === p.id)
      expect(own.every((t) => t.key.startsWith(`${p.key}-`))).toBe(true)
      const numbers = own.map((t) => keyNumber(t.key))
      expect(Math.min(...numbers)).toBe(101)
      expect(data.counters[p.id]).toBe(Math.max(...numbers) + 1)
    }
    expect(Object.keys(data.counters).sort()).toEqual(['p-brd', 'p-mob', 'p-nex'])
  })

  it('keeps derived fields consistent', () => {
    for (const m of data.messages) {
      const replies = data.replies.filter((r) => r.messageId === m.id)
      expect(m.threadCount).toBe(replies.length)
      expect(m.lastReplyAt).toBe(replies.length ? latest(replies.map((r) => r.createdAt)) : null)
      expect(m.linkedTicketKeys).toEqual(parseTicketKeys(m.content))
    }
    for (const c of data.channels) {
      const times = [
        ...data.messages.filter((m) => m.channelId === c.id).map((m) => m.createdAt),
        ...data.replies.filter((r) => r.channelId === c.id).map((r) => r.createdAt),
      ]
      expect(c.lastMessageAt).toBe(times.length ? latest(times) : null)
    }
  })

  it('has one active and one planned sprint per project', () => {
    for (const p of data.projects) {
      const own = data.sprints.filter((s) => s.projectId === p.id)
      expect(own.filter((s) => s.state === 'active')).toHaveLength(1)
      expect(own.filter((s) => s.state === 'planned')).toHaveLength(1)
      const active = own.find((s) => s.state === 'active')!
      const planned = own.find((s) => s.state === 'planned')!
      expect(active.startDate <= now.toISOString() && now.toISOString() <= active.endDate).toBe(true)
      expect(planned.startDate > active.endDate).toBe(true)
    }
  })

  it('puts every message within the last 7 days', () => {
    const oldest = new Date(now.getTime() - 7 * DAY).toISOString()
    const newest = now.toISOString()
    for (const row of [...data.messages, ...data.replies]) {
      expect(row.createdAt >= oldest).toBe(true)
      expect(row.createdAt <= newest).toBe(true)
    }
  })

  it('leaves exactly 3 messages unread in #frontend-dev and 1 in one DM', () => {
    const unread = (channelId: string) =>
      data.messages.filter(
        (m) => m.channelId === channelId && m.createdAt > data.reads[channelId] && m.senderId !== data.currentUserId,
      )
    expect(unread('c-frontend')).toHaveLength(3)
    const dmUnread = data.channels.filter((c) => c.kind === 'dm').map((c) => unread(c.id).length)
    expect(dmUnread.filter((n) => n > 0)).toEqual([1])
    for (const c of data.channels) {
      if (c.id !== 'c-frontend' && c.kind !== 'dm') expect(unread(c.id)).toHaveLength(0)
      expect(typeof data.reads[c.id]).toBe('string')
      expect(data.reads[c.id] <= now.toISOString()).toBe(true)
    }
  })

  it('has threads, reactions, ticket mentions and one ticket linked back to its message', () => {
    expect(data.messages.filter((m) => m.linkedTicketKeys.length > 0).length).toBeGreaterThanOrEqual(8)
    const threads = data.messages.filter((m) => m.threadCount > 0)
    expect(threads).toHaveLength(4)
    for (const m of threads) {
      expect(m.threadCount).toBeGreaterThanOrEqual(2)
      expect(m.threadCount).toBeLessThanOrEqual(5)
    }
    expect(data.messages.filter((m) => m.reactions.length > 0).length).toBeGreaterThanOrEqual(6)
    expect(data.tickets.filter((t) => t.linkedMessageId !== null)).toHaveLength(1)
  })

  it('orders time sensibly', () => {
    const messageById = new Map<string, ChatMessage>(data.messages.map((m) => [m.id, m]))
    for (const r of data.replies as ThreadReply[]) {
      expect(r.createdAt > messageById.get(r.messageId)!.createdAt).toBe(true)
    }
    for (const t of data.tickets) {
      expect(t.createdAt <= t.updatedAt).toBe(true)
      expect(t.updatedAt <= now.toISOString()).toBe(true)
      if (t.linkedMessageId) expect(t.createdAt > messageById.get(t.linkedMessageId)!.createdAt).toBe(true)
    }
  })

  it('is deterministic for a given now and shifts with it', () => {
    expect(seed(now)).toEqual(data)
    const later = seed(new Date(now.getTime() + DAY))
    expect(later.messages[0].id).toBe(data.messages[0].id)
    expect(later.messages[0].createdAt).not.toBe(data.messages[0].createdAt)
  })
})
