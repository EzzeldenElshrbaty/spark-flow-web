import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'
import { fileRecord } from './files'

// Archived records (Admin and help, slice 4): one list of archived projects, tasks and channels, the "Why?" given when
// archiving, how long they're kept, and deleting for good, which never takes logged time or a channel.

const DAY = 86_400_000
let db: MockDb
let api: Api
let hub: MockHub
let clock: Date
let events: string[]
beforeEach(() => {
  latency.min = latency.max = 0
  clock = new Date('2026-10-31T12:00:00Z')
  hub = createMockHub(`test-archive-${Math.random()}`, null)
  events = []
  hub.subscribe((e) => events.push(e.type))
  db = createDb(createMemoryStore(), seed, () => clock)
  api = createMockApi(db, hub, () => clock)
})
afterEach(() => hub.close())

const detail = (promise: Promise<unknown>) => promise.then(() => '', (e: { detail?: string }) => e.detail)
const lastEntry = async () => (await db.read()).audit.at(-1)!
/** A task on NEX with nothing logged on it. */
const fresh = () => api.tasks.create({ projectId: 'p-nex', title: 'Spike: export to PDF', descriptionBody: [], status: '', priority: 'low', storyPoints: null, assigneeId: null, sprintId: null })

describe('archiving asks why (slice 4)', () => {
  it('a project, a task and a channel keep who archived them and why; restoring clears both', async () => {
    await api.projects.archive('p-sel', '  Client paused the booking work ')
    const task = await fresh()
    await api.tasks.archive(task.key, 'Out of scope')
    await api.chat.archiveChannel('c-release')
    const data = await db.read()
    expect(data.projects.find((p) => p.id === 'p-sel')).toMatchObject({ archivedBy: 'u-1', archiveReason: 'Client paused the booking work' })
    expect(data.channels.find((c) => c.id === 'c-p-sel')).toMatchObject({ archivedBy: 'u-1', archiveReason: 'Client paused the booking work' })
    expect(data.tickets.find((t) => t.key === task.key)).toMatchObject({ archivedBy: 'u-1', archiveReason: 'Out of scope' })
    expect(data.channels.find((c) => c.id === 'c-release')).toMatchObject({ archivedBy: 'u-1', archiveReason: null })
    expect(await lastEntry()).toMatchObject({ action: 'archived', record: { type: 'channel' }, detail: null })
    expect(data.audit.find((e) => e.record?.id === 'p-sel')?.detail).toMatch(/^Client paused the booking work · With its channel/)
    await api.projects.restore('p-sel')
    expect((await db.read()).projects.find((p) => p.id === 'p-sel')).toMatchObject({ archivedAt: null, archivedBy: null, archiveReason: null })
  })

  it('archiving an archived task again changes nothing: its reason and date stay, and nobody is told', async () => {
    const task = await fresh()
    await api.tasks.archive(task.key, 'Out of scope')
    const before = (await db.read()).tickets.find((t) => t.key === task.key)!
    const logged = (await db.read()).audit.length
    clock = new Date(clock.getTime() + DAY)
    events.length = 0
    await api.tasks.archive(task.key)
    const after = (await db.read()).tickets.find((t) => t.key === task.key)!
    expect(after).toMatchObject({ archivedAt: before.archivedAt, archiveReason: 'Out of scope', updatedAt: before.updatedAt })
    expect((await db.read()).audit.length).toBe(logged)
    expect(events).toEqual([])
  })

  it('a reason is checked only once access is: someone who can’t archive hears that first', async () => {
    await api.users.viewAs('u-5')
    expect(await detail(api.projects.archive('p-sel', 'x'.repeat(201)))).toMatch(/^You don't have access/)
    expect(await detail(api.chat.archiveChannel('c-release', 'x'.repeat(201)))).not.toBe('Keep the reason under 200 characters.')
  })

  it('a reason is at most 200 characters', async () => {
    expect(await detail(api.projects.archive('p-sel', 'x'.repeat(201)))).toBe('Keep the reason under 200 characters.')
    expect((await db.read()).projects.find((p) => p.id === 'p-sel')!.archivedAt ?? null).toBeNull()
  })
})

describe('the list of archived records (slice 4)', () => {
  it('lists projects, tasks and channels newest first, with whether and when each may be deleted for good', async () => {
    await api.chat.archiveChannel('c-release', 'Release shipped')
    clock = new Date(clock.getTime() + 60_000)
    const task = await fresh()
    await api.tasks.archive(task.key)
    clock = new Date(clock.getTime() + 60_000)
    await api.projects.archive('p-sel')
    await api.projects.archive('p-mob')
    const { items, retentionDays } = await api.archive.list('ws-eng')
    expect(retentionDays).toBe(365)
    // Newest first (a channel's archive takes the server's own clock, so only the order is checked).
    expect(items.map((r) => r.archivedAt)).toEqual(items.map((r) => r.archivedAt).sort().reverse())
    expect(items.map((r) => [r.type, r.ref]).sort()).toEqual([['channel', 'release-v2'], ['project', 'MOB'], ['project', 'SEL'], ['task', task.key]])
    const find = (ref: string) => items.find((r) => r.ref === ref)!
    const [project, archivedTask, channel] = [find('MOB'), find(task.key), find('release-v2')]
    // Mobile App has time logged, so it's always kept; Sela booking and the new task have none, so they may go after a year.
    expect(project).toMatchObject({ name: 'Mobile App', keptBecause: 'time', deletableFrom: null, archivedBy: 'u-1', reason: null })
    expect(project!.includes.tasks).toBeGreaterThan(0)
    expect(find('SEL')).toMatchObject({ keptBecause: null, deletableFrom: new Date(clock.getTime() + 365 * DAY).toISOString() })
    expect(archivedTask).toMatchObject({ keptBecause: null, deletableFrom: new Date(clock.getTime() - 60_000 + 365 * DAY).toISOString() })
    expect(channel).toMatchObject({ name: '#release-v2', keptBecause: 'channel', deletableFrom: null, reason: 'Release shipped' })
  })

  it('a project’s channel is listed with its project, not on its own', async () => {
    await api.projects.archive('p-sel')
    expect((await api.archive.list('ws-eng')).items.map((r) => r.id)).toEqual(['p-sel'])
  })

  it('only whoever may manage archived records sees the list, sets how long they’re kept, or deletes', async () => {
    await api.users.viewAs('u-2')
    expect(await detail(api.archive.list('ws-eng'))).toBe("You don't have access to archived records.")
    expect(await detail(api.archive.setRetention(90))).toBe("You don't have access to archived records.")
    expect(await detail(api.archive.deleteForGood('task', 'NEX-101'))).toBe("You don't have access to archived records.")
  })

  it('keeps them 30 to 3650 days; a change is logged and moves every date', async () => {
    expect(await detail(api.archive.setRetention(10))).toBe('Keep them between 30 and 3650 days.')
    expect(await detail(api.archive.setRetention(90.5))).toBe('Keep them between 30 and 3650 days.')
    const task = await fresh()
    await api.tasks.archive(task.key)
    expect(await api.archive.setRetention(30)).toBe(30)
    expect(await lastEntry()).toMatchObject({ action: 'changed', group: 'settings', record: { name: 'Archived records' }, changes: [{ field: 'Kept for (days)', from: '365', to: '30' }] })
    expect((await api.archive.list('ws-eng')).items[0]!.deletableFrom).toBe(new Date(clock.getTime() + 30 * DAY).toISOString())
  })
})

describe('restoring from the list (slice 4)', () => {
  it('a task whose project is archived says to restore the project first', async () => {
    const task = await fresh()
    await api.tasks.archive(task.key)
    await api.projects.archive('p-nex')
    const row = (await api.archive.list('ws-eng')).items.find((r) => r.id === task.key)!
    expect(row.restoreBlocked).toBe('Restore its project first.')
    expect((await api.archive.list('ws-eng')).items.find((r) => r.id === 'p-nex')!.restoreBlocked).toBeNull()
  })

  it('someone who may manage archived records but not restore a kind is told so on that row', async () => {
    const task = await fresh()
    await api.tasks.archive(task.key)
    await api.projects.archive('p-sel')
    await api.chat.archiveChannel('c-release')
    const role = await api.roles.create({ name: 'Archivist' })
    await api.roles.saveGrants([{ roleId: role.id, add: ['archive.manage'], remove: [] }])
    await api.users.update('u-5', { roleIds: [role.id] })
    await api.users.viewAs('u-5')
    const blocked = Object.fromEntries((await api.archive.list('ws-eng')).items.map((r) => [r.type, r.restoreBlocked]))
    expect(blocked).toEqual({ project: 'You can’t restore projects.', task: 'You can’t restore tasks in this project.', channel: 'Only admins can restore channels.' })
  })
})

describe('deleting for good (slice 4)', () => {
  it('not before the retention ends; then the task and its comments go, the log says so, and every tab hears', async () => {
    const task = await fresh()
    await api.comments.create({ taskKey: task.key, kind: 'comment', body: 'Parked until Q1', files: [Object.assign(new Blob(['notes']), { name: 'notes.txt' })] })
    await api.tasks.archive(task.key, 'Parked')
    // A comment's file stays with the chat card that shows it, so a task takes no files with it.
    expect((await api.archive.list('ws-eng')).items[0]!.includes).toEqual({ tasks: 0, files: 0, comments: 1, phases: 0, deliverables: 0 })
    expect(await detail(api.archive.deleteForGood('task', task.key))).toBe('It can be deleted for good from 31 Oct 2027.')
    clock = new Date(clock.getTime() + 366 * DAY)
    events.length = 0
    await api.archive.deleteForGood('task', task.key)
    const data = await db.read()
    expect(data.tickets.some((t) => t.key === task.key)).toBe(false)
    expect(data.comments.some((c) => c.taskId === task.id)).toBe(false)
    expect(await lastEntry()).toMatchObject({ action: 'deleted', group: 'status', record: { type: 'task', id: task.key }, detail: 'Deleted for good · 1 comment' })
    expect(events).toContain('projectChanged')
  })

  it('a task takes its files and its comments’ files with it, unless something else still has them', async () => {
    const task = await fresh()
    const shared = await api.files.upload('p-nex', Object.assign(new Blob(['%PDF-1.4 x'], { type: 'application/pdf' }), { name: 'shared.pdf' }))
    await db.update((data) => {
      const at = clock.toISOString()
      for (const id of ['f-task', 'f-comment']) data.attachments.push({ ...fileRecord({ name: `${id}.txt`, type: 'text/plain', size: 1 }, 'u-1', at), id })
      data.tickets.find((t) => t.key === task.key)!.attachmentIds = ['f-task', shared.attachmentId]
      data.comments.push({ id: 'cm-x', taskId: task.id, projectId: 'p-nex', authorId: 'u-1', kind: 'comment', body: 'x', attachmentIds: ['f-comment'], createdAt: at })
    })
    for (const id of ['f-task', 'f-comment']) await db.putFile(id, new Blob(['x']))
    await api.tasks.archive(task.key, 'Parked')
    expect((await api.archive.list('ws-eng')).items.find((r) => r.id === task.key)!.includes).toMatchObject({ files: 2, comments: 1 })
    clock = new Date(clock.getTime() + 366 * DAY)
    await api.archive.deleteForGood('task', task.key)
    const ids = (await db.read()).attachments.map((a) => a.id)
    expect(ids).not.toContain('f-task')
    expect(ids).not.toContain('f-comment')
    expect(ids).toContain(shared.attachmentId)
    expect(await db.getFile('f-task')).toBeNull()
    expect(await db.getFile('f-comment')).toBeNull()
    expect(await db.getFile(shared.attachmentId)).not.toBeNull()
  })

  it('never a project or task with time logged on it, never a channel, never something not archived', async () => {
    clock = new Date(clock.getTime() + 400 * DAY)
    await api.projects.archive('p-mob')
    await api.tasks.archive('NEX-101')
    await api.chat.archiveChannel('c-release')
    clock = new Date(clock.getTime() + 400 * DAY)
    expect(await detail(api.archive.deleteForGood('project', 'p-mob'))).toBe('It has time logged on it, so it’s kept: its hours and cost stay in reports.')
    expect(await detail(api.archive.deleteForGood('task', 'NEX-101'))).toBe('It has time logged on it, so it’s kept: its hours and cost stay in reports.')
    expect(await detail(api.archive.deleteForGood('channel', 'c-release'))).toBe('Channels are restored, not deleted for good.')
    expect(await detail(api.archive.deleteForGood('task', 'NEX-102'))).toBe('Only archived records can be deleted for good.')
    expect(await detail(api.archive.deleteForGood('project', 'p-gone'))).toBe("Project p-gone doesn't exist.")
  })

  it('a project with no time goes with its tasks, phases, deliverables and files; its channel stays, archived', async () => {
    const project = await api.projects.create({
      workspaceId: 'ws-eng', name: 'Pilot', key: 'PIL', clientName: '', description: '', links: [], managerId: 'u-2', memberIds: [], teamIds: [],
      methodology: 'waterfall', startDate: '2026-11-01T00:00:00.000Z', dueDate: '2026-12-01T00:00:00.000Z',
    })
    await api.tasks.create({ projectId: project.id, title: 'Kick-off', descriptionBody: [], status: '', priority: 'low', storyPoints: null, assigneeId: null, sprintId: null })
    await api.deliverables.create({ projectId: project.id, title: 'Plan', phaseId: null, dueDate: '2026-11-10T00:00:00.000Z' })
    await api.files.upload(project.id, Object.assign(new Blob(['%PDF-1.4 x'], { type: 'application/pdf' }), { name: 'plan.pdf' }))
    await api.projects.archive(project.id, 'Pilot cancelled')
    const row = (await api.archive.list('ws-eng')).items.find((r) => r.id === project.id)!
    expect(row.includes).toEqual({ tasks: 1, files: 1, comments: 0, phases: 5, deliverables: 1 })
    clock = new Date(clock.getTime() + 366 * DAY)
    await api.archive.deleteForGood('project', project.id)
    const data = await db.read()
    expect(data.projects.some((p) => p.id === project.id)).toBe(false)
    expect(data.tickets.some((t) => t.projectId === project.id)).toBe(false)
    expect(data.phases.some((p) => p.projectId === project.id)).toBe(false)
    expect(data.deliverables.some((d) => d.projectId === project.id)).toBe(false)
    expect(data.projectFiles.some((f) => f.projectId === project.id)).toBe(false)
    expect(data.attachments.some((a) => a.name === 'plan.pdf')).toBe(false)
    expect(data.channels.find((c) => c.id === project.channelId)).toMatchObject({ archivedAt: expect.any(String) })
    expect(await lastEntry()).toMatchObject({ action: 'deleted', record: { type: 'project', name: 'Pilot' }, detail: 'Deleted for good · 1 task · 1 file' })
    // Its channel now shows on its own, restore only.
    expect((await api.archive.list('ws-eng')).items.map((r) => [r.type, r.keptBecause])).toEqual([['channel', 'channel']])
    // Its key stays retired: the log and old links still name PIL-1.
    const again = { workspaceId: 'ws-eng', name: 'Pilot 2', key: 'PIL', clientName: '', description: '', links: [], managerId: 'u-2', memberIds: [], teamIds: [], methodology: 'waterfall' as const, startDate: '2027-11-01T00:00:00.000Z', dueDate: '2027-12-01T00:00:00.000Z' }
    expect(await detail(api.projects.create(again))).toBe('Key PIL belonged to a project deleted for good, so it can’t be used again.')
  })
})
