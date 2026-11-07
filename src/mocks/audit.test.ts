import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api, AuditAction, AuditGroup, UploadFile } from '@/api/types'
import { verifyChain } from '@/lib/auditChain'
import { columnsOf } from '@/lib/boardColumns'
import { audit, changesBetween, deviceOf, humanize, setRequestInfo, shown } from './audit'
import { createDb, type DbData, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

// What the audit log records (Admin and help, slice 2): every write of the five kinds, in the same transaction as the
// change, and every refusal. Each method of the Api is listed below as recorded (with a call that must log) or not
// recorded (with why), so a new method fails this file until someone decides.

let db: MockDb
let api: Api
let hub: MockHub
const clock = new Date('2026-10-31T12:00:00Z')

beforeEach(() => {
  latency.min = latency.max = 0
  setRequestInfo(() => ({ ip: '10.1.2.3', device: 'Chrome 130 · macOS' }))
  hub = createMockHub(`test-audit-${Math.random()}`, null)
  db = createDb(createMemoryStore(), seed, () => clock)
  api = createMockApi(db, hub, () => clock)
})
afterEach(() => hub.close())

const pdf = (name = 'x.pdf'): UploadFile => Object.assign(new Blob(['%PDF-1.4 x'], { type: 'application/pdf' }), { name })
const log = async () => (await db.read()).audit
const newProject = { workspaceId: 'ws-eng', name: 'Audit trail', key: 'AUD', clientName: 'Spark', description: '', links: [], managerId: 'u-2', memberIds: ['u-3'], teamIds: [], methodology: 'agile' as const, startDate: '2026-11-01T00:00:00.000Z', dueDate: '2026-12-01T00:00:00.000Z' }
const newTask = { projectId: 'p-nex', title: 'Audit me', description: '', status: '', priority: 'medium' as const, storyPoints: null, assigneeId: null, sprintId: null }
const manual = { projectId: 'p-nex', startedAt: '2026-10-30T07:00:00.000Z', endedAt: '2026-10-30T08:30:00.000Z', note: 'Review' }

type Expected = { action: AuditAction; group: AuditGroup; type: string }
/** A recorded method: `setup` makes what it needs (not measured), `run` calls it, and one entry it adds must match. */
type Recorded = Expected & { setup?: (api: Api) => Promise<unknown>; run: (api: Api, made: never) => Promise<unknown> }

const r = <T,>(expected: Expected, run: (api: Api, made: T) => Promise<unknown>, setup?: (api: Api) => Promise<T>): Recorded => ({ ...expected, run: run as Recorded['run'], setup })
const data = (action: AuditAction, type: string) => ({ action, group: 'data' as const, type })
const status = (action: AuditAction, type: string) => ({ action, group: 'status' as const, type })
const settings = (action: AuditAction, type: string) => ({ action, group: 'settings' as const, type })
const exports = (action: AuditAction, type: string) => ({ action, group: 'exports' as const, type })

const RECORDED: Record<string, Recorded> = {
  'users.viewAs': r({ action: 'signedIn', group: 'access', type: 'user' }, (a) => a.users.viewAs('u-2')),
  'users.create': r(settings('created', 'user'), (a) => a.users.create({ name: 'Laila Hamdy', email: 'laila@spark-sys.com', title: '', roleIds: ['member'], teamIds: [] })),
  'users.update': r(settings('changed', 'user'), (a) => a.users.update('u-3', { title: 'Lead' })),
  'users.deactivate': r(settings('deactivated', 'user'), (a) => a.users.deactivate('u-3', 'Left')),
  'users.reactivate': r(settings('reactivated', 'user'), (a) => a.users.reactivate('u-3'), (a) => a.users.deactivate('u-3', '')),
  'chat.createChannel': r(data('created', 'channel'), (a) => a.chat.createChannel({ workspaceId: 'ws-eng', name: 'audit-ops', topic: 'Ops', isPrivate: false, memberIds: ['u-2'] })),
  'chat.updateChannel': r(data('changed', 'channel'), (a) => a.chat.updateChannel('c-backend', { topic: 'APIs and jobs' })),
  'chat.addMembers': r(data('changed', 'channel'), (a) => a.chat.addMembers('c-backend', ['u-9'], ['guest@example.com'])),
  'chat.revokeInvitation': r(
    data('changed', 'channel'),
    async (a, invitationId: string) => a.chat.revokeInvitation(invitationId),
    async (a) => (await a.chat.addMembers('c-backend', [], ['guest@example.com']), (await a.chat.invitations('c-backend'))[0]!.id),
  ),
  'chat.removeMember': r(data('changed', 'channel'), async (a) => {
    const members = (await a.chat.channel('c-backend')).memberIds
    return a.chat.removeMember('c-backend', members.find((id) => id !== 'u-1')!)
  }),
  'chat.archiveChannel': r(status('archived', 'channel'), (a) => a.chat.archiveChannel('c-backend')),
  'chat.restoreChannel': r(status('restored', 'channel'), (a) => a.chat.restoreChannel('c-backend'), (a) => a.chat.archiveChannel('c-backend')),
  // Someone else's message (m-b01 is Nour's): an admin action, spec §11.
  'chat.remove': r(data('deleted', 'message'), (a) => a.chat.remove({ kind: 'message', id: 'm-b01' })),
  'chat.restore': r(data('restored', 'message'), (a) => a.chat.restore({ kind: 'message', id: 'm-b01' }), (a) => a.chat.remove({ kind: 'message', id: 'm-b01' })),
  'projects.archive': r(status('archived', 'project'), (a) => a.projects.archive('p-nex')),
  'projects.restore': r(status('restored', 'project'), (a) => a.projects.restore('p-nex'), (a) => a.projects.archive('p-nex')),
  'projects.create': r(data('created', 'project'), (a) => a.projects.create(newProject)),
  'projects.update': r(data('changed', 'project'), (a) => a.projects.update('p-nex', { dueDate: '2026-12-12T00:00:00.000Z' })),
  'projects.addColumn': r(data('changed', 'project'), (a) => a.projects.addColumn('p-nex', { label: 'QA', category: 'inProgress' })),
  'projects.deleteColumn': r(data('changed', 'project'), (a) => a.projects.deleteColumn('p-nex', 'inReview', 'done')),
  'projects.setBoard': r(data('changed', 'project'), async (a) => {
    const board = columnsOf((await a.projects.get('ws-eng', 'NEX')))
    return a.projects.setBoard('p-nex', [board[1]!, board[0]!, ...board.slice(2)])
  }),
  'phases.create': r(data('created', 'phase'), (a) => a.phases.create({ projectId: 'p-nex', name: 'Hardening', startDate: '2026-11-01T00:00:00.000Z', dueDate: '2026-11-10T00:00:00.000Z' })),
  'phases.update': r(data('changed', 'phase'), (a) => a.phases.update('ph-nex-qa', { name: 'Testing' })),
  'phases.remove': r(data('deleted', 'phase'), (a) => a.phases.remove('ph-nex-qa')),
  'phases.reorder': r(data('changed', 'project'), async (a) => {
    const ids = (await a.phases.list('p-nex')).map((p) => p.id)
    return a.phases.reorder('p-nex', [...ids].reverse())
  }),
  'deliverables.create': r(data('created', 'deliverable'), (a) => a.deliverables.create({ projectId: 'p-nex', title: 'API docs', phaseId: null, dueDate: '2026-11-12T00:00:00.000Z' })),
  'deliverables.update': r(data('changed', 'deliverable'), (a) => a.deliverables.update('d-nex-1', { title: 'Token rotation on staging' })),
  'deliverables.remove': r(data('deleted', 'deliverable'), (a) => a.deliverables.remove('d-nex-1')),
  'tasks.archive': r(status('archived', 'task'), (a) => a.tasks.archive('NEX-102')),
  'tasks.restore': r(status('restored', 'task'), (a) => a.tasks.restore('NEX-102'), (a) => a.tasks.archive('NEX-102')),
  'tasks.create': r(data('created', 'task'), (a) => a.tasks.create(newTask)),
  'tasks.update': r(data('changed', 'task'), (a) => a.tasks.update('NEX-102', { priority: 'urgent' })),
  'tasks.moveTo': r(status('changed', 'task'), (a) => a.tasks.moveTo('NEX-102', 'inProgress', 0)),
  'time.addManual': r(data('created', 'timeEntry'), (a) => a.time.addManual(manual)),
  'time.update': r(data('changed', 'timeEntry'), (a, id: string) => a.time.update(id, { note: 'Code review' }), async (a) => (await a.time.addManual(manual)).id),
  'time.remove': r(data('deleted', 'timeEntry'), (a, id: string) => a.time.remove(id), async (a) => (await a.time.addManual(manual)).id),
  'rates.update': r(data('changed', 'rate'), (a) => a.rates.update('u-3', 777)),
  'roles.create': r(settings('created', 'role'), (a) => a.roles.create({ name: 'QA lead', copyFrom: 'member' })),
  'roles.rename': r(settings('changed', 'role'), (a, id: string) => a.roles.rename(id, 'QA'), async (a) => (await a.roles.create({ name: 'QA lead' })).id),
  'roles.remove': r(settings('deleted', 'role'), (a, id: string) => a.roles.remove(id), async (a) => (await a.roles.create({ name: 'QA lead' })).id),
  'roles.saveGrants': r(settings('changed', 'role'), (a) => a.roles.saveGrants([{ roleId: 'member', add: ['projects.create'], remove: [] }])),
  'files.upload': r(data('created', 'file'), (a) => a.files.upload('p-nex', pdf())),
  'files.removeFromProject': r(data('deleted', 'file'), (a) => a.files.removeFromProject('p-mob', 'a-mob-scope')),
  'files.update': r(data('changed', 'file'), (a) => a.files.update('a-mob-scope', { title: 'Scope v2.4.pdf' })),
  'files.delete': r(data('deleted', 'file'), (a) => a.files.delete('a-mob-checklist')),
  'audit.export': r(exports('exported', 'auditLog'), (a) => a.audit.export({})),
  'audit.noteDownload': r(exports('downloaded', 'file'), (a) => a.audit.noteDownload('a-mob-scope')),
  'audit.noteExport': r(exports('exported', 'report'), (a) => a.audit.noteExport('timeCost', 'Last 7 days · by project')),
  'db.export': r(exports('exported', 'data'), (a) => a.db.export()),
  'db.import': r(settings('imported', 'data'), (a, bundle: unknown) => a.db.import(bundle), (a) => a.db.export()),
  'db.reset': r(settings('reset', 'data'), (a) => a.db.reset()),
  'archive.setRetention': r(settings('changed', 'settings'), (a) => a.archive.setRetention(90)),
  'attendance.setWorkHours': r(settings('changed', 'settings'), (a) => a.attendance.setWorkHours({ days: [0, 1, 2, 3], start: '08:00', end: '16:00' })),
  'attendance.setTimer': r(settings('changed', 'settings'), (a) => a.attendance.setTimer({ timeoutHours: 2 })),
  'archive.deleteForGood': r(
    status('deleted', 'task'),
    (a, key: string) => a.archive.deleteForGood('task', key),
    async (a) => {
      const t = await a.tasks.create({ projectId: 'p-nex', title: 'Old spike', descriptionBody: [], status: '', priority: 'low', storyPoints: null, assigneeId: null, sprintId: null })
      await a.tasks.archive(t.key)
      // Archived two years ago: past the year it's kept.
      await db.update((d) => {
        d.tickets.find((x) => x.key === t.key)!.archivedAt = '2024-10-31T12:00:00.000Z'
      })
      return t.key
    },
  ),
}

const READ = 'a read'
const MESSAGE = 'messages, replies and what they carry are not in the log (spec §11: only deleting someone else’s)'
const MINE = 'my own choice or state (preferences, reads, saved items, drafts, order): not in the log'
const NOT_RECORDED: Record<string, string> = {
  'workspaces.list': READ,
  'users.me': READ,
  'users.list': READ,
  'users.directory': READ,
  'archive.list': READ,
  'attendance.scope': READ,
  'attendance.days': READ,
  'attendance.day': READ,
  'attendance.visits': READ,
  'attendance.report': READ,
  'attendance.workHours': READ,
  'attendance.timer': READ,
  'attendance.ping': 'app use, about once a minute: Attendance is its record, and it would bury the log',
  'chat.openDm': 'a conversation is made by its first message, and messages aren’t in the log',
  'chat.join': `${MINE}; joining a public channel gives no access the workspace didn’t have`,
  'chat.leave': MINE,
  'chat.invitations': READ,
  'chat.react': MESSAGE,
  'chat.edit': `${MESSAGE}; only the author edits`,
  'chat.send': MESSAGE,
  'chat.reply': MESSAGE,
  'chat.setFollowing': MINE,
  'chat.setThreadMuted': MINE,
  'auth.signIn': 'recorded inside, as signedIn or signInFailed (auth.test.ts checks both)',
  'auth.signOut': 'recorded inside, as signedOut (auth.test.ts)',
  'auth.demoPeople': READ,
  'chat.channels': READ,
  'chat.channel': READ,
  'chat.messages': READ,
  'chat.messagesBefore': READ,
  'chat.messagesAfter': READ,
  'chat.drafts': READ,
  'chat.sent': READ,
  'chat.saveDraft': MINE,
  'chat.linkPreview': READ,
  'chat.jumpTarget': READ,
  'chat.message': READ,
  'chat.replies': READ,
  'chat.markRead': MINE,
  'chat.markUnread': MINE,
  'chat.setStarred': MINE,
  'chat.setMuted': MINE,
  'chat.setNotifyLevel': MINE,
  'tickets.sprints': READ,
  'tickets.list': READ,
  'tickets.get': READ,
  'tickets.resolve': READ,
  'projects.list': READ,
  'projects.get': READ,
  'phases.list': READ,
  'deliverables.list': READ,
  'teams.list': READ,
  'time.list': READ,
  'time.report': READ,
  'time.today': READ,
  'time.start': 'a person’s own running clock; a manual entry, an edit or a delete is recorded',
  'time.stop': 'as start',
  'time.pause': 'as start',
  'time.resume': 'as start',
  'rates.list': READ,
  'comments.list': READ,
  'comments.create': `${MESSAGE}; a comment is a message on a task`,
  'comments.update': `${MESSAGE}; only the author edits`,
  'comments.remove': `${MESSAGE}; only the author deletes`,
  'activity.forTask': READ,
  'activity.forProject': READ,
  'mentions.mine': READ,
  'mentions.markRead': MINE,
  'inbox.list': READ,
  'inbox.markRead': MINE,
  'saved.list': READ,
  'saved.save': MINE,
  'saved.update': MINE,
  'saved.note': MINE,
  'saved.remove': MINE,
  'scheduled.list': READ,
  'scheduled.create': `${MESSAGE}; a scheduled message is a message`,
  'scheduled.update': MESSAGE,
  'scheduled.remove': MESSAGE,
  'scheduled.sendNow': MESSAGE,
  'pins.list': READ,
  'pins.pin': `${MESSAGE}; a pin marks a message`,
  'pins.unpin': MESSAGE,
  'threads.list': READ,
  'threads.markRead': MINE,
  'search.run': READ,
  'sidebar.order': READ,
  'sidebar.setOrder': MINE,
  'preferences.get': READ,
  'preferences.update': MINE,
  'roles.list': READ,
  'folders.list': READ,
  'folders.create': 'folders sort chat files, as pins mark messages',
  'bookmarks.list': READ,
  'bookmarks.add': 'a channel’s bookmarks are its content, as pins are',
  'bookmarks.update': 'as bookmarks.add',
  'bookmarks.remove': 'as bookmarks.add',
  'dashboard.projects': READ,
  'dashboard.workingNow': READ,
  'dashboard.stats': READ,
  'files.url': 'a read that previews use too; the page records a download through audit.noteDownload',
  'files.list': READ,
  'files.uploadForChat': `${MESSAGE}; a chat file goes out in a message`,
  'files.uploadForTask': `${MESSAGE}; a task's file is recorded when the task that names it is saved`,
  'files.inChannel': READ,
  'files.shareable': READ,
  'files.details': READ,
  'files.share': `${MESSAGE}; sharing posts a message`,
  'audit.list': READ,
  'audit.get': READ,
  'audit.summary': READ,
}

/** Every method of the mock Api, as "namespace.method". */
const methods = (target: Api) => Object.entries(target).flatMap(([ns, part]) => Object.keys(part as object).map((m) => `${ns}.${m}`))

describe('what the audit log records (slice 2): every method decided', () => {
  it('each method of the Api is either recorded or not recorded, with a reason, and none is both', () => {
    const all = methods(api).sort()
    const decided = [...Object.keys(RECORDED), ...Object.keys(NOT_RECORDED)].sort()
    expect(decided).toEqual(all)
    expect(Object.keys(RECORDED).filter((m) => m in NOT_RECORDED)).toEqual([])
  })

  it.each(Object.entries(RECORDED))('%s writes its entry, as an Admin, and the chain still checks out', async (_method, entry) => {
    const made = entry.setup ? await entry.setup(api) : undefined
    const before = new Set((await log()).map((e) => e.requestId))
    await entry.run(api, made as never)
    const events = await log()
    const added = events.filter((e) => !before.has(e.requestId))
    expect(added.map((e) => ({ action: e.action, group: e.group, type: e.record?.type }))).toContainEqual({ action: entry.action, group: entry.group, type: entry.type })
    expect(added.every((e) => e.result === 'done' && e.ip === '10.1.2.3' && e.device === 'Chrome 130 · macOS')).toBe(true)
    expect(verifyChain(events)).toMatchObject({ intact: true })
  })
})

describe('the entries say what changed, as people read it', () => {
  const last = async () => (await log()).at(-1)!

  it('an edit lists each field with its old and new value; names, not ids; a status change is the status group’s', async () => {
    await api.projects.update('p-nex', { dueDate: '2026-12-12T00:00:00.000Z', managerId: 'u-4', status: 'onHold' })
    const [edit, change] = (await log()).slice(-2)
    expect(edit).toMatchObject({ action: 'changed', group: 'data', record: { type: 'project', id: 'p-nex', name: 'Nexus Core' }, actorName: 'Youssef Abdelrahman', actorRoles: 'Admin' })
    expect(edit!.changes).toEqual([
      { field: 'Manager', from: 'Nour El-Sayed', to: 'Ahmed Shawky' },
      { field: 'Due date', from: expect.stringMatching(/2026$/), to: '12 Dec 2026' },
    ])
    expect(change).toMatchObject({ group: 'status', changes: [{ field: 'Status', from: 'Active', to: 'On hold' }] })
  })

  it('a task moved between columns names the columns; a move within one, or no change, records nothing', async () => {
    await api.tasks.moveTo('NEX-102', 'inProgress', 0)
    expect(await last()).toMatchObject({ group: 'status', record: { type: 'task', id: 'NEX-102', name: expect.stringMatching(/^NEX-102 · /) }, changes: [{ field: 'Status', from: 'To do', to: 'In progress' }] })
    const count = (await log()).length
    await api.tasks.moveTo('NEX-102', 'inProgress', 5)
    await api.projects.update('p-nex', {})
    expect((await log()).length).toBe(count)
  })

  it('a role’s permissions are listed one by one, in the matrix’s order, as Off → On', async () => {
    await api.roles.saveGrants([{ roleId: 'member', add: ['projects.create', 'audit.view'], remove: ['checkins.managed'] }])
    expect(await last()).toMatchObject({ group: 'settings', record: { type: 'role', id: 'member', name: 'Member' } })
    expect((await last()).changes).toEqual([
      { field: 'See timers and app use of the people on projects they manage', from: 'On', to: 'Off' },
      { field: 'Create projects', from: 'Off', to: 'On' },
      { field: 'See the audit log', from: 'Off', to: 'On' },
    ])
  })

  it('deleting someone else’s message says where and whose, never what it said; my own isn’t logged', async () => {
    await api.chat.remove({ kind: 'message', id: 'm-b01' })
    expect(await last()).toMatchObject({ action: 'deleted', record: { type: 'message', name: 'A message in #backend' }, detail: 'Written by Nour El-Sayed', changes: [] })
    const mine = await api.chat.send('c-backend', 'Mine', 'client-1')
    const count = (await log()).length
    await api.chat.remove({ kind: 'message', id: mine.id })
    expect((await log()).length).toBe(count)
  })

  it('messages, replies, comments, reactions and pins stay out of the log, and so does what they say', async () => {
    const count = (await log()).length
    const message = await api.chat.send('c-backend', 'Secret plan for Q4', 'client-9')
    await api.chat.reply(message.id, 'Secret reply')
    await api.chat.react({ kind: 'message', id: message.id }, '👍', true)
    await api.chat.edit({ kind: 'message', id: message.id }, 'Secret plan for Q1')
    await api.pins.pin(message.id)
    await api.comments.create({ taskKey: 'NEX-102', kind: 'comment', body: 'Secret comment', files: [] })
    const events = await log()
    expect(events.length).toBe(count)
    expect(JSON.stringify(events)).not.toMatch(/Secret/)
  })

  it('a refused write saves nothing but its refusal; a 400 records nothing at all', async () => {
    await api.users.viewAs('u-3') // Mariam, a Member
    const count = (await log()).length
    await expect(api.projects.create(newProject)).rejects.toMatchObject({ status: 403 })
    const events = await log()
    expect(events.slice(count)).toEqual([
      expect.objectContaining({ action: 'denied', group: 'access', result: 'refused', actorName: 'Mariam Fathy', record: { type: 'request', id: 'projects.create', name: 'projects.create' } }),
    ])
    expect(events.some((e) => e.record?.name === 'Audit trail')).toBe(false)
    await api.users.viewAs('u-1')
    const after = (await log()).length
    await expect(api.projects.create({ ...newProject, key: 'nope' })).rejects.toMatchObject({ status: 400 })
    expect((await log()).length).toBe(after)
  })

  it('an empty value staying empty is no change: a new project or entry lists only what it was given', async () => {
    await api.projects.create(newProject)
    expect((await log()).at(-1)!.changes.map((c) => c.field)).toEqual(['Key', 'Methodology', 'Name', 'Client', 'Manager', 'Members', 'Status', 'Start date', 'Due date'])
    await api.time.addManual({ ...manual, note: '' })
    expect((await log()).at(-1)!.changes.map((c) => c.field)).toEqual(['Person', 'Project', 'Start', 'End'])
    const data = await db.read()
    expect(changesBetween(data, { note: '', links: [] }, { note: null }, ['note', 'links'])).toEqual([])
  })

  it('values: dates without a time, choices in words, long text cut, empty as null; ids in another order are no change', async () => {
    const data = await db.read()
    expect(shown(data, 'dueDate', '2026-12-12T00:00:00.000Z')).toBe('12 Dec 2026')
    expect(shown(data, 'dueAt', '2026-12-12T00:00:00.000Z')).toBe('12 Dec 2026')
    // Text that only starts like a time stays text.
    expect(shown(data, 'title', '2026-11-08T is the launch')).toBe('2026-11-08T is the launch')
    expect(shown(data, 'whoCanPost', 'admins')).toBe('Only admins')
    expect(shown(data, 'priority', 'urgent')).toBe('Urgent')
    expect(shown(data, 'isPrivate', true)).toBe('On')
    expect(shown(data, 'description', 'x'.repeat(100))).toHaveLength(80)
    expect(shown(data, 'note', '')).toBeNull()
    expect(shown(data, 'memberIds', ['u-2', 'u-3'])).toBe('Nour El-Sayed, Mariam Fathy')
    expect(humanize('inProgress')).toBe('In progress')
    expect(changesBetween(data, { memberIds: ['u-2', 'u-3'] }, { memberIds: ['u-3', 'u-2'] }, ['memberIds'])).toEqual([])
    expect(deviceOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36')).toBe('Chrome 130 · macOS')
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari 18 · iOS')
    expect(deviceOf(undefined)).toBeNull()
  })
})

/** Appends entries as they would have been made, for the reads below. */
async function append(...inputs: Parameters<typeof audit>[1][]) {
  await db.update((d: DbData) => {
    for (const input of inputs) audit(d, input)
  })
}

describe('the log outlives the demo data (slice 2: nothing removes an entry)', () => {
  it('a reset keeps every entry and adds its own; the chain still checks out', async () => {
    await api.projects.update('p-nex', { dueDate: '2026-12-12T00:00:00.000Z' })
    const before = await log()
    await api.db.reset()
    const after = await log()
    expect(after.slice(0, before.length)).toEqual(before)
    expect(after.slice(before.length)).toEqual([expect.objectContaining({ action: 'reset', group: 'settings', actorName: 'Youssef Abdelrahman' })])
    expect(verifyChain(after)).toMatchObject({ intact: true })
  })

  it('an import replaces the data but not the log: the file’s own log, edited or old, is left out', async () => {
    const bundle = (await api.db.export()) as { data: DbData }
    bundle.data.audit = [{ ...bundle.data.audit[0]!, actorName: 'Rewritten' }]
    const before = await log()
    await api.db.import(bundle)
    const after = await log()
    expect(after.slice(0, before.length)).toEqual(before)
    expect(after.at(-1)).toMatchObject({ action: 'imported', actorName: 'Youssef Abdelrahman' })
    expect(after.some((e) => e.actorName === 'Rewritten')).toBe(false)
    expect(verifyChain(after)).toMatchObject({ intact: true })
  })
})

describe('api.audit (slice 2)', () => {
  it('reading needs "See the audit log", and the refusal is itself in the log', async () => {
    await api.users.viewAs('u-2')
    await expect(api.audit.list({})).rejects.toMatchObject({ status: 403, detail: "You don't have access to the audit log." })
    await expect(api.audit.export({})).rejects.toMatchObject({ status: 403 })
    await api.users.viewAs('u-1')
    const refused = (await api.audit.list({ result: 'refused', actorId: 'u-2' })).items
    expect(refused.map((e) => e.record?.id)).toEqual(['audit.export', 'audit.list'])
  })

  it('gets one entry by its number; a number with no entry is a 404', async () => {
    expect(await api.audit.get(4)).toMatchObject({ seq: 4, record: { type: 'role', name: 'Sales' } })
    await expect(api.audit.get(9999)).rejects.toMatchObject({ status: 404 })
  })

  it('lists newest first, 50 at a time; the cursor is the last seq shown', async () => {
    await append(...Array.from({ length: 60 }, (_, i) => ({ action: 'changed' as const, group: 'data' as const, record: { type: 'project', id: 'p-nex', name: `Step ${i}` } })))
    const total = (await log()).length
    const first = await api.audit.list({})
    expect(first.items).toHaveLength(50)
    expect(first.items[0]!.seq).toBe(total)
    expect(first.nextCursor).toBe(String(first.items[49]!.seq))
    const second = await api.audit.list({}, first.nextCursor!)
    expect(second.items).toHaveLength(total - 50)
    expect(second.items[0]!.seq).toBe(first.items[49]!.seq - 1)
    expect(second.nextCursor).toBeNull()
    await expect(api.audit.list({}, 'nope')).rejects.toMatchObject({ status: 400 })
  })

  it('filters by words, period, person, record type, result and group; counts per group ignore the group chosen', async () => {
    const all = await log()
    expect((await api.audit.list({ q: 'k.hasan' })).items).toHaveLength(3)
    expect((await api.audit.list({ q: '105.196' })).items.every((e) => e.action === 'signInFailed')).toBe(true)
    expect((await api.audit.list({ q: '5 Dec 2026' })).items.map((e) => e.record?.name)).toEqual(['Nexus Core'])
    expect((await api.audit.list({ actorId: 'u-3' })).items.map((e) => e.action)).toEqual(['denied', 'signedIn'])
    expect((await api.audit.list({ recordType: 'role' })).items).toHaveLength(1)
    const since = all.at(-2)!.at
    expect((await api.audit.list({ since })).items).toHaveLength(2)
    const access = await api.audit.list({ group: 'access' })
    expect(access.items.every((e) => e.group === 'access')).toBe(true)
    expect(access.counts).toEqual({ all: all.length, data: 1, status: 0, access: 8, settings: 1, exports: 1 })
    expect((await api.audit.list({ group: 'access', result: 'failed' })).counts).toMatchObject({ all: 3, access: 3, data: 0 })
  })

  it('the summary counts today, names who and what is in the log, and checks the chain', async () => {
    const all = await log()
    const todayFrom = all.find((e) => e.actorName === 'Mariam Fathy')!.at
    const summary = await api.audit.summary(todayFrom)
    expect(summary.today).toEqual({ events: 2, data: 0, signIns: 1, failedSignIns: 0, denied: 1 })
    expect(summary.chain).toEqual({ intact: true, checked: all.length })
    expect(summary.people.map((p) => p.name)).toEqual(['Karim Hassan', 'Mariam Fathy', 'Nour El-Sayed', 'Youssef Abdelrahman'])
    expect(summary.recordTypes).toEqual([
      { id: 'data', label: 'Demo data' },
      { id: 'user', label: 'People' },
      { id: 'project', label: 'Projects' },
      { id: 'request', label: 'Requests' },
      { id: 'role', label: 'Roles' },
    ])
  })

  it('the tamper check names the first entry that was changed', async () => {
    await db.update((d) => {
      d.audit[3] = { ...d.audit[3]!, actorName: 'Someone else' }
    })
    expect((await api.audit.summary(clock.toISOString())).chain).toEqual({ intact: false, checked: 11, brokenAt: 4, reason: 'edited' })
  })

  it('needs a look: bursts of failed sign-ins and of refusals, role changes, roles given, and full exports, newest first', async () => {
    const at = (minutesAgo: number) => new Date(clock.getTime() - minutesAgo * 60_000).toISOString()
    await append(
      ...[9, 7, 5].map((m) => ({ at: at(m), action: 'denied' as const, group: 'access' as const, record: { type: 'request', id: 'rates.list', name: 'rates.list' }, result: 'refused' as const, actor: { id: 'u-3', name: 'Mariam Fathy', roles: 'Member' } })),
      { at: at(3), action: 'changed', group: 'data', record: { type: 'user', id: 'u-3', name: 'Mariam Fathy' }, changes: [{ field: 'Roles', from: 'Member', to: 'Member, Project manager' }] },
    )
    const texts = (await api.audit.summary(clock.toISOString())).needsALook.map((a) => [a.tone, a.text])
    expect(texts).toEqual([
      ['amber', "Youssef Abdelrahman changed Mariam Fathy's roles: Member → Member, Project manager"],
      ['red', 'Mariam Fathy was refused 3 times in 4 minutes'],
      ['red', '3 failed sign-ins for k.hasan@spark-sys.com from 105.196.66.3 in 4 minutes'],
      ['amber', 'Youssef Abdelrahman exported all the demo data'],
      ['amber', 'Youssef Abdelrahman changed roles and permissions: Sales: See the dashboard for every project Off → On'],
    ])
  })

  it('a burst is any 3 within 10 minutes, not only from the first one', async () => {
    const at = (minutesAgo: number) => new Date(clock.getTime() - minutesAgo * 60_000).toISOString()
    const refused = (m: number) => ({ at: at(m), action: 'denied' as const, group: 'access' as const, record: { type: 'request', id: 'rates.list', name: 'rates.list' }, result: 'refused' as const, actor: { id: 'u-5', name: 'Salma Ibrahim', roles: 'Member' } })
    // 0, 9, 11 and 12 minutes in: the first window holds 2, the next one 3.
    await append(refused(30), refused(21), refused(19), refused(18))
    const texts = (await api.audit.summary(clock.toISOString())).needsALook.map((a) => a.text)
    expect(texts).toContain('Salma Ibrahim was refused 3 times in 3 minutes')
  })

  it('the export is the filtered log as CSV, newest first, formulas kept as text; taking it is recorded', async () => {
    await api.audit.noteExport('timeCost', '=HYPERLINK("http://x")')
    const csv = await api.audit.export({ recordType: 'report' })
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n')
    expect(lines[0]).toBe('#,When (UTC),Who,Roles,Action,Group,Record type,Record,Changes,Result,Detail,IP,Device,Request,Hash,Previous hash')
    expect(lines).toHaveLength(2)
    // The detail starts its cell: a spreadsheet would run it, so it goes out as text.
    expect(lines[1]).toContain(',"\'=HYPERLINK(""http://x"")",')
    expect((await log()).at(-1)).toMatchObject({ action: 'exported', group: 'exports', record: { type: 'auditLog' }, detail: '1 entry' })
  })

  it('a download note needs a file I can see; the Time and cost note needs "See time and cost"', async () => {
    const count = (await log()).length
    await expect(api.audit.noteDownload('a-gone')).rejects.toMatchObject({ status: 404 })
    await expect(api.audit.noteExport('other' as 'timeCost', '')).rejects.toMatchObject({ status: 400 })
    expect((await log()).length).toBe(count)
    await api.users.viewAs('u-3')
    await expect(api.audit.noteExport('timeCost', 'Last 7 days')).rejects.toMatchObject({ status: 403 })
    expect((await log()).at(-1)).toMatchObject({ action: 'denied', record: { id: 'audit.noteExport' } })
  })
})
