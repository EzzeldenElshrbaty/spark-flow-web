import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NewTicket } from '@/api/types'
import type { RealtimeEvent } from '@/lib/realtime'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'
import { textBody } from '@/lib/messageBody'
import type { UploadFile } from '@/api/types'

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
  projectId: 'p-mob', title: 'Store screenshots', descriptionBody: textBody('6 screens for each store.'), status: 'todo', priority: 'medium',
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
    expect(mob104.loggedHours).toBeCloseTo(5 * (5 + 10 / 60)) // five mornings, 5:50 to 11:00
    // Due tomorrow, 25 h against an estimate of 16 h: over estimate, not overdue (UX Phase 1, 1.1).
    expect(mob104).toMatchObject({ overdue: false, overEstimate: true })
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

  it('a thread reply also sent to the project’s chat is refused: tasks are made from messages', async () => {
    const api = apiAt()
    await api.users.viewAs('u-4')
    const root = await api.chat.send('c-p-mob', 'The build fails at signing')
    const sent = await api.chat.reply(root.id, 'The key expired', undefined, true)
    await expect(api.tasks.create(newTask({ linkedChannelId: 'c-p-mob', linkedMessageId: sent.id }))).rejects.toMatchObject({ status: 400, detail: "A task can't be made from a thread reply." })
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
    expect((await api.time.today()).timer).toBeNull()
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
    await expect(staleApi.tasks.create({ projectId: 'p-nex', title: 'Late', descriptionBody: [], status: '', priority: 'medium', storyPoints: null, assigneeId: null, sprintId: null })).rejects.toMatchObject({ status: 403 })
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

describe('moveTo', () => {
  const order = async () => (await db.read()).tickets.filter((t) => t.projectId === 'p-nex' && t.status === 'todo' && !t.archivedAt).sort((a, b) => a.rank - b.rank).map((t) => [t.key, t.rank])
  it("a member's drop into a vanishing gap lands where dropped", async () => {
    const api = apiAt()
    await db.update((d) => {
      for (const t of d.tickets.filter((x) => x.projectId === 'p-nex' && x.status === 'todo')) t.rank = 9000
      d.tickets.find((x) => x.key === 'NEX-102')!.rank = 1000
      d.tickets.find((x) => x.key === 'NEX-110')!.rank = 1000 + 1e-7
    })
    await api.users.viewAs('u-3') // Mariam, NEX-106's assignee
    await api.tasks.moveTo('NEX-106', 'todo', 1, ['NEX-102', 'NEX-110'])
    const now = await order()
    expect(now.slice(0, 3)).toEqual([['NEX-102', 1000], ['NEX-106', 2000], ['NEX-110', 3000]])
  })
  it('moveTo refuses someone who may not move it', async () => {
    const api = apiAt()
    await api.users.viewAs('u-8')
    await expect(api.tasks.moveTo('NEX-106', 'done', 0)).rejects.toMatchObject({ status: 403 })
  })
})


describe('task descriptions', () => {
  const bold = [{ type: 'p' as const, children: [{ type: 'text' as const, text: 'Ship it', marks: ['b' as const] }] }]

  it('a task keeps its formatted description and its plain text', async () => {
    const api = apiAt()
    await api.users.viewAs('u-4')
    expect(await api.tasks.create(newTask({ descriptionBody: bold }))).toMatchObject({ descriptionBody: bold, description: 'Ship it' })
    expect(await api.tasks.create(newTask({ descriptionBody: undefined }))).toMatchObject({ descriptionBody: [], description: '' })
  })

  it('refuses a description with mentions, or one too long', async () => {
    const api = apiAt()
    await api.users.viewAs('u-2')
    const nex = { projectId: 'p-nex', phaseId: 'ph-nex-build', assigneeId: 'u-3' }
    await expect(api.tasks.create(newTask({ ...nex, descriptionBody: [{ type: 'p', children: [{ type: 'user', id: 'u-3', name: 'M' }] }] as never }))).rejects.toMatchObject({
      status: 400, message: "The description couldn't be read. Try again.",
    })
    await expect(api.tasks.create(newTask({ ...nex, descriptionBody: textBody('x'.repeat(20_001)) }))).rejects.toMatchObject({
      status: 400, message: 'Keep the description under 20,000 characters.',
    })
  })

  it('a formatting-only change is a description change in history', async () => {
    const api = apiAt()
    await api.users.viewAs('u-2')
    const before = (await db.read()).tickets.find((t) => t.key === 'NEX-101')!
    const n = (await db.read()).activity.length
    await api.tasks.update('NEX-101', { descriptionBody: [{ type: 'p', children: [{ type: 'text', text: before.description, marks: ['b'] }] }] })
    const lines = (await db.read()).activity.slice(n)
    expect(lines.find((l) => l.kind === 'task.changed' && l.taskKey === 'NEX-101')?.changes).toContainEqual({ field: 'description', from: null, to: null })
  })
})

describe('task files on save', () => {
  const pdf = (name: string): UploadFile => Object.assign(new Blob(['%PDF-1.4 x'], { type: 'application/pdf' }), { name })
  const nex = { projectId: 'p-nex', phaseId: 'ph-nex-build', assigneeId: 'u-3' }
  const fileBlock = (id: string) => ({ type: 'file' as const, id })

  it('a task is created with its files and a description that shows one; every tab hears its files changed', async () => {
    const api = apiAt()
    await api.users.viewAs('u-2')
    const f = await api.files.uploadForTask('p-nex', pdf('flow.pdf'))
    const events: RealtimeEvent[] = []
    hub.subscribe((e) => events.push(e))
    const body = [...textBody('See the flow.'), fileBlock(f.id)]
    const task = await api.tasks.create(newTask({ ...nex, attachmentIds: [f.id], descriptionBody: body }))
    expect(task.attachments).toEqual([f])
    expect(task.descriptionBody).toEqual(body)
    expect(events).toContainEqual({ type: 'filesChanged', projectId: 'p-nex' })
  })

  it('at most 20 files; a repeated one counts once', async () => {
    const api = apiAt()
    await api.users.viewAs('u-2')
    const f = await api.files.uploadForTask('p-nex', pdf('a.pdf'))
    await expect(api.tasks.create(newTask({ ...nex, attachmentIds: Array.from({ length: 21 }, (_, i) => `f-${i}`) }))).rejects.toMatchObject({ status: 400, detail: 'Attach up to 20 files to a task.' })
    expect((await api.tasks.create(newTask({ ...nex, attachmentIds: [f.id, f.id] }))).attachmentIds).toEqual([f.id])
  })

  it('refuses a missing file, someone else’s, one used elsewhere, one not clean, and a description naming a file the task lacks', async () => {
    const api = apiAt()
    await api.users.viewAs('u-1')
    const theirs = await api.files.uploadForTask('p-nex', pdf('theirs.pdf'))
    await api.users.viewAs('u-2')
    const pending = await api.files.uploadForTask('p-nex', pdf('pending.pdf'))
    const blocked = await api.files.uploadForTask('p-nex', pdf('blocked.pdf'))
    const loose = await api.files.uploadForTask('p-nex', pdf('loose.pdf'))
    await db.update((data) => {
      data.attachments.find((a) => a.id === pending.id)!.scanStatus = 'pending'
      data.attachments.find((a) => a.id === blocked.id)!.scanStatus = 'blocked'
    })
    await expect(api.tasks.create(newTask({ ...nex, attachmentIds: ['a-gone'] }))).rejects.toMatchObject({ status: 404 })
    await expect(api.tasks.create(newTask({ ...nex, attachmentIds: [theirs.id] }))).rejects.toMatchObject({ status: 403, detail: 'You can only attach files you uploaded.' })
    await expect(api.tasks.create(newTask({ ...nex, attachmentIds: [pending.id] }))).rejects.toMatchObject({ status: 400, detail: 'pending.pdf is still being checked.' })
    await expect(api.tasks.create(newTask({ ...nex, attachmentIds: [blocked.id] }))).rejects.toMatchObject({ status: 400, detail: 'blocked.pdf was blocked.' })
    await expect(api.tasks.create(newTask({ ...nex, descriptionBody: [fileBlock(loose.id)] }))).rejects.toMatchObject({ status: 400, detail: "The description couldn't be read. Try again." })
    await api.users.viewAs('u-4')
    await expect(api.tasks.create(newTask({ attachmentIds: ['a-mob-checklist'] }))).rejects.toMatchObject({ status: 400, detail: 'Upload that file again to attach it here.' })
  })

  it('a file taken off the task leaves its description and, used nowhere else, is deleted; history and the audit log say so', async () => {
    const api = apiAt()
    await api.users.viewAs('u-2')
    const f = await api.files.uploadForTask('p-nex', pdf('flow.pdf'))
    const task = await api.tasks.create(newTask({ ...nex, attachmentIds: [f.id], descriptionBody: [...textBody('Before'), fileBlock(f.id), ...textBody('After')] }))
    const n = (await db.read()).activity.length
    const updated = await api.tasks.update(task.key, { attachmentIds: [] })
    expect(updated.descriptionBody).toEqual(textBody('Before\n\nAfter'))
    expect(updated.description).toBe('Before\n\nAfter')
    const data = await db.read()
    expect(data.attachments.some((a) => a.id === f.id)).toBe(false)
    expect(await db.getFile(f.id)).toBeNull()
    expect(data.activity.slice(n).find((l) => l.kind === 'task.changed')?.changes).toContainEqual({ field: 'attachments', from: null, to: null })
    expect(data.audit.at(-1)?.changes).toContainEqual({ field: 'Files', from: 'flow.pdf', to: null })
  })

  it('a save keeps a file someone else put on the task; the assignee can’t change the files', async () => {
    const api = apiAt()
    await api.users.viewAs('u-2')
    expect((await api.tasks.update('NEX-101', { attachmentIds: ['a-nex-101-flow'], title: 'Rotate refresh tokens' })).attachmentIds).toEqual(['a-nex-101-flow'])
    await api.users.viewAs('u-1')
    expect((await api.tasks.update('NEX-101', { attachmentIds: ['a-nex-101-flow'], priority: 'urgent' })).attachmentIds).toEqual(['a-nex-101-flow'])
    await api.users.viewAs('u-3') // assignee of NEX-105
    await expect(api.tasks.update('NEX-105', { attachmentIds: [] })).rejects.toMatchObject({ status: 403 })
  })
})
