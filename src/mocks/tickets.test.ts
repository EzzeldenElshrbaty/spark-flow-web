import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api, NewTicket, TicketStatus } from '@/api/types'
import type { RealtimeEvent } from '@/lib/realtime'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'
import { createTicket, updateTicket } from './tickets'

let db: MockDb
let hub: MockHub
let api: Api
let events: RealtimeEvent[]
let n = 0

beforeEach(() => {
  latency.min = latency.max = 0
  db = createDb(createMemoryStore(), seed)
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
    await db.update((d) => { d.tickets.reverse() }) // stored in the wrong order, so the sort has work to do
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
    expect((await api.tickets.projects('ws-eng')).map((p) => p.key)).toEqual(['NEX', 'MOB', 'ELM', 'SEL'])
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
    await db.update((d) => { d.tickets = d.tickets.filter((t) => !(t.projectId === 'p-nex' && t.status === 'inReview')) })
    const t = await createTicket(db, hub, newTicket({ status: 'inReview', linkedChannelId: 'c-backend', linkedMessageId: 'm-b01' }))
    expect(t).toMatchObject({
      projectId: 'p-nex', status: 'inReview', rank: 1000, reporterId: 'u-1',
      linkedChannelId: 'c-backend', linkedMessageId: 'm-b01', createdAt: t.updatedAt,
    })
    expect(await api.tickets.get(t.key)).toMatchObject(t) // plus loggedHours and overdue
  })

  it('defaults the links to null and publishes ticketUpdated', async () => {
    const t = await createTicket(db, hub, newTicket())
    expect(t.linkedChannelId).toBeNull()
    expect(t.linkedMessageId).toBeNull()
    expect(events.filter((e) => e.type === 'ticketUpdated')).toEqual([{ type: 'ticketUpdated', ticket: t }])
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
    expect(await api.tickets.get('NEX-101')).toMatchObject(t) // plus loggedHours and overdue
    expect(events.filter((e) => e.type === 'ticketUpdated')).toEqual([{ type: 'ticketUpdated', ticket: t }])
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
    expect(events).toEqual([{ type: 'dataReset' }]) // every other tab refetches
  })
})

describe('task event cards', () => {
  const cards = async () => (await db.read()).messages.filter((m) => m.taskEvent)

  it('update posts one card per event in the project channel, in the same write, with no mentions', async () => {
    await updateTicket(db, hub, 'NEX-101', { assigneeId: 'u-3', status: 'inProgress' })
    const posted = await cards()
    expect(posted.map((m) => m.taskEvent!.kind)).toEqual(['assigned', 'status'])
    expect(posted.every((m) => m.channelId === 'c-p-nex' && m.mentions.length === 0 && m.linkedTicketKeys[0] === 'NEX-101')).toBe(true)
    expect(posted[0]!.content).toBe('Assigned NEX-101 to Mariam Fathy')
    expect(posted[1]!.content).toBe('Moved NEX-101 to In progress')
  })

  it('create posts a created card; done says Done', async () => {
    const t = await createTicket(db, hub, newTicket({ title: 'Add rate limit' }))
    await updateTicket(db, hub, t.key, { status: 'done' })
    expect((await cards()).map((m) => m.content)).toEqual([`Created ${t.key}: Add rate limit`, `Done: ${t.key} Add rate limit`])
  })

  it('an assignee moving their own task posts the card', async () => {
    const nex = (await db.read()).tickets.find((t) => t.key === 'NEX-106')!
    await api.users.viewAs(nex.assigneeId!)
    const next = nex.status === 'done' ? 'inReview' : 'done'
    await api.tasks.update('NEX-106', { status: next })
    expect((await cards()).map((m) => m.senderId)).toEqual([nex.assigneeId])
  })

  it('rank only, or a status patch to the same status, posts nothing', async () => {
    const nex = (await db.read()).tickets.find((t) => t.key === 'NEX-101')!
    await updateTicket(db, hub, 'NEX-101', { rank: 1 })
    await updateTicket(db, hub, 'NEX-101', { status: nex.status })
    expect(await cards()).toEqual([])
  })

  it("a status card uses the project's column name", async () => {
    await db.update((d) => {
      d.projects.find((p) => p.id === 'p-nex')!.board = [
        { id: 'todo', label: 'To do', category: 'todo' },
        { id: 'inProgress', label: 'Building', category: 'inProgress' },
        { id: 'done', label: 'Done', category: 'done' },
      ]
    })
    await updateTicket(db, hub, 'NEX-101', { status: 'inProgress' })
    expect((await cards()).map((m) => m.content)).toEqual(['Moved NEX-101 to Building'])
  })

  it('messageReceived is published for each card', async () => {
    events.length = 0
    await updateTicket(db, hub, 'NEX-101', { assigneeId: 'u-3', status: 'inProgress' })
    expect(events.filter((e) => e.type === 'messageReceived').map((e) => e.type === 'messageReceived' && e.message.taskEvent?.kind)).toEqual(['assigned', 'status'])
  })
})

describe('columns with a type', () => {
  const custom = async () => {
    await db.update((d) => {
      d.projects.find((p) => p.id === 'p-nex')!.board = [
        { id: 'col-next', label: 'Next', category: 'todo' },
        { id: 'inProgress', label: 'Building', category: 'inProgress' },
        { id: 'col-ship', label: 'Shipped', category: 'done' },
      ]
    })
  }

  it('status must be a column of the project', async () => {
    await custom()
    await expect(api.tasks.update('NEX-101', { status: 'todo' })).rejects.toMatchObject({ status: 400, detail: 'That column no longer exists.' })
    await expect(api.tasks.create({ ...newTicket(), status: 'nope' })).rejects.toMatchObject({ status: 400, detail: 'That column no longer exists.' })
  })

  it('a new task starts in the first To do column when its status is the default', async () => {
    await custom()
    const t = await createTicket(db, hub, newTicket({ status: '' }))
    expect(t.status).toBe('col-next')
  })

  it('moving into any Done-type column posts the done card, with the column name', async () => {
    await custom()
    await updateTicket(db, hub, 'NEX-101', { status: 'col-ship' })
    const card = (await db.read()).messages.find((m) => m.taskEvent?.key === 'NEX-101')!
    expect(card.taskEvent).toMatchObject({ kind: 'done', status: 'col-ship', statusLabel: 'Shipped' })
  })
})

describe('the status is checked inside the write', () => {
  it('updateTicket and createTicket refuse a column the board no longer has, in their own transaction', async () => {
    await expect(updateTicket(db, hub, 'NEX-101', { status: 'col-gone' })).rejects.toMatchObject({ status: 400, detail: 'That column no longer exists.' })
    await expect(createTicket(db, hub, newTicket({ status: 'col-gone' }))).rejects.toMatchObject({ status: 400, detail: 'That column no longer exists.' })
    expect((await db.read()).tickets.find((t) => t.key === 'NEX-101')!.status).not.toBe('col-gone')
  })
})

describe('where a new task starts', () => {
  it('on the standard board, in To do (not Backlog)', async () => {
    const t = await createTicket(db, hub, newTicket({ status: '' }))
    expect(t.status).toBe('todo')
  })
})
