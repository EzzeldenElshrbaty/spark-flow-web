import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
import type { RealtimeEvent } from '@/lib/realtime'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

let db: MockDb
let hub: MockHub
let api: Api
let events: RealtimeEvent[]
let n = 0

beforeEach(() => {
  latency.min = latency.max = 0
  db = createDb(createMemoryStore(), seed)
  hub = createMockHub(`test-task-lists-${++n}`, null)
  api = createMockApi(db, hub)
  events = []
  hub.subscribe((e) => events.push(e))
})
afterEach(() => hub.close())

const detail = (promise: Promise<unknown>) => promise.then(() => '', (e: { detail?: string }) => e.detail)
const keys = async (channelId: string) => (await api.taskLists.get(channelId)).entries.map((e) => e.task.key)
/** Puts made-up tasks on a channel's list until it shows `upTo` (archived ones, when `archived`, don't show). */
const fill = (channelId: string, upTo: number, archived = false) =>
  db.update((d) => {
    const model = d.tickets.find((t) => t.key === 'NEX-110')!
    const shown = d.channelTasks.filter((r) => r.channelId === channelId).length
    for (let i = shown; i < upTo; i++) {
      d.tickets.push({ ...model, id: `t-fill-${channelId}-${i}`, key: `FILL-${i}`, archivedAt: archived ? new Date().toISOString() : null })
      d.channelTasks.push({ id: `ct-fill-${channelId}-${i}`, channelId, taskId: `t-fill-${channelId}-${i}`, addedBy: 'u-1', addedAt: new Date().toISOString() })
    }
  })

describe('a channel’s task list (chat spec 6.14, task list §4)', () => {
  it('reads #frontend-dev’s seeded list in the order added, each task live', async () => {
    const list = await api.taskLists.get('c-frontend')
    expect(list.channelId).toBe('c-frontend')
    expect(list.entries.map((e) => e.task.key)).toEqual(['NEX-106', 'NEX-105', 'NEX-103', 'MOB-103'])
    const mob = list.entries.find((e) => e.task.key === 'MOB-103')!
    expect(mob).toMatchObject({ addedBy: 'u-3', task: { projectKey: 'MOB', projectId: 'p-mob', overdue: true, category: 'todo' } })
    expect(mob.task.dueAt).not.toBeNull()
    expect(list.entries.find((e) => e.task.key === 'NEX-103')!.task).toMatchObject({ category: 'done', overdue: false })
    expect(list.entries[0].task).toMatchObject({ id: 't-nex-106', title: 'Show an unread badge in the channel list', statusLabel: 'To do' })
  })

  it('adds an existing task for whoever may post, last, and tells the channel', async () => {
    db.actAs('u-3')
    const entry = await api.taskLists.add('c-frontend', 'NEX-110')
    expect(entry).toMatchObject({ addedBy: 'u-3', task: { key: 'NEX-110' } })
    expect((await keys('c-frontend')).at(-1)).toBe('NEX-110')
    expect(events).toContainEqual({ type: 'channelChanged', channelId: 'c-frontend' })
  })

  it('refuses what can’t go on a list, each with its sentence', async () => {
    expect(await detail(api.taskLists.add('c-dm-1', 'NEX-110'))).toBe('Task lists are for channels.')
    expect(await detail(api.taskLists.add('c-frontend', 'NEX-999'))).toBe('That task no longer exists.')
    expect(await detail(api.taskLists.add('c-frontend', 'BRD-101'))).toBe('That task is in another workspace.')
    await expect(api.taskLists.add('c-frontend', 'NEX-106')).rejects.toMatchObject({ status: 409, detail: 'That task is already on this list.' })
    await db.update((d) => void (d.tickets.find((t) => t.key === 'NEX-108')!.archivedAt = new Date().toISOString()))
    expect(await detail(api.taskLists.add('c-frontend', 'NEX-108'))).toBe('This task is archived. Restore it first.')
  })

  it('holds up to 200 tasks', async () => {
    await fill('c-frontend', 200)
    expect(await detail(api.taskLists.add('c-frontend', 'NEX-110'))).toBe('A task list holds up to 200 tasks.')
  })

  it('follows who may post: an archived channel, Only admins, someone else’s private channel', async () => {
    db.actAs('u-3')
    expect(await detail(api.taskLists.add('c-release', 'NEX-110'))).toBe('You’re not in this channel.')
    expect(await detail(api.taskLists.get('c-release'))).toBe('You’re not in this channel.')
    await db.update((d) => void (d.channels.find((c) => c.id === 'c-frontend')!.whoCanPost = 'admins'))
    await expect(api.taskLists.add('c-frontend', 'NEX-110')).rejects.toMatchObject({ status: 403 })
    await expect(api.taskLists.remove('c-frontend', 'NEX-105')).rejects.toMatchObject({ status: 403 })
    db.actAs('u-1')
    await db.update((d) => void (d.channels.find((c) => c.id === 'c-frontend')!.archivedAt = new Date().toISOString()))
    expect(await detail(api.taskLists.add('c-frontend', 'NEX-110'))).toBe('This channel is archived.')
    expect(await keys('c-frontend')).toHaveLength(4)
  })

  it('removes a task from the list and leaves the task', async () => {
    await api.taskLists.remove('c-frontend', 'NEX-105')
    expect(await keys('c-frontend')).toEqual(['NEX-106', 'NEX-103', 'MOB-103'])
    expect((await api.tickets.get('NEX-105')).archivedAt ?? null).toBeNull()
    expect(events).toContainEqual({ type: 'channelChanged', channelId: 'c-frontend' })
    await expect(api.taskLists.remove('c-frontend', 'NEX-105')).rejects.toMatchObject({ status: 404, detail: 'That task isn’t on this list.' })
  })

  it('leaves an archived task out, and has it back in its place once restored', async () => {
    await api.tasks.archive('NEX-105', 'Parked')
    expect(await keys('c-frontend')).toEqual(['NEX-106', 'NEX-103', 'MOB-103'])
    await api.tasks.restore('NEX-105')
    expect(await keys('c-frontend')).toEqual(['NEX-106', 'NEX-105', 'NEX-103', 'MOB-103'])
  })
})

describe('making a task on the list (task list §6, R2)', () => {
  const input = { projectId: 'p-nex', title: 'Ship the list', descriptionBody: [], status: '', priority: 'low' as const, storyPoints: null, assigneeId: null, sprintId: null }
  const counts = async () => {
    const d = await db.read()
    return [d.tickets.length, d.channelTasks.length, d.counters['p-nex']]
  }

  it('makes the task in the channel and puts it on the list, recorded once', async () => {
    const before = (await db.read()).audit.length
    const task = await api.taskLists.addNew('c-frontend', input)
    expect(task).toMatchObject({ title: 'Ship the list', linkedChannelId: 'c-frontend', linkedMessageId: null, projectId: 'p-nex' })
    expect((await keys('c-frontend')).at(-1)).toBe(task.key)
    const made = (await db.read()).audit.slice(before).filter((e) => e.action === 'created' && e.record?.type === 'task')
    expect(made).toHaveLength(1)
    expect(events).toContainEqual({ type: 'channelChanged', channelId: 'c-frontend' })
  })

  it('makes neither the task nor the row when either part is refused', async () => {
    db.actAs('u-3')
    const was = await counts()
    await expect(api.taskLists.addNew('c-frontend', input)).rejects.toMatchObject({ status: 403 })
    expect(await counts()).toEqual(was)
    db.actAs('u-1')
    await fill('c-frontend', 200)
    const full = await counts()
    expect(await detail(api.taskLists.addNew('c-frontend', input))).toBe('A task list holds up to 200 tasks.')
    expect(await counts()).toEqual(full)
    expect(await detail(api.taskLists.addNew('c-dm-1', input))).toBe('Task lists are for channels.')
  })

  it('refuses a project of another workspace, as adding an existing task does, and makes nothing', async () => {
    const was = await (async () => (await db.read()).tickets.length)()
    expect(await detail(api.taskLists.addNew('c-frontend', { ...input, projectId: 'p-brd' }))).toBe('That task is in another workspace.')
    expect((await db.read()).tickets.length).toBe(was)
  })

  it('a message’s task comes from its project’s own chat only', async () => {
    const data = await db.read()
    const own = data.messages.find((m) => m.channelId === 'c-p-nex' && !m.deletedAt && !m.broadcast && !m.taskEvent && !m.commentId)!
    const elsewhere = data.messages.find((m) => m.channelId === 'c-frontend' && !m.deletedAt)!
    const task = await api.taskLists.addNew('c-p-nex', { ...input, linkedMessageId: own.id })
    expect(task.linkedMessageId).toBe(own.id)
    expect(await keys('c-p-nex')).toContain(task.key)
    expect(await detail(api.taskLists.addNew('c-frontend', { ...input, linkedMessageId: elsewhere.id }))).toBe('This message isn’t in the project’s chat.')
  })
})

describe('final review fixes (task list)', () => {
  const input = { projectId: 'p-nex', title: 'From chat', descriptionBody: [], status: '', priority: 'low' as const, storyPoints: null, assigneeId: null, sprintId: null }

  it('counts only the tasks the list shows toward 200: archived ones don’t', async () => {
    await fill('c-frontend', 200, true)
    const entry = await api.taskLists.add('c-frontend', 'NEX-110')
    expect(entry.task.key).toBe('NEX-110')
  })

  it('/task and Create task still make the task when the list is full; it just isn’t on the list', async () => {
    await fill('c-frontend', 200)
    const task = await api.taskLists.addNew('c-frontend', input, { optional: true })
    expect(task.title).toBe('From chat')
    expect(await keys('c-frontend')).not.toContain(task.key)
    expect(await detail(api.taskLists.addNew('c-frontend', input))).toBe('A task list holds up to 200 tasks.')
  })

  it('…and when I may not post in the channel, as someone who manages the project’s tasks', async () => {
    await db.update((d) => void (d.channels.find((c) => c.id === 'c-p-nex')!.whoCanPost = 'admins'))
    db.actAs('u-2')
    const task = await api.taskLists.addNew('c-p-nex', input, { optional: true })
    expect(await keys('c-p-nex')).not.toContain(task.key)
    await expect(api.taskLists.addNew('c-p-nex', input)).rejects.toMatchObject({ status: 403 })
  })
})
