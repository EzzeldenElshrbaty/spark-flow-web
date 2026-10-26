import type { Api, NewTicket, Ticket, TicketPatch, TicketStatus } from '@/api/types'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import type { MockHub } from './realtime'
import { clone, notFound, stamp } from './shared'

const STATUS_ORDER: TicketStatus[] = ['backlog', 'todo', 'inProgress', 'inReview', 'done']

const byStatusThenRank = (a: Ticket, b: Ticket) =>
  STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.rank - b.rank

const ticketNumber = (t: Ticket) => Number(t.key.split('-')[1])

function findProject(data: DbData, id: string) {
  const project = data.projects.find((p) => p.id === id)
  if (!project) throw notFound('Project', id)
  return project
}

function findTicket(data: DbData, key: string): Ticket {
  const ticket = data.tickets.find((t) => t.key === key)
  if (!ticket) throw notFound('Ticket', key)
  return ticket
}

export function ticketsApi(db: MockDb): Api['tickets'] {
  return {
    async projects(workspaceId) {
      await delay()
      const data = db.read()
      if (!data.workspaces.some((w) => w.id === workspaceId)) throw notFound('Workspace', workspaceId)
      return data.projects.filter((p) => p.workspaceId === workspaceId)
    },
    async sprints(projectId) {
      await delay()
      const data = db.read()
      findProject(data, projectId)
      return data.sprints.filter((s) => s.projectId === projectId)
    },
    async list(projectId) {
      await delay()
      const data = db.read()
      findProject(data, projectId)
      return data.tickets.filter((t) => t.projectId === projectId).sort(byStatusThenRank)
    },
    async get(key) {
      await delay()
      return findTicket(db.read(), key)
    },
  }
}

// ── Mutations (not on Api until Phase 4) ──────────────────────────────────

/** Opens a ticket as the current user: next key for the project, last in its column. */
export async function createTicket(db: MockDb, hub: MockHub, input: NewTicket): Promise<Ticket> {
  const ticket = db.update((data) => {
    const project = findProject(data, input.projectId)
    const own = data.tickets.filter((t) => t.projectId === project.id)
    const number = data.counters[project.id] ?? Math.max(0, ...own.map(ticketNumber)) + 1
    const lastRank = Math.max(0, ...own.filter((t) => t.status === input.status).map((t) => t.rank))
    const now = stamp()
    const key = `${project.key}-${number}`
    const created: Ticket = {
      id: `t-${key.toLowerCase()}`,
      key,
      projectId: project.id,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      storyPoints: input.storyPoints,
      assigneeId: input.assigneeId,
      reporterId: data.currentUserId,
      sprintId: input.sprintId,
      rank: lastRank + 1000,
      linkedChannelId: input.linkedChannelId ?? null,
      linkedMessageId: input.linkedMessageId ?? null,
      createdAt: now,
      updatedAt: now,
      phaseId: input.phaseId ?? null,
      type: input.type ?? 'task',
      dueAt: input.dueAt ?? null,
      estimateHours: input.estimateHours ?? null,
    }
    data.tickets.push(created)
    data.counters[project.id] = number + 1
    return created
  })
  hub.publish({ type: 'ticketUpdated', ticket: clone(ticket) })
  return ticket
}

/** Changes the given fields of a ticket and bumps updatedAt. */
export async function updateTicket(db: MockDb, hub: MockHub, key: string, patch: TicketPatch): Promise<Ticket> {
  const ticket = db.update((data) => {
    const ticket = findTicket(data, key)
    for (const [field, value] of Object.entries(patch)) {
      if (value !== undefined) (ticket as Record<string, unknown>)[field] = value
    }
    ticket.updatedAt = stamp(ticket.updatedAt)
    return ticket
  })
  hub.publish({ type: 'ticketUpdated', ticket: clone(ticket) })
  return ticket
}
