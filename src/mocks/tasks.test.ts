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
    expect(events.map((e) => e.type)).toEqual(['ticketUpdated'])
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
