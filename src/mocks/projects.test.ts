import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api, NewProject } from '@/api/types'
import type { RealtimeEvent } from '@/lib/realtime'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'
import { CHANNEL_NAME } from '@/lib/channelForm'
import { projectPeopleIds } from '@/lib/projectPeople'

let db: MockDb
let api: Api
let hub: MockHub
const now = new Date('2026-10-26T12:00:00Z')

beforeEach(() => {
  latency.min = latency.max = 0
  hub = createMockHub(`test-projects-${Math.random()}`, null)
  db = createDb(createMemoryStore(), seed, () => now)
  api = createMockApi(db, hub, () => now)
})
afterEach(() => hub.close())

const newProject = (over: Partial<NewProject> = {}): NewProject => ({
  workspaceId: 'ws-eng', name: 'Sela kiosk', key: 'ABC', clientName: 'Sela', description: 'Self-service kiosk for 3 branches.',
  links: [], managerId: 'u-4', memberIds: ['u-8'], teamIds: ['t-qa'], methodology: 'waterfall',
  startDate: '2026-11-01T00:00:00.000Z', dueDate: '2026-12-31T00:00:00.000Z', ...over,
})

describe('projects', () => {
  it('sales creates a waterfall project with 5 phases, its own chat channel and numbering from 101', async () => {
    await api.users.viewAs('u-9') // Sales
    const created = await api.projects.create(newProject())
    expect(created).toMatchObject({ key: 'ABC', status: 'planned', managerId: 'u-4' })
    const phases = await api.phases.list(created.id)
    expect(phases.map((p) => p.name)).toEqual(['Analysis', 'Design', 'Build', 'QA', 'Delivery'])
    expect(phases[0].startDate).toBe(created.startDate)
    expect(phases.at(-1)!.dueDate).toBe(created.dueDate)
    const channel = await api.chat.channel(created.channelId)
    expect(channel.memberIds.sort()).toEqual(['u-4', 'u-5', 'u-8'].sort()) // manager, member and QA team; not Sales, who only created it
    const data = await db.read()
    expect(data.counters[created.id]).toBe(101)
  })

  it('rejects a duplicate or malformed key and a due date before the start', async () => {
    await expect(api.projects.create(newProject({ key: 'NEX' }))).rejects.toMatchObject({ status: 400, detail: 'Key NEX is already used.' })
    await expect(api.projects.create(newProject({ key: 'a1' }))).rejects.toMatchObject({ status: 400 })
    await expect(api.projects.create(newProject({ dueDate: '2026-10-01T00:00:00.000Z' }))).rejects.toMatchObject({ status: 400, detail: 'The due date is before the start date.' })
  })

  it('a key used in another workspace is refused', async () => {
    await expect(api.projects.create(newProject({ workspaceId: 'ws-design', key: 'NEX' }))).rejects.toMatchObject({ status: 400, detail: 'Key NEX is already used.' })
  })

  it('member cannot create or edit', async () => {
    await api.users.viewAs('u-8') // Member
    const before = await db.read()
    await expect(api.projects.create(newProject())).rejects.toMatchObject({ status: 403, detail: "You don't have access to this project." })
    await expect(api.projects.update('p-mob', { name: 'Hacked' })).rejects.toMatchObject({ status: 403 })
    const after = await db.read()
    expect(after.projects).toEqual(before.projects)
  })

  it('a PM edits a project they manage, not another', async () => {
    await api.users.viewAs('u-4') // manages MOB
    expect((await api.projects.update('p-mob', { clientName: 'Spark Systems' })).clientName).toBe('Spark Systems')
    await expect(api.projects.update('p-nex', { name: 'Nope' })).rejects.toMatchObject({ status: 403 })
  })

  it('get returns the summary by key, 404 for an unknown key; cost only for admins', async () => {
    const nex = await api.projects.get('ws-eng', 'NEX')
    expect(nex).toMatchObject({ key: 'NEX', taskCount: 10 })
    expect(typeof nex.cost).toBe('number')
    await expect(api.projects.get('ws-eng', 'ZZZ')).rejects.toMatchObject({ status: 404 })
    await api.users.viewAs('u-9')
    expect((await api.projects.get('ws-eng', 'NEX')).cost).toBeNull()
    expect((await api.projects.list('ws-eng')).map((p) => p.key)).toEqual(['NEX', 'MOB', 'ELM', 'SEL'])
  })

  it('MOB summary is overdue', async () => {
    const mob = await api.projects.get('ws-eng', 'MOB')
    expect(mob.overdueCount).toBeGreaterThanOrEqual(2)
    expect(mob.currentPhaseId).toBe('ph-mob-build')
  })
})

describe('phases and deliverables', () => {
  it('a PM adds, renames, reorders and removes phases; removing moves its tasks to no phase', async () => {
    await api.users.viewAs('u-4')
    const qa = await api.phases.create({ projectId: 'p-mob', name: 'Store review', startDate: '2026-10-27T00:00:00.000Z', dueDate: '2026-10-29T00:00:00.000Z' })
    expect(qa).toMatchObject({ order: 6, status: 'notStarted' })
    expect((await api.phases.update(qa.id, { name: 'App store review' })).name).toBe('App store review')
    const ids = (await api.phases.list('p-mob')).map((p) => p.id)
    const reordered = await api.phases.reorder('p-mob', [qa.id, ...ids.filter((id) => id !== qa.id)])
    expect(reordered[0].id).toBe(qa.id)
    expect(reordered.map((p) => p.order)).toEqual([1, 2, 3, 4, 5, 6])
    await api.phases.remove('ph-mob-build')
    const tasks = await api.tickets.list('p-mob')
    expect(tasks.filter((t) => t.phaseId === 'ph-mob-build')).toEqual([])
    expect(tasks.find((t) => t.key === 'MOB-104')?.phaseId).toBeNull()
  })

  it('rejects an empty phase name, a reorder with the wrong ids, and phase edits by a non-manager', async () => {
    await api.users.viewAs('u-4')
    await expect(api.phases.create({ projectId: 'p-mob', name: ' ', startDate: '2026-10-27T00:00:00.000Z', dueDate: '2026-10-29T00:00:00.000Z' })).rejects.toMatchObject({ status: 400 })
    await expect(api.phases.reorder('p-mob', ['ph-mob-build'])).rejects.toMatchObject({ status: 400 })
    await expect(api.phases.update('ph-nex-build', { name: 'X' })).rejects.toMatchObject({ status: 403 })
  })

  it('deliverables: list, add, mark done', async () => {
    const created = await api.deliverables.create({ projectId: 'p-nex', phaseId: 'ph-nex-build', title: 'Audit log on staging', dueDate: '2026-11-05T00:00:00.000Z' })
    expect((await api.deliverables.list('p-nex')).map((d) => d.id)).toContain(created.id)
    const done = await api.deliverables.update(created.id, { doneAt: now.toISOString() })
    expect(done.doneAt).toBe(now.toISOString())
  })
})

describe('teams', () => {
  it('lists a workspace’s teams', async () => {
    expect((await api.teams.list('ws-eng')).map((t) => t.name)).toEqual(['Frontend', 'Backend', 'Mobile', 'QA'])
    await expect(api.teams.list('ws-nope')).rejects.toMatchObject({ status: 404 })
  })

  it('sales edits dates and client but not people; the manager can', async () => {
    await api.users.viewAs('u-9') // Sales
    await expect(api.projects.update('p-mob', { managerId: 'u-2' })).rejects.toMatchObject({ status: 403 })
    await expect(api.projects.update('p-mob', { memberIds: ['u-4'] })).rejects.toMatchObject({ status: 403 })
    await expect(api.projects.update('p-mob', { clientName: 'Spark' })).resolves.toMatchObject({ clientName: 'Spark' })
    await expect(api.projects.update('p-mob', { managerId: 'u-4', status: 'onHold' })).resolves.toMatchObject({ status: 'onHold' }) // unchanged people pass
    await api.users.viewAs('u-4') // MOB's manager
    await expect(api.projects.update('p-mob', { memberIds: ['u-4', 'u-8'] })).resolves.toMatchObject({ memberIds: ['u-4', 'u-8'] })
  })
})

describe('board columns', () => {
  const columns = [
    { id: 'backlog', label: 'Backlog', category: 'todo' as const },
    { id: 'todo', label: 'To do', category: 'todo' as const },
    { id: 'inProgress', label: 'In progress', category: 'inProgress' as const },
    { id: 'done', label: 'Done', category: 'done' as const },
    { id: 'inReview', label: ' Testing ', category: 'inProgress' as const },
  ]

  it('setBoard saves names, order and types for the manager', async () => {
    await api.users.viewAs('u-2') // Nour manages Nexus Core
    const project = await api.projects.setBoard('p-nex', columns)
    expect(project.board).toEqual([...columns.slice(0, 4), { id: 'inReview', label: 'Testing', category: 'inProgress' }])
    expect((await api.projects.get('ws-eng', 'NEX')).board?.[4]?.label).toBe('Testing')
  })

  it('sales and a member are refused', async () => {
    await api.users.viewAs('u-9') // Karim, sales
    await expect(api.projects.setBoard('p-nex', columns)).rejects.toMatchObject({ status: 403 })
    await api.users.viewAs('u-3')
    await expect(api.projects.setBoard('p-nex', columns)).rejects.toMatchObject({ status: 403 })
  })

  it('bad columns are refused; setBoard neither adds nor drops columns', async () => {
    await expect(api.projects.setBoard('p-nex', columns.slice(0, 4))).rejects.toMatchObject({ status: 400, detail: 'That column no longer exists.' })
    await expect(api.projects.setBoard('p-nex', columns.map((c) => ({ ...c, label: 'Same' })))).rejects.toMatchObject({ status: 400, detail: "Two columns can't share a name." })
    await expect(api.projects.setBoard('p-nex', columns.map((c) => ({ ...c, category: 'todo' as const })))).rejects.toMatchObject({ status: 400, detail: 'Each type needs at least one column.' })
  })
})

describe('adding and deleting columns', () => {
  const events: RealtimeEvent[] = []
  beforeEach(() => {
    events.length = 0
    hub.subscribe((e) => events.push(e))
  })
  const ids = async () => (await api.projects.get('ws-eng', 'NEX')).board!.map((c) => c.id)

  it('the manager adds a column after another, typed', async () => {
    await api.users.viewAs('u-2')
    const project = await api.projects.addColumn('p-nex', { label: ' QA ', category: 'inProgress', after: 'inProgress' })
    const added = project.board!.find((c) => c.label === 'QA')!
    expect(added).toMatchObject({ category: 'inProgress' })
    expect(added.id).toMatch(/^col-/)
    expect(await ids()).toEqual(['backlog', 'todo', 'inProgress', added.id, 'inReview', 'done'])
    expect(events).toContainEqual({ type: 'projectChanged', projectId: 'p-nex' })
  })

  it('delete moves its tasks to the chosen column in one write', async () => {
    await api.users.viewAs('u-2')
    const before = (await db.read()).tickets.filter((t) => t.projectId === 'p-nex' && t.status === 'inReview').map((t) => t.key)
    expect(before.length).toBeGreaterThan(0)
    const lastDone = Math.max(...(await db.read()).tickets.filter((t) => t.projectId === 'p-nex' && t.status === 'done').map((t) => t.rank))
    await api.projects.deleteColumn('p-nex', 'inReview', 'done')
    const data = await db.read()
    expect(await ids()).not.toContain('inReview')
    for (const key of before) {
      const t = data.tickets.find((x) => x.key === key)!
      expect(t.status).toBe('done')
      expect(t.rank).toBeGreaterThan(lastDone)
    }
    expect(events.filter((e) => e.type === 'ticketUpdated')).toHaveLength(before.length)
    expect(events).toContainEqual({ type: 'projectChanged', projectId: 'p-nex' })
  })

  it('deleting a column that holds an archived task still works, and moves it too', async () => {
    await api.users.viewAs('u-2')
    const key = (await db.read()).tickets.find((t) => t.projectId === 'p-nex' && t.status === 'inReview')!.key
    await api.tasks.archive(key)
    await api.projects.deleteColumn('p-nex', 'inReview', 'done')
    expect((await db.read()).tickets.find((t) => t.key === key)!.status).toBe('done')
  })

  it("the last column of a type can't be deleted", async () => {
    await expect(api.projects.deleteColumn('p-nex', 'done', 'todo')).rejects.toMatchObject({ status: 400, detail: 'Each type needs at least one column.' })
  })

  it('more than 10 columns is refused', async () => {
    for (let i = 0; i < 5; i++) await api.projects.addColumn('p-nex', { label: `Extra ${i}`, category: 'inProgress' })
    await expect(api.projects.addColumn('p-nex', { label: 'One too many', category: 'todo' })).rejects.toMatchObject({ status: 400, detail: 'A board can have up to 10 columns.' })
  })

  it('moveTo must be another column of the board', async () => {
    await expect(api.projects.deleteColumn('p-nex', 'inReview', 'inReview')).rejects.toMatchObject({ status: 400, detail: 'That column no longer exists.' })
    await expect(api.projects.deleteColumn('p-nex', 'inReview', 'nope')).rejects.toMatchObject({ status: 400, detail: 'That column no longer exists.' })
    await expect(api.projects.deleteColumn('p-nex', 'nope', 'done')).rejects.toMatchObject({ status: 400, detail: 'That column no longer exists.' })
  })

  it('sales and members are refused', async () => {
    await api.users.viewAs('u-9')
    await expect(api.projects.addColumn('p-nex', { label: 'QA', category: 'inProgress' })).rejects.toMatchObject({ status: 403 })
    await api.users.viewAs('u-3')
    await expect(api.projects.deleteColumn('p-nex', 'inReview', 'done')).rejects.toMatchObject({ status: 403 })
  })

  it('phase, deliverable and project writes publish projectChanged', async () => {
    await api.users.viewAs('u-2')
    const phase = (await api.phases.list('p-nex'))[0]!
    await api.phases.update(phase.id, { name: 'Build it' })
    const project = await api.projects.get('ws-eng', 'NEX')
    await api.projects.update(project.id, { description: 'New about' })
    expect(events.filter((e) => e.type === 'projectChanged').length).toBeGreaterThanOrEqual(2)
  })
})

describe('project, phase and deliverable writes are checked', () => {
  const unknown = { status: 400, detail: "Some of these fields can't be changed." }
  it('projects.update takes only its fields and valid values', async () => {
    for (const patch of [{ key: 'ZZ' }, { channelId: 'c-x' }]) await expect(api.projects.update('p-nex', patch as never)).rejects.toMatchObject(unknown)
    const refused = async (patch: object, detail: string) => await expect(api.projects.update('p-nex', patch as never)).rejects.toMatchObject({ status: 400, detail })
    await refused({ status: 'gone' }, "That isn't a project status.")
    await refused({ managerId: 'nobody' }, 'Pick a project manager.')
    await refused({ memberIds: ['nobody'] }, "Someone on this list doesn't exist.")
    await refused({ teamIds: ['t-none'] }, "That team doesn't exist.")
  })
  it('phases.update takes only its fields and a valid status', async () => {
    const phase = (await db.read()).phases.find((p) => p.projectId === 'p-nex')!
    await expect(api.phases.update(phase.id, { projectId: 'p-x' } as never)).rejects.toMatchObject(unknown)
    await expect(api.phases.update(phase.id, { status: 'x' } as never)).rejects.toMatchObject({ status: 400, detail: "That isn't a phase status." })
  })
  it('deliverables.update takes only its fields and stays in its project', async () => {
    await expect(api.deliverables.update('d-nex-1', { projectId: 'p-mob' } as never)).rejects.toMatchObject(unknown)
    await expect(api.deliverables.update('d-nex-1', { phaseId: 'ph-mob-analysis' })).rejects.toMatchObject({ status: 400, detail: 'That phase belongs to another project.' })
    await expect(api.deliverables.update('d-nex-1', { doneAt: 'x' })).rejects.toMatchObject({ status: 400, detail: 'Pick a done date.' })
  })
})

describe('the project channel follows the project', () => {
  const channelOf = async (projectId: string) => {
    const data = await db.read()
    return data.channels.find((c) => c.id === data.projects.find((p) => p.id === projectId)!.channelId)!
  }
  it("an edit that doesn't rename the project leaves its channel's name alone", async () => {
    await api.projects.update('p-elm', { clientName: 'El Moasser Group' })
    expect((await channelOf('p-elm')).name).toBe('el-moasser')
  })
  it('renaming the project renames its channel', async () => {
    await api.projects.update('p-nex', { name: 'Nexus Two' })
    expect((await channelOf('p-nex')).name).toBe('nexus-two')
  })
  it('a name taken by another channel gets a number', async () => {
    await api.projects.update('p-nex', { name: 'General' })
    expect((await channelOf('p-nex')).name).toBe('general-2')
    await api.projects.update('p-nex', { name: 'A very long project name that goes on and on past forty letters' })
    expect((await channelOf('p-nex')).name).toMatch(CHANNEL_NAME)
    const a = await api.projects.create(newProject({ name: 'Sela', key: 'AAA' }))
    const b = await api.projects.create(newProject({ name: 'Sela', key: 'BBB' }))
    const [ca, cb] = [await channelOf(a.id), await channelOf(b.id)]
    expect(ca.name).toMatch(/^sela/)
    expect(cb.name).toMatch(/^sela/)
    expect(ca.name).not.toBe(cb.name)
  })
  it('people added or removed are the channel members', async () => {
    await api.projects.update('p-nex', { memberIds: ['u-2', 'u-3', 'u-6', 'u-8'] }) // Tarek in, Salma (a member, on no NEX team) out
    const data = await db.read()
    const people = projectPeopleIds(data.projects.find((p) => p.id === 'p-nex')!, data.users)
    expect(new Set((await channelOf('p-nex')).memberIds)).toEqual(people)
    expect(people.has('u-8')).toBe(true)
    expect(people.has('u-5')).toBe(false)
  })
  it('Sales renames a project and its channel follows', async () => {
    await api.users.viewAs('u-9')
    await api.projects.update('p-nex', { name: 'Nexus Sales' })
    expect((await channelOf('p-nex')).name).toBe('nexus-sales')
  })
  it("a new project's channel holds its people only", async () => {
    const created = await api.projects.create(newProject({ key: 'XYZ' })) // as Youssef (admin), who isn't on it
    expect((await channelOf(created.id)).memberIds).not.toContain('u-1')
  })
  it('a project change publishes channelChanged for its channel', async () => {
    const events: RealtimeEvent[] = []
    hub.subscribe((e) => events.push(e))
    await api.projects.update('p-nex', { name: 'Nexus Three' })
    expect(events).toContainEqual({ type: 'channelChanged', channelId: 'c-p-nex' })
  })
})

describe('removing deliverables', () => {
  it('removing a deliverable takes it off the list and writes history', async () => {
    await api.deliverables.remove('d-nex-1')
    expect((await api.deliverables.list('p-nex')).some((d) => d.id === 'd-nex-1')).toBe(false)
    expect((await db.read()).activity.at(-1)).toMatchObject({ kind: 'deliverable.removed', projectId: 'p-nex' })
  })
  it("a member can't remove one", async () => {
    await api.users.viewAs('u-3')
    await expect(api.deliverables.remove('d-nex-1')).rejects.toMatchObject({ status: 403 })
  })
})

describe('project write refusals', () => {
  it('a name that isn\'t text, bad links, and an unknown deliverable phase are 400s with a sentence', async () => {
    await expect(api.projects.update('p-nex', { name: 7 as never })).rejects.toMatchObject({ status: 400, detail: 'Name must be text.' })
    await expect(api.projects.update('p-nex', { links: [{ label: 'x' }] as never })).rejects.toMatchObject({ status: 400, detail: 'Each link needs a label and an address.' })
    await expect(api.deliverables.update('d-nex-1', { phaseId: 'ph-gone' })).rejects.toMatchObject({ status: 400, detail: 'That phase no longer exists.' })
  })
  it('a project name with no Latin letters gets its key as the channel name', async () => {
    const created = await api.projects.create(newProject({ name: 'مشروع البوابة', key: 'ARB' }))
    const data = await db.read()
    expect(data.channels.find((c) => c.id === created.channelId)!.name).toBe('arb')
  })
})

