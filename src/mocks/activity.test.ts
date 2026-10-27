import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'
import { createTicket, updateTicket } from './tickets'

let db: MockDb
let api: Api
let hub: MockHub

beforeEach(() => {
  latency.min = latency.max = 0
  hub = createMockHub(`test-activity-${Math.random()}`, null)
  db = createDb(createMemoryStore(), seed)
  api = createMockApi(db, hub)
})
afterEach(() => hub.close())

const mine = async () => (await db.read()).activity.filter((a) => a.actorId !== 'seed')
const latest = async () => (await mine()).at(-1)!

describe('task history', () => {
  it('create logs task.created by the current person', async () => {
    await api.users.viewAs('u-2')
    const t = await api.tasks.create({ projectId: 'p-nex', title: 'Rate limit', description: '', status: '', priority: 'medium', storyPoints: null, assigneeId: null, sprintId: null })
    expect(await latest()).toMatchObject({ kind: 'task.created', taskKey: t.key, projectId: 'p-nex', actorId: 'u-2', changes: [] })
  })

  it('an update logs moved and changed separately, with from/to and label snapshots; rank-only logs nothing', async () => {
    await api.users.viewAs('u-2')
    const before = (await db.read()).tickets.find((t) => t.key === 'NEX-101')!
    const count = (await mine()).length
    await api.tasks.update('NEX-101', { status: 'done', priority: 'low', dueAt: '2026-11-05T00:00:00.000Z', description: 'New words' })
    const [moved, changed] = (await mine()).slice(count)
    expect(moved).toMatchObject({ kind: 'task.moved', taskKey: 'NEX-101', changes: [{ field: 'status', from: before.status, to: 'done', toLabel: 'Done' }] })
    expect(changed!.kind).toBe('task.changed')
    expect(changed!.changes).toEqual(
      expect.arrayContaining([
        { field: 'priority', from: before.priority, to: 'low' },
        { field: 'dueAt', from: before.dueAt, to: '2026-11-05T00:00:00.000Z' },
        { field: 'description', from: null, to: null },
      ]),
    )
    const n = (await mine()).length
    await api.tasks.update('NEX-101', { rank: 1 })
    expect((await mine()).length).toBe(n)
  })

  it('archive and restore are logged', async () => {
    await api.tasks.archive('NEX-102')
    expect((await latest()).kind).toBe('task.archived')
    await api.tasks.restore('NEX-102')
    expect((await latest()).kind).toBe('task.restored')
  })

  it('deleting a column logs one column.deleted with the count and a task.moved per task', async () => {
    const moving = (await db.read()).tickets.filter((t) => t.projectId === 'p-nex' && t.status === 'inReview').length
    const count = (await mine()).length
    await api.projects.deleteColumn('p-nex', 'inReview', 'done')
    const added = (await mine()).slice(count)
    expect(added.filter((a) => a.kind === 'task.moved')).toHaveLength(moving)
    expect(added.find((a) => a.kind === 'column.deleted')).toMatchObject({ subject: 'In review', count: moving, changes: [{ field: 'moveTo', from: 'inReview', to: 'done', fromLabel: 'In review', toLabel: 'Done' }] })
  })

  it('forTask lists newest first; forProject pages newest first by cursor', async () => {
    for (let i = 0; i < 3; i++) await updateTicket(db, hub, 'NEX-101', { title: `Title ${i}` })
    const forTask = await api.activity.forTask('NEX-101')
    expect(forTask[0]!.changes[0]).toMatchObject({ field: 'title', to: 'Title 2' })
    for (let i = 0; i < 35; i++) await createTicket(db, hub, { projectId: 'p-nex', title: `T${i}`, description: '', status: '', priority: 'low', storyPoints: null, assigneeId: null, sprintId: null })
    const first = await api.activity.forProject('p-nex')
    expect(first.items).toHaveLength(30)
    expect(first.items[0]!.at >= first.items[29]!.at).toBe(true)
    const next = await api.activity.forProject('p-nex', first.nextCursor!)
    expect(next.items.some((a) => first.items.some((f) => f.id === a.id))).toBe(false)
    expect(next.items.length).toBeGreaterThan(0)
  })
})
