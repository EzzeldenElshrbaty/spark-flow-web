import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api, NewTicket, TicketStatus } from '@/api/types'
import type { RealtimeEvent } from '@/lib/realtime'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { memoryStorage } from './testing'
import { createTicket, updateTicket } from './tickets'

let db: MockDb
let hub: MockHub
let api: Api
let events: RealtimeEvent[]
let n = 0

beforeEach(() => {
  latency.min = latency.max = 0
  db = createDb(memoryStorage(), seed)
  hub = createMockHub(`test-tickets-${++n}`, null)
  api = createMockApi(db, hub)
  events = []
  hub.subscribe((e) => events.push(e))
})
afterEach(() => hub.close())

const newTicket = (over: Partial<NewTicket> = {}): NewTicket => ({
  projectId: 'p-nex', title: 'Add rate limit', description: '', status: 'todo', priority: 'medium',
  storyPoints: 3, assigneeId: null, sprintId: null, ...over,
})

const ORDER: TicketStatus[] = ['backlog', 'todo', 'inProgress', 'inReview', 'done']

describe('tickets reads', () => {
  it("lists a project's tickets ordered by status then rank", async () => {
    db.update((d) => { d.tickets.reverse() }) // stored in the wrong order, so the sort has work to do
    const list = await api.tickets.list('p-nex')
    expect(list.length).toBeGreaterThan(0)
    expect(list.every((t) => t.projectId === 'p-nex')).toBe(true)
    expect(new Set(list.map((t) => t.status)).size).toBeGreaterThan(1) // the loop below is not vacuous
    expect(list.filter((t) => t.status === list[0].status).length).toBeGreaterThan(1)
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1]
      const b = list[i]
      const sa = ORDER.indexOf(a.status)
      const sb = ORDER.indexOf(b.status)
      expect(sa < sb || (sa === sb && a.rank <= b.rank)).toBe(true)
    }
  })

  it('lists projects and sprints', async () => {
    expect((await api.tickets.projects('ws-eng')).map((p) => p.key)).toEqual(['NEX', 'MOB'])
    const sprints = await api.tickets.sprints('p-nex')
    expect(sprints.length).toBeGreaterThan(0)
    expect(sprints.every((s) => s.projectId === 'p-nex')).toBe(true)
  })

  it('gets a ticket by key', async () => {
    expect((await api.tickets.get('NEX-101')).projectId).toBe('p-nex')
  })

  it('throws ApiError 404 for an unknown key or project', async () => {
    await expect(api.tickets.get('NEX-999')).rejects.toMatchObject({ status: 404, title: 'Not found', detail: "Ticket NEX-999 doesn't exist." })
    await expect(api.tickets.list('nope')).rejects.toMatchObject({ status: 404, detail: "Project nope doesn't exist." })
    await expect(api.tickets.sprints('nope')).rejects.toMatchObject({ status: 404 })
    await expect(api.tickets.projects('nope')).rejects.toMatchObject({ status: 404, detail: "Workspace nope doesn't exist." })
    await expect(createTicket(db, hub, newTicket({ projectId: 'nope' }))).rejects.toMatchObject({ status: 404 })
    await expect(updateTicket(db, hub, 'NEX-999', { title: 'x' })).rejects.toMatchObject({ status: 404 })
    expect(events).toEqual([])
  })

  it('returns copies', async () => {
    const t = await api.tickets.get('NEX-101')
    t.title = 'tampered'
    expect((await api.tickets.get('NEX-101')).title).not.toBe('tampered')
  })
})

describe('createTicket', () => {
  it('uses the next number and goes last in its column', async () => {
    const highest = Math.max(...(await api.tickets.list('p-nex')).map((t) => Number(t.key.split('-')[1])))
    const t = await createTicket(db, hub, newTicket())
    expect(t.key).toBe(`NEX-${highest + 1}`)
    const todo = (await api.tickets.list('p-nex')).filter((x) => x.status === 'todo')
    expect(todo.at(-1)!.key).toBe(t.key)
  })

  it('numbers consecutive tickets in turn, per project', async () => {
    const a = await createTicket(db, hub, newTicket())
    const b = await createTicket(db, hub, newTicket())
    const mob = await createTicket(db, hub, newTicket({ projectId: 'p-mob' }))
    expect(Number(b.key.split('-')[1])).toBe(Number(a.key.split('-')[1]) + 1)
    expect(mob.key.startsWith('MOB-')).toBe(true)
    expect(b.rank).toBeGreaterThan(a.rank)
  })

  it('goes first when its column is empty, and records who and when', async () => {
    db.update((d) => { d.tickets = d.tickets.filter((t) => !(t.projectId === 'p-nex' && t.status === 'inReview')) })
    const t = await createTicket(db, hub, newTicket({ status: 'inReview', linkedChannelId: 'c-backend', linkedMessageId: 'm-b01' }))
    expect(t).toMatchObject({
      projectId: 'p-nex', status: 'inReview', rank: 1000, reporterId: 'u-1',
      linkedChannelId: 'c-backend', linkedMessageId: 'm-b01', createdAt: t.updatedAt,
    })
    expect(await api.tickets.get(t.key)).toEqual(t)
  })

  it('defaults the links to null and publishes ticketUpdated', async () => {
    const t = await createTicket(db, hub, newTicket())
    expect(t.linkedChannelId).toBeNull()
    expect(t.linkedMessageId).toBeNull()
    expect(events).toEqual([{ type: 'ticketUpdated', ticket: t }])
  })

  it('hands back a copy, not stored state', async () => {
    const t = await createTicket(db, hub, newTicket())
    t.title = 'tampered'
    expect((await api.tickets.get(t.key)).title).toBe('Add rate limit')
  })
})

describe('updateTicket', () => {
  it('patches, bumps updatedAt and publishes ticketUpdated', async () => {
    const before = await api.tickets.get('NEX-101')
    const t = await updateTicket(db, hub, 'NEX-101', { status: 'done', priority: 'low', title: 'Renamed' })
    expect(t).toMatchObject({ key: 'NEX-101', status: 'done', priority: 'low', title: 'Renamed' })
    expect(t.description).toBe(before.description) // untouched fields stay
    expect(t.updatedAt > before.updatedAt).toBe(true)
    expect(t.createdAt).toBe(before.createdAt)
    expect(await api.tickets.get('NEX-101')).toEqual(t)
    expect(events).toEqual([{ type: 'ticketUpdated', ticket: t }])
  })

  it('can clear the assignee and story points with null', async () => {
    const t = await updateTicket(db, hub, 'NEX-101', { assigneeId: null, storyPoints: null })
    expect(t.assigneeId).toBeNull()
    expect(t.storyPoints).toBeNull()
  })

  it('hands back a copy, not stored state', async () => {
    const t = await updateTicket(db, hub, 'NEX-101', { title: 'Renamed' })
    t.title = 'tampered'
    expect((await api.tickets.get('NEX-101')).title).toBe('Renamed')
  })
})

describe('dev.resetDemoData', () => {
  it('restores the seed', async () => {
    const original = await api.tickets.get('NEX-101')
    await updateTicket(db, hub, 'NEX-101', { title: 'Changed' })
    await createTicket(db, hub, newTicket())
    events.length = 0
    await api.db.reset()
    expect((await api.tickets.get('NEX-101')).title).toBe(original.title)
    await expect(api.tickets.get('NEX-111')).rejects.toMatchObject({ status: 404 })
    expect(events).toEqual([]) // the UI clears its own cache
  })
})
