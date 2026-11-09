import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

// UX Phase 2, 2.3: the bell and Activity also say what others did to my tasks: assigned me, moved it, commented on it.
// Worked out on read from the task history and comments; read through the mentions' own read state.

let api: Api
let hub: MockHub
let db: MockDb
// The seed has task news of its own (comments on people's tasks): these tests count what they make.
let since = ''
beforeEach(() => {
  since = new Date().toISOString()
  latency.min = latency.max = 0
  hub = createMockHub(`test-task-inbox-${Math.random()}`, null)
  db = createDb(createMemoryStore(), seed)
  api = createMockApi(db, hub)
})
afterEach(() => hub.close())
const as = (userId: string) => api.users.viewAs(userId)
const taskItems = async () => (await api.mentions.mine()).filter((m) => (m.source === 'assigned' || m.source === 'status' || m.source === 'taskComment') && m.createdAt >= since)

describe('task items for me (UX Phase 2, 2.3)', () => {
  it('someone assigning me a task gives me one "assigned" item; assigning myself gives none', async () => {
    await as('u-2')
    await api.tasks.update('NEX-110', { assigneeId: 'u-3' })
    await as('u-3')
    expect(await taskItems()).toEqual([expect.objectContaining({ source: 'assigned', taskKey: 'NEX-110', authorId: 'u-2', projectId: 'p-nex', workspaceId: 'ws-eng', read: false })])
    await as('u-2')
    await api.tasks.update('NEX-110', { assigneeId: 'u-2' })
    expect(await taskItems()).toEqual([])
  })

  it('a new task made for me counts as assigning me', async () => {
    await as('u-2')
    const made = await api.tasks.create({ projectId: 'p-nex', title: 'Cache headers', descriptionBody: [], type: 'task', phaseId: null, status: 'todo', priority: 'medium', assigneeId: 'u-3', dueAt: null, estimateHours: null, sprintId: null, storyPoints: null })
    await as('u-3')
    expect((await taskItems()).map((m) => [m.source, m.taskKey])).toEqual([['assigned', made.key]])
  })

  it('someone moving my task gives me a "status" item naming the column', async () => {
    await as('u-2')
    await api.tasks.moveTo('NEX-106', 'inReview', 0)
    await as('u-3')
    expect(await taskItems()).toEqual([expect.objectContaining({ source: 'status', taskKey: 'NEX-106', authorId: 'u-2', statusLabel: 'In review' })])
  })

  it('a comment on my task is a "taskComment" item; one that mentions me is only the mention', async () => {
    await as('u-6')
    await api.comments.create({ taskKey: 'NEX-106', kind: 'comment', body: 'Checked on Safari too.', files: [] })
    await api.comments.create({ taskKey: 'NEX-106', kind: 'comment', body: '@[Mariam Fathy](u-3) can you look?', files: [] })
    await as('u-3')
    const all = await api.mentions.mine()
    const mine = all.filter((m) => m.taskKey === 'NEX-106' && m.authorId === 'u-6' && m.createdAt >= since)
    expect(mine.map((m) => m.source).sort()).toEqual(['comment', 'taskComment'])
  })

  it('an "assigned" item stays after the task moves on; status news then goes to the new assignee', async () => {
    await as('u-2')
    await api.tasks.update('NEX-110', { assigneeId: 'u-3' })
    await api.tasks.update('NEX-110', { assigneeId: 'u-7' })
    await api.tasks.moveTo('NEX-110', 'inProgress', 0)
    await as('u-3')
    expect((await taskItems()).map((m) => m.source)).toEqual(['assigned'])
    await as('u-7')
    expect((await taskItems()).map((m) => m.source)).toEqual(['status', 'assigned'])
  })

  it('reads through the mentions’ read state, and Activity lists them as tasks', async () => {
    await as('u-2')
    await api.tasks.update('NEX-110', { assigneeId: 'u-3' })
    await as('u-3')
    const [item] = await taskItems()
    await api.mentions.markRead([item!.id])
    expect((await taskItems())[0]!.read).toBe(true)
    const activity = await api.inbox.list('ws-eng')
    expect(activity.find((a) => a.id === item!.id)).toMatchObject({ kind: 'task', taskEvent: 'assigned', taskKey: 'NEX-110', read: true })
  })
})
