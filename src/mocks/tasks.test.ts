import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NewTicket } from '@/api/types'
import type { RealtimeEvent } from '@/lib/realtime'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

let db: MockDb
let hub: MockHub
let clock = new Date('2026-10-26T12:00:00Z')
const apiAt = () => createMockApi(db, hub, () => clock)

beforeEach(() => {
  latency.min = latency.max = 0
  clock = new Date('2026-10-26T12:00:00Z')
  hub = createMockHub(`test-tasks-${Math.random()}`, null)
  db = createDb(createMemoryStore(), seed, () => clock)
})
afterEach(() => hub.close())

const newTask = (over: Partial<NewTicket> = {}): NewTicket => ({
  projectId: 'p-mob', title: 'Store screenshots', description: '6 screens for each store.', status: 'todo', priority: 'medium',
  storyPoints: null, assigneeId: 'u-8', sprintId: null, phaseId: 'ph-mob-build', type: 'task', dueAt: '2026-10-28T12:00:00.000Z', estimateHours: 3, ...over,
})

describe('tasks', () => {
  it('a PM creates a task with phase, due date and estimate; it gets the next key and is a TaskView', async () => {
    const api = apiAt()
    await api.users.viewAs('u-4')
    const events: RealtimeEvent[] = []
    hub.subscribe((e) => events.push(e))
    const task = await api.tasks.create(newTask())
    expect(task).toMatchObject({ key: 'MOB-109', phaseId: 'ph-mob-build', estimateHours: 3, loggedHours: 0, overdue: false, reporterId: 'u-4' })
    expect(events.map((e) => e.type)).toEqual(['ticketUpdated', 'messageReceived']) // the task, then its Created card
  })

  it('a member changes only the status of their own task', async () => {
    const api = apiAt()
    await api.users.viewAs('u-8') // assignee of MOB-104
    expect((await api.tasks.update('MOB-104', { status: 'inReview' })).status).toBe('inReview')
    await expect(api.tasks.update('MOB-104', { title: 'Mine now' })).rejects.toMatchObject({ status: 403 })
    await expect(api.tasks.update('MOB-103', { status: 'done' })).rejects.toMatchObject({ status: 403 }) // Ahmed's task
    await expect(api.tasks.create(newTask())).rejects.toMatchObject({ status: 403 })
  })

  it('a PM cannot manage tasks on a project they do not manage', async () => {
    const api = apiAt()
    await api.users.viewAs('u-4')
    await expect(api.tasks.update('NEX-101', { priority: 'low' })).rejects.toMatchObject({ status: 403 })
    await expect(api.tasks.create(newTask({ projectId: 'p-nex', phaseId: 'ph-nex-build' }))).rejects.toMatchObject({ status: 403 })
  })

  it('rejects a phase from another project and a negative estimate', async () => {
    const api = apiAt()
    await expect(api.tasks.create(newTask({ phaseId: 'ph-nex-build' }))).rejects.toMatchObject({ status: 400 })
    await expect(api.tasks.create(newTask({ estimateHours: -1 }))).rejects.toMatchObject({ status: 400 })
  })

  it('becomes overdue once its due date passes', async () => {
    const task = await apiAt().tasks.create(newTask())
    expect(task.overdue).toBe(false)
    clock = new Date('2026-10-29T12:00:00Z')
    expect((await apiAt().tickets.get(task.key)).overdue).toBe(true)
  })

  it('list and get return logged hours from time entries', async () => {
    const mob104 = await apiAt().tickets.get('MOB-104')
    expect(mob104.loggedHours).toBe(20)
    expect(mob104.overdue).toBe(true)
  })
})

describe('a task from a chat message', () => {
  it('links both ways and publishes messageChanged', async () => {
    const api = apiAt()
    await api.users.viewAs('u-4') // Ahmed manages Mobile App
    const message = await api.chat.send('c-p-mob', 'Store screenshots are missing')
    const events: RealtimeEvent[] = []
    hub.subscribe((e) => events.push(e))
    const task = await api.tasks.create(newTask({ linkedChannelId: 'c-p-mob', linkedMessageId: message.id }))
    expect(task).toMatchObject({ linkedChannelId: 'c-p-mob', linkedMessageId: message.id })
    expect((await api.chat.message(message.id)).linkedTicketKeys).toContain(task.key)
    expect(events).toContainEqual({ type: 'messageChanged', channelId: 'c-p-mob', messageId: message.id })
  })

  it("a message from another channel, or a deleted one, is refused", async () => {
    const api = apiAt()
    await api.users.viewAs('u-4')
    const other = await api.chat.send('c-general', 'Not about Mobile App')
    await expect(api.tasks.create(newTask({ linkedChannelId: 'c-general', linkedMessageId: other.id }))).rejects.toMatchObject({ status: 400, detail: "This message isn't in the project's chat." })
    const gone = await api.chat.send('c-p-mob', 'Oops')
    await api.chat.remove({ kind: 'message', id: gone.id })
    await expect(api.tasks.create(newTask({ linkedChannelId: 'c-p-mob', linkedMessageId: gone.id }))).rejects.toMatchObject({ status: 400 })
  })

  it('without task.manage it is refused', async () => {
    const api = apiAt()
    await api.users.viewAs('u-8') // a member on Mobile App
    const message = await api.chat.send('c-p-mob', 'Can someone make this a task?')
    await expect(api.tasks.create(newTask({ linkedChannelId: 'c-p-mob', linkedMessageId: message.id }))).rejects.toMatchObject({ status: 403 })
  })
})

describe('the board, as the assignee', () => {
  it('an assignee drags their own card: status and rank together, or rank alone', async () => {
    const api = apiAt()
    await api.users.viewAs('u-8') // Tarek, assignee of MOB-104
    expect(await api.tasks.update('MOB-104', { status: 'inReview', rank: 5 })).toMatchObject({ status: 'inReview', rank: 5 })
    expect((await api.tasks.update('MOB-104', { rank: 7 })).rank).toBe(7)
    await expect(api.tasks.update('MOB-103', { rank: 9 })).rejects.toMatchObject({ status: 403 }) // not his
  })
})

describe('archiving tasks', () => {
  it('the manager archives a task: it leaves the list and the totals, keeps its hours, and get still finds it', async () => {
    const api = apiAt()
    await api.users.viewAs('u-2') // Nour manages Nexus Core
    const before = (await api.projects.list('ws-eng')).find((p) => p.key === 'NEX')!
    const hours = (await api.tickets.get('NEX-101')).loggedHours
    expect(hours).toBeGreaterThan(0)
    const archived = await api.tasks.archive('NEX-101')
    expect(archived.archivedAt).toEqual(expect.any(String))
    expect((await api.tickets.list('p-nex')).some((t) => t.key === 'NEX-101')).toBe(false)
    const after = (await api.projects.list('ws-eng')).find((p) => p.key === 'NEX')!
    expect(after.taskCount).toBe(before.taskCount - 1)
    expect(after.loggedHours).toBe(before.loggedHours)
    expect((await api.tickets.get('NEX-101')).archivedAt).toEqual(expect.any(String))
  })

  it('archiving stops a running timer on it, and an archived task takes no new time', async () => {
    const api = apiAt()
    await api.users.viewAs('u-2')
    clock = new Date('2026-10-26T09:00:00Z')
    await api.time.start({ taskId: 't-nex-102' })
    clock = new Date('2026-10-26T10:00:00Z')
    await api.tasks.archive('NEX-102')
    expect((await api.time.today()).running).toBeNull()
    await expect(api.time.start({ taskId: 't-nex-102' })).rejects.toMatchObject({ status: 400, detail: 'That task is archived. Restore it to log time.' })
  })

  it('restore brings it back', async () => {
    const api = apiAt()
    await api.tasks.archive('NEX-103')
    expect((await api.tasks.restore('NEX-103')).archivedAt ?? null).toBeNull()
    expect((await api.tickets.list('p-nex')).some((t) => t.key === 'NEX-103')).toBe(true)
  })

  it('a member is refused', async () => {
    const api = apiAt()
    await api.users.viewAs('u-3')
    await expect(api.tasks.archive('NEX-101')).rejects.toMatchObject({ status: 403 })
  })

  it('list with archived: true returns only archived tasks', async () => {
    const api = apiAt()
    await api.tasks.archive('NEX-104')
    expect((await api.tickets.list('p-nex', { archived: true })).map((t) => t.key)).toEqual(['NEX-104'])
  })
})

describe('an archived task is read-only', () => {
  it('an archived task refuses a move and a comment', async () => {
    const api = apiAt()
    await api.tasks.archive('NEX-101')
    await expect(api.tasks.update('NEX-101', { status: 'done' })).rejects.toMatchObject({ status: 400, detail: 'This task is archived. Restore it first.' })
    await expect(api.comments.create({ taskKey: 'NEX-101', kind: 'comment', body: 'still here?', files: [] })).rejects.toMatchObject({ status: 400, detail: 'This task is archived. Restore it first.' })
    await api.tasks.restore('NEX-101')
    expect((await api.tasks.update('NEX-101', { status: 'done' })).status).toBe('done')
  })

  it('an archived task refuses every other change too', async () => {
    const api = apiAt()
    await api.tasks.archive('NEX-101')
    for (const patch of [{ title: 'New' }, { assigneeId: null }, { rank: 5 }, { estimateHours: 3 }])
      await expect(api.tasks.update('NEX-101', patch)).rejects.toMatchObject({ status: 400, detail: 'This task is archived. Restore it first.' })
  })
})

describe('task writes are checked', () => {
  // As Nour (u-2), who manages NEX. u-8 is on no NEX team; s-brd-1 is another project's sprint.
  const asManager = async () => {
    const api = apiAt()
    await api.users.viewAs('u-2')
    return api
  }
  it('refuses fields outside the patch', async () => {
    const api = await asManager()
    await expect(api.tasks.update('NEX-101', { key: 'X-1' } as never)).rejects.toMatchObject({ status: 400, detail: "Some of these fields can't be changed." })
  })
  it('refuses bad values', async () => {
    const api = await asManager()
    const refused = async (patch: object, detail: string) => await expect(api.tasks.update('NEX-101', patch as never)).rejects.toMatchObject({ status: 400, detail })
    await refused({ priority: 'asap' }, "That isn't a priority.")
    await refused({ type: 'epic' }, "That isn't a task type.")
    await refused({ assigneeId: 'u-8' }, 'Pick someone on the project.')
    await refused({ sprintId: 's-brd-1' }, 'That sprint belongs to another project.')
    await refused({ storyPoints: -1 }, 'Story points are a number, 0 or more.')
    await refused({ dueAt: 'soon' }, 'Pick a due date.')
  })
  it('create is checked the same way', async () => {
    const api = await asManager()
    const base = { projectId: 'p-nex', title: 'New', description: '', status: '', priority: 'medium' as const, storyPoints: null, assigneeId: null, sprintId: null }
    await expect(api.tasks.create({ ...base, assigneeId: 'u-8' })).rejects.toMatchObject({ status: 400, detail: 'Pick someone on the project.' })
    await expect(api.tasks.create({ ...base, priority: 'asap' as never })).rejects.toMatchObject({ status: 400, detail: "That isn't a priority." })
    await expect(api.tasks.create({ ...base, sprintId: 's-brd-1' })).rejects.toMatchObject({ status: 400, detail: 'That sprint belongs to another project.' })
  })
  it("a board move and the assignee's own move still pass", async () => {
    const api = await asManager()
    expect((await api.tasks.update('NEX-101', { status: 'done', rank: 5 })).status).toBe('done')
    const mine = (await db.read()).tickets.find((t) => t.projectId === 'p-nex' && t.assigneeId === 'u-3' && !t.archivedAt)!
    await api.users.viewAs('u-3')
    expect((await api.tasks.update(mine.key, { status: 'inProgress' })).status).toBe('inProgress')
  })
  it('an unchanged assignee who left the project can stay', async () => {
    const api = await asManager()
    await db.update((d) => void (d.tickets.find((t) => t.key === 'NEX-102')!.assigneeId = 'u-8'))
    expect(await api.tasks.update('NEX-102', { assigneeId: 'u-8', title: 'Still theirs' })).toMatchObject({ assigneeId: 'u-8', title: 'Still theirs' })
  })
})

describe('task rights are checked in the write', () => {
  it('rights are checked against the data the write sees', async () => {
    const api = apiAt()
    const task = (await db.read()).tickets.find((t) => t.projectId === 'p-nex' && t.assigneeId === 'u-3' && !t.archivedAt)!
    // db.read() applies the tab's person, so the stale copy is taken while acting as Mariam (u-3), its assignee.
    await api.users.viewAs('u-3')
    const stale = await db.read()
    await api.users.viewAs('u-2') // Nour manages NEX
    await api.tasks.update(task.key, { assigneeId: 'u-5' })
    await api.users.viewAs('u-3')
    const staleApi = createMockApi({ ...db, read: async () => structuredClone(stale) }, hub, () => clock)
    await expect(staleApi.tasks.update(task.key, { status: 'done' })).rejects.toMatchObject({ status: 403 })
  })
})

describe('done stops timers', () => {
  it('moving a task to a Done-type column stops its timers, whatever the column is called', async () => {
    const api = apiAt()
    await api.users.viewAs('u-2') // Nour manages NEX
    const board = await api.projects.addColumn('p-nex', { label: 'Shipped', category: 'done' })
    const shipped = board.board!.find((c) => c.label === 'Shipped')!.id
    await api.users.viewAs('u-1') // Youssef (Admin) times NEX-102
    await api.time.start({ taskId: 't-nex-102' })
    clock = new Date(clock.getTime() + 30 * 60_000)
    await api.users.viewAs('u-2')
    await api.tasks.update('NEX-102', { status: shipped })
    const running = (await db.read()).timeEntries.filter((e) => e.taskId === 't-nex-102' && e.endedAt === null)
    expect(running).toHaveLength(0)
  })
})

describe('write-path refusals', () => {
  it('an archived task says so first, whoever asks and whatever the patch', async () => {
    const api = apiAt()
    await api.tasks.archive('NEX-101')
    await api.users.viewAs('u-8') // on no NEX team, no rights
    await expect(api.tasks.update('NEX-101', { priority: 'asap' as never })).rejects.toMatchObject({ status: 400, detail: 'This task is archived. Restore it first.' })
  })
  it('create checks rights in its write, not on an earlier read', async () => {
    const api = apiAt()
    await api.users.viewAs('u-2')
    const stale = await db.read() // Nour still manages NEX here
    await api.users.viewAs('u-1')
    await api.projects.update('p-nex', { managerId: 'u-1' })
    await api.users.viewAs('u-2')
    const staleApi = createMockApi({ ...db, read: async () => structuredClone(stale) }, hub, () => clock)
    await expect(staleApi.tasks.create({ projectId: 'p-nex', title: 'Late', description: '', status: '', priority: 'medium', storyPoints: null, assigneeId: null, sprintId: null })).rejects.toMatchObject({ status: 403 })
  })
  it('a title that isn\'t text, or an unknown phase, is a 400 with a sentence', async () => {
    const api = apiAt()
    await expect(api.tasks.update('NEX-101', { title: 42 as never })).rejects.toMatchObject({ status: 400, detail: 'Title must be text.' })
    await expect(api.tasks.update('NEX-101', { phaseId: 'ph-gone' })).rejects.toMatchObject({ status: 400, detail: 'That phase no longer exists.' })
  })
})

describe('moved cards keep column names', () => {
  it('a Moved card keeps a column called "Ready to ship"', async () => {
    const api = apiAt()
    await api.users.viewAs('u-2')
    const board = await api.projects.addColumn('p-nex', { label: 'Ready to ship', category: 'inProgress' })
    const col = board.board!.find((c) => c.label === 'Ready to ship')!.id
    await api.tasks.update('NEX-102', { status: col })
    const card = (await db.read()).messages.filter((m) => m.taskEvent?.key === 'NEX-102').at(-1)!
    expect(card.taskEvent).toMatchObject({ statusLabel: 'Ready to ship' })
  })
})
