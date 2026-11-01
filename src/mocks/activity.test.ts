import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
import { columnsOf } from '@/lib/boardColumns'
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

describe('history beyond tasks', () => {
  const since = async (n: number) => (await db.read()).activity.slice(n)
  const count = async () => (await db.read()).activity.length

  it('a comment, a bug, an edit and a delete are logged without their text', async () => {
    await api.users.viewAs('u-4') // Ahmed manages Mobile App
    const n = await count()
    const c = await api.comments.create({ taskKey: 'MOB-104', kind: 'comment', body: 'secret words', files: [] })
    await api.comments.create({ taskKey: 'MOB-104', kind: 'bug', body: 'more secret', files: [] })
    await api.comments.update(c.id, 'edited secret')
    await api.comments.remove(c.id)
    const lines = await since(n)
    expect(lines.map((l) => [l.kind, l.subject, l.taskKey])).toEqual([
      ['comment.added', 'comment', 'MOB-104'],
      ['comment.added', 'bug', 'MOB-104'],
      ['comment.edited', 'comment', 'MOB-104'],
      ['comment.deleted', 'comment', 'MOB-104'],
    ])
    expect(JSON.stringify(lines)).not.toContain('secret')
  })

  it('setBoard logs one entry per renamed, moved or retyped column; addColumn logs the new one', async () => {
    const board = columnsOf(await api.projects.get('ws-eng', 'NEX'))
    const n = await count()
    const next = board.map((c) => (c.id === 'inReview' ? { ...c, label: 'Testing' } : c.id === 'backlog' ? { ...c, category: 'inProgress' as const } : c))
    await api.projects.setBoard('p-nex', [next[1]!, next[0]!, ...next.slice(2)])
    await api.projects.addColumn('p-nex', { label: 'QA', category: 'inProgress' })
    const lines = await since(n)
    expect(lines.map((l) => l.kind).sort()).toEqual(['column.added', 'column.moved', 'column.renamed', 'column.typed'].sort())
    expect(lines.find((l) => l.kind === 'column.renamed')).toMatchObject({ subject: 'Testing', changes: [{ field: 'label', from: 'In review', to: 'Testing' }] })
    expect(lines.find((l) => l.kind === 'column.typed')).toMatchObject({ subject: 'Backlog', changes: [{ field: 'category', from: 'todo', to: 'inProgress' }] })
    expect(lines.find((l) => l.kind === 'column.added')).toMatchObject({ subject: 'QA', changes: [{ field: 'category', from: null, to: 'inProgress' }] })
  })

  it('phase and deliverable changes and a project edit are logged', async () => {
    await api.users.viewAs('u-2')
    const n = await count()
    const phase = await api.phases.create({ projectId: 'p-nex', name: 'Hardening', startDate: '2026-11-01T00:00:00.000Z', dueDate: '2026-11-10T00:00:00.000Z' })
    await api.phases.update(phase.id, { name: 'Hardening 2' })
    await api.phases.remove(phase.id)
    const d = await api.deliverables.create({ projectId: 'p-nex', title: 'API docs', phaseId: null, dueDate: '2026-11-12T00:00:00.000Z' })
    await api.deliverables.update(d.id, { doneAt: '2026-11-02T00:00:00.000Z' })
    await api.projects.update('p-nex', { description: 'About changed' })
    expect((await since(n)).map((l) => [l.kind, l.subject ?? null])).toEqual([
      ['phase.added', 'Hardening'],
      ['phase.changed', 'Hardening 2'],
      ['phase.removed', 'Hardening 2'],
      ['deliverable.added', 'API docs'],
      ['deliverable.changed', 'API docs'],
      ['project.changed', null],
    ])
  })

  it('nothing from chat messages or time entries is logged', async () => {
    const n = await count()
    await api.chat.send('c-p-nex', 'hello')
    await api.time.start({ taskId: 't-nex-102' })
    await api.time.stop()
    expect(await since(n)).toEqual([])
  })
})

describe('history polish (M8)', () => {
  it('history times follow the api clock', async () => {
    const at = new Date('2031-01-02T03:04:05.000Z')
    const fixed = createMockApi(db, hub, () => at)
    await fixed.tasks.update('NEX-101', { priority: 'low' })
    expect((await db.read()).activity.at(-1)!.at).toBe(at.toISOString())
  })

  it('a project update that changes nothing logs nothing', async () => {
    const p = (await db.read()).projects.find((x) => x.id === 'p-nex')!
    const n = (await db.read()).activity.length
    await api.projects.update('p-nex', { description: p.description })
    expect((await db.read()).activity.length).toBe(n)
  })

  it('removing a phase logs the phase change on each of its tasks', async () => {
    const d = await db.read()
    const phase = d.phases.find((p) => p.projectId === 'p-nex' && d.tickets.some((t) => t.phaseId === p.id))!
    const keys = d.tickets.filter((t) => t.phaseId === phase.id).map((t) => t.key)
    const n = d.activity.length
    await api.phases.remove(phase.id)
    const lines = (await db.read()).activity.slice(n).filter((l) => l.kind === 'task.changed')
    expect(lines.map((l) => l.taskKey).sort()).toEqual([...keys].sort())
    expect(lines[0]!.changes).toEqual([{ field: 'phaseId', from: phase.id, to: null, fromLabel: phase.name }])
  })
})
