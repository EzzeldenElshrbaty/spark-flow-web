import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api, UploadFile } from '@/api/types'
import { columnsOf } from '@/lib/boardColumns'
import type { RealtimeEvent } from '@/lib/realtime'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

let db: MockDb
let api: Api
let hub: MockHub
let events: RealtimeEvent[]
let clock: Date

beforeEach(() => {
  latency.min = latency.max = 0
  clock = new Date('2026-10-26T12:00:00Z')
  hub = createMockHub(`test-archived-${Math.random()}`, null)
  db = createDb(createMemoryStore(), seed, () => clock)
  api = createMockApi(db, hub, () => clock)
  events = []
  hub.subscribe((e) => events.push(e))
})
afterEach(() => hub.close())

const pdf = (): UploadFile => Object.assign(new Blob(['%PDF-1.4 x'], { type: 'application/pdf' }), { name: 'x.pdf' })
const closed = { status: 400, detail: 'This project is archived. Restore it first.' }

describe('archiving projects', () => {
  it('archive is Admin only', async () => {
    for (const who of ['u-2', 'u-9']) {
      await api.users.viewAs(who) // Nour manages NEX; Karim is Sales
      await expect(api.projects.archive('p-nex')).rejects.toMatchObject({ status: 403 })
    }
  })

  it('an archived project leaves the list and the dashboard, still opens by key, and keeps its hours in the report', async () => {
    const hoursBefore = (await api.time.report('ws-eng', 30)).byProject.find((p) => p.projectId === 'p-nex')?.hours
    const archived = await api.projects.archive('p-nex')
    expect(archived.archivedAt).toEqual(expect.any(String))
    expect((await api.projects.list('ws-eng')).some((p) => p.id === 'p-nex')).toBe(false)
    expect((await api.projects.list('ws-eng', { archived: true })).map((p) => p.id)).toEqual(['p-nex'])
    expect((await api.dashboard.projects('ws-eng')).some((p) => p.id === 'p-nex')).toBe(false)
    expect((await api.projects.get('ws-eng', 'NEX')).archivedAt).toEqual(expect.any(String))
    expect((await api.time.report('ws-eng', 30)).byProject.find((p) => p.projectId === 'p-nex')?.hours).toBe(hoursBefore)
  })

  it('every write on an archived project is refused with "This project is archived. Restore it first."', async () => {
    const file = await api.files.upload('p-nex', pdf())
    const comment = await api.comments.create({ taskKey: 'NEX-102', kind: 'comment', body: 'Before', files: [] })
    const data = await db.read()
    const phase = data.phases.find((p) => p.projectId === 'p-nex')!
    const board = columnsOf(data.projects.find((p) => p.id === 'p-nex')!)
    await api.projects.archive('p-nex')
    const writes: [string, () => Promise<unknown>][] = [
      ['projects.update', () => api.projects.update('p-nex', { name: 'X' })],
      ['projects.addColumn', () => api.projects.addColumn('p-nex', { label: 'QA', category: 'inProgress' })],
      ['projects.deleteColumn', () => api.projects.deleteColumn('p-nex', 'inReview', 'done')],
      ['projects.setBoard', () => api.projects.setBoard('p-nex', board)],
      ['phases.create', () => api.phases.create({ projectId: 'p-nex', name: 'Extra', startDate: phase.startDate, dueDate: phase.dueDate })],
      ['phases.update', () => api.phases.update(phase.id, { name: 'Y' })],
      ['phases.remove', () => api.phases.remove(phase.id)],
      ['phases.reorder', () => api.phases.reorder('p-nex', data.phases.filter((p) => p.projectId === 'p-nex').map((p) => p.id))],
      ['deliverables.create', () => api.deliverables.create({ projectId: 'p-nex', phaseId: null, title: 'Z', dueDate: phase.dueDate })],
      ['deliverables.update', () => api.deliverables.update('d-nex-1', { title: 'Z' })],
      ['deliverables.remove', () => api.deliverables.remove('d-nex-1')],
      ['tasks.create', () => api.tasks.create({ projectId: 'p-nex', title: 'New', description: '', status: '', priority: 'medium', storyPoints: null, assigneeId: null, sprintId: null })],
      ['tasks.update', () => api.tasks.update('NEX-102', { title: 'New' })],
      ['tasks.archive', () => api.tasks.archive('NEX-102')],
      ['comments.create', () => api.comments.create({ taskKey: 'NEX-102', kind: 'comment', body: 'After', files: [] })],
      ['comments.update', () => api.comments.update(comment.id, 'Changed')],
      ['comments.remove', () => api.comments.remove(comment.id)],
      ['files.upload', () => api.files.upload('p-nex', pdf())],
      ['files.remove', () => api.files.remove(file.id)],
      ['time.start', () => api.time.start({ projectId: 'p-nex' })],
    ]
    for (const [name, write] of writes) await expect(write(), name).rejects.toMatchObject(closed)
  })

  it('archiving stops running timers on its tasks and archives its channel', async () => {
    await api.time.start({ projectId: 'p-nex' })
    await api.projects.archive('p-nex')
    const data = await db.read()
    expect(data.timeEntries.filter((e) => e.projectId === 'p-nex' && e.endedAt === null)).toHaveLength(0)
    expect(data.channels.find((c) => c.id === 'c-p-nex')!.archivedAt).toEqual(expect.any(String))
    await expect(api.chat.send('c-p-nex', 'Hello?')).rejects.toMatchObject({ status: 400, detail: 'This channel is archived.' })
    expect(events).toEqual(expect.arrayContaining([{ type: 'projectChanged', projectId: 'p-nex' }, { type: 'channelChanged', channelId: 'c-p-nex' }, expect.objectContaining({ type: 'timeLogged' })]))
    expect(data.activity.at(-1)).toMatchObject({ kind: 'project.archived', projectId: 'p-nex' })
  })

  it('restore reopens it and its channel', async () => {
    await api.projects.archive('p-nex')
    expect((await api.projects.restore('p-nex')).archivedAt ?? null).toBeNull()
    expect((await api.chat.send('c-p-nex', 'Back')).content).toBe('Back')
    expect((await api.projects.update('p-nex', { clientName: 'Again' })).clientName).toBe('Again')
  })
})
