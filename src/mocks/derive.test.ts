import { describe, expect, it, vi } from 'vitest'
import type { Attachment, Phase, Project, Rate, Ticket, TimeEntry } from '@/api/types'
import { entryHours, isOverdue, isOverEstimate, liveFiles, loggedHours, summarize, taskView } from './derive'
import { ALL_PERMISSIONS, BUILT_IN_ROLES } from '@/lib/permissions'

const now = new Date('2026-10-26T12:00:00Z')
const iso = (hoursFromNow: number) => new Date(now.getTime() + hoursFromNow * 3_600_000).toISOString()
const day = (daysFromNow: number) => iso(daysFromNow * 24)

const task = (over: Partial<Ticket> = {}): Ticket => ({
  id: 't-1', key: 'P-101', projectId: 'p-1', title: 'T', description: '', descriptionBody: [], attachmentIds: [], status: 'todo', priority: 'medium', storyPoints: null,
  assigneeId: null, reporterId: 'u-1', sprintId: null, rank: 1000, linkedChannelId: null, linkedMessageId: null,
  createdAt: day(-10), updatedAt: day(-10), phaseId: null, type: 'task', dueAt: null, estimateHours: null, ...over,
})
const entry = (over: Partial<TimeEntry>): TimeEntry => ({
  id: 'te', userId: 'u-1', projectId: 'p-1', taskId: 't-1', startedAt: iso(-2), endedAt: iso(-1), source: 'timer', note: '', endReason: null, ...over,
})
const phase = (over: Partial<Phase>): Phase => ({ id: 'ph', projectId: 'p-1', name: 'Build', order: 1, startDate: day(-10), dueDate: day(10), status: 'inProgress', ...over })
const project: Project = {
  id: 'p-1', workspaceId: 'ws', key: 'P', name: 'P', description: '', clientName: 'C', logoFileId: null, links: [], managerId: 'u-1',
  memberIds: [], teamIds: [], methodology: 'waterfall', status: 'active', startDate: day(-30), dueDate: day(30), channelId: 'c',
}
const data = (over: { tickets?: Ticket[]; timeEntries?: TimeEntry[]; phases?: Phase[]; rates?: Rate[] }) => ({
  tickets: [], timeEntries: [], phases: [], rates: [], ...over,
})

describe('hours', () => {
  it('counts closed entries and a running one up to now', () => {
    expect(entryHours(entry({ startedAt: iso(-3), endedAt: iso(-1) }), now)).toBe(2)
    expect(entryHours(entry({ startedAt: iso(-1.5), endedAt: null }), now)).toBe(1.5)
    expect(loggedHours('t-1', [entry({ id: 'a' }), entry({ id: 'b', startedAt: iso(-0.5), endedAt: null }), entry({ id: 'c', taskId: 't-2' })], now)).toBe(1.5)
  })
})

describe('overdue (the date) and over estimate (the hours), UX Phase 1, 1.1', () => {
  it('overdue is past the due date and not done, whatever the hours', () => {
    expect(isOverdue(task(), now)).toBe(false) // no due date
    expect(isOverdue(task({ status: 'done', dueAt: day(-2) }), now)).toBe(false) // done is never overdue
    expect(isOverdue(task({ dueAt: day(-2) }), now)).toBe(true)
    expect(isOverdue(task({ dueAt: day(2) }), now)).toBe(false)
    expect(isOverdue(task({ dueAt: '2026-10-26T00:00:00.000Z' }), now)).toBe(false) // due today is not overdue
    expect(isOverdue(task({ dueAt: day(2), estimateHours: 4 }), now)).toBe(false) // hours never make it overdue
  })

  it('over estimate is more hours logged than estimated and not done, whatever the date', () => {
    expect(isOverEstimate(task({ estimateHours: 4 }), 4.5)).toBe(true)
    expect(isOverEstimate(task({ estimateHours: 4 }), 4)).toBe(false)
    expect(isOverEstimate(task({ estimateHours: 0 }), 3)).toBe(false)
    expect(isOverEstimate(task({ estimateHours: null }), 3)).toBe(false)
    expect(isOverEstimate(task({ status: 'done', estimateHours: 1 }), 3)).toBe(false)
    expect(isOverEstimate(task({ dueAt: day(-2) }), 0)).toBe(false)
  })

  it('taskView adds loggedHours, overdue and overEstimate; a task can be both', () => {
    const twoHours = data({ timeEntries: [entry({ startedAt: iso(-3), endedAt: iso(-1) })] })
    expect(taskView(task({ estimateHours: 1, dueAt: day(2) }), twoHours, now)).toMatchObject({ loggedHours: 2, overdue: false, overEstimate: true })
    expect(taskView(task({ estimateHours: 1, dueAt: day(-2) }), twoHours, now)).toMatchObject({ overdue: true, overEstimate: true })
    expect(taskView(task({ estimateHours: 5, dueAt: day(-2) }), twoHours, now)).toMatchObject({ overdue: true, overEstimate: false })
  })
})

describe('summarize', () => {
  const admin = { userId: 'u-1', grants: ALL_PERMISSIONS }
  const sales = { userId: 'u-9', grants: BUILT_IN_ROLES.find((r) => r.id === 'sales')!.grants }

  it('progress is done / all, 0 with no tasks', () => {
    expect(summarize(project, data({}), now, admin).progress).toBe(0)
    const tickets = [task({ id: 'a', status: 'done' }), task({ id: 'b', status: 'done' }), task({ id: 'c', status: 'done' }), task({ id: 'd' })]
    expect(summarize(project, data({ tickets }), now, admin)).toMatchObject({ progress: 0.75, taskCount: 4 })
  })

  it('expectedFinish: last open phase due, pushed out when tasks are overdue, project due when all phases are done', () => {
    const phases = [phase({ id: 'a', order: 1, dueDate: day(3) }), phase({ id: 'b', order: 2, dueDate: day(8), status: 'notStarted' })]
    expect(summarize(project, data({ phases }), now, admin).expectedFinish).toBe(day(8))
    // 1 overdue task with 160 h left → 20 working days at 8 h/day, later than the last phase
    const late = [task({ dueAt: day(-1), estimateHours: 160 })]
    expect(summarize(project, data({ phases, tickets: late }), now, admin).expectedFinish).toBe(day(20))
    // Over its estimate but not late also pushes it out: the remaining estimate of open tasks.
    const over = [task({ id: 'o', dueAt: day(5), estimateHours: 1 }), task({ id: 'p', estimateHours: 160 })]
    const twoHours = [entry({ taskId: 'o', startedAt: iso(-3), endedAt: iso(-1) })]
    expect(summarize(project, data({ phases, tickets: over, timeEntries: twoHours }), now, admin).expectedFinish).toBe(day(20))
    const done = [phase({ status: 'done' })]
    expect(summarize(project, data({ phases: done }), now, admin).expectedFinish).toBe(project.dueDate)
  })

  it('cost is hours × rate for admins only, a missing rate counts 0', () => {
    const timeEntries = [entry({ id: 'a', userId: 'u-1', startedAt: iso(-3), endedAt: iso(-1) }), entry({ id: 'b', userId: 'u-2', startedAt: iso(-2), endedAt: iso(-1) })]
    const rates: Rate[] = [{ id: 'r-u-1', userId: 'u-1', hourlyCost: 300, currency: 'EGP', effectiveFrom: '1970-01-01T00:00:00.000Z' }]
    expect(summarize(project, data({ timeEntries, rates }), now, admin)).toMatchObject({ loggedHours: 3, cost: 600 })
    expect(summarize(project, data({ timeEntries, rates }), now, sales).cost).toBeNull()
  })

  it('currentPhaseId is the first phase not done by order; overdueCount and overEstimateCount count their tasks', () => {
    const phases = [phase({ id: 'b', order: 2, status: 'notStarted' }), phase({ id: 'a', order: 1, status: 'done' })]
    const tickets = [task({ id: 'x', dueAt: day(-1) }), task({ id: 'y' }), task({ id: 'z', estimateHours: 1 })]
    const timeEntries = [entry({ taskId: 'z', startedAt: iso(-3), endedAt: iso(-1) })]
    expect(summarize(project, data({ phases, tickets, timeEntries }), now, admin)).toMatchObject({ currentPhaseId: 'b', overdueCount: 1, overEstimateCount: 1 })
    expect(summarize(project, data({ phases: [phase({ status: 'done' })] }), now, admin).currentPhaseId).toBeNull()
  })
})


describe('done follows the column type', () => {
  const board = [
    { id: 'todo', label: 'Next', category: 'todo' as const },
    { id: 'done', label: 'Done', category: 'inProgress' as const },
    { id: 'col-ship', label: 'Shipped', category: 'done' as const },
  ]
  const p = { ...project, board }

  it('a task in a Done-type column named Shipped counts as done: progress, never overdue', () => {
    const t = task({ status: 'col-ship', dueAt: day(-2) })
    const view = taskView(t, { timeEntries: [], projects: [p] }, now)
    expect(view.category).toBe('done')
    expect(view.overdue).toBe(false)
    expect(summarize(p, data({ tickets: [t] }), now, { userId: 'u-1', grants: ALL_PERMISSIONS }).progress).toBe(1)
  })

  it('a column named Done with type In progress counts as open', () => {
    const t = task({ status: 'done', dueAt: day(-2) })
    const view = taskView(t, { timeEntries: [], projects: [p] }, now)
    expect(view.category).toBe('inProgress')
    expect(view.overdue).toBe(true)
    expect(summarize(p, data({ tickets: [t] }), now, { userId: 'u-1', grants: ALL_PERMISSIONS }).progress).toBe(0)
  })
})

describe('a task’s files', () => {
  it('follow its list, leaving out deleted and missing ones', () => {
    const a = (id: string, deletedAt: string | null = null) => ({ id, deletedAt }) as Attachment
    const view = taskView(task({ attachmentIds: ['f-2', 'f-gone', 'f-1', 'f-del'] }), { timeEntries: [], attachments: [a('f-1'), a('f-2'), a('f-del', day(-1))] }, now)
    expect(view.attachments.map((f) => f.id)).toEqual(['f-2', 'f-1'])
    expect(taskView(task(), { timeEntries: [] }, now).attachments).toEqual([])
  })

  it('a read looks its files up once, however many tasks it has', () => {
    const a = (id: string, deletedAt: string | null = null) => ({ id, deletedAt }) as Attachment
    const files = [a('f-1'), a('f-2'), a('f-del', day(-1))]
    const lookups = vi.spyOn(files, 'filter')
    const tickets = [task({ attachmentIds: ['f-1'] }), task({ id: 't-2', key: 'P-102', attachmentIds: ['f-2', 'f-del'] }), task({ id: 't-3', key: 'P-103' })]
    summarize(project, { ...data({ tickets }), attachments: files }, now, { userId: 'u-1', grants: ALL_PERMISSIONS })
    expect(lookups).toHaveBeenCalledOnce()
    // A list's lookup, handed to each task.
    const lookup = liveFiles(files)
    expect(tickets.map((t) => taskView(t, { timeEntries: [] }, now, project, lookup).attachments.map((f) => f.id))).toEqual([['f-1'], ['f-2'], []])
  })
})
