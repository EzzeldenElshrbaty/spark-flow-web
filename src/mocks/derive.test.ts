import { describe, expect, it } from 'vitest'
import type { Phase, Project, Rate, Ticket, TimeEntry } from '@/api/types'
import { entryHours, isOverdue, loggedHours, summarize, taskView } from './derive'

const now = new Date('2026-10-26T12:00:00Z')
const iso = (hoursFromNow: number) => new Date(now.getTime() + hoursFromNow * 3_600_000).toISOString()
const day = (daysFromNow: number) => iso(daysFromNow * 24)

const task = (over: Partial<Ticket> = {}): Ticket => ({
  id: 't-1', key: 'P-101', projectId: 'p-1', title: 'T', description: '', status: 'todo', priority: 'medium', storyPoints: null,
  assigneeId: null, reporterId: 'u-1', sprintId: null, rank: 1000, linkedChannelId: null, linkedMessageId: null,
  createdAt: day(-10), updatedAt: day(-10), phaseId: null, type: 'task', dueAt: null, estimateHours: null, ...over,
})
const entry = (over: Partial<TimeEntry>): TimeEntry => ({
  id: 'te', userId: 'u-1', projectId: 'p-1', taskId: 't-1', startedAt: iso(-2), endedAt: iso(-1), source: 'timer', note: '', ...over,
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

describe('overdue edge cases', () => {
  it('follows the spec rules', () => {
    expect(isOverdue(task(), 0, now)).toBe(false) // no due date, no estimate
    expect(isOverdue(task({ status: 'done', dueAt: day(-2) }), 0, now)).toBe(false) // done is never overdue
    expect(isOverdue(task({ dueAt: day(-2) }), 0, now)).toBe(true)
    expect(isOverdue(task({ dueAt: day(2) }), 0, now)).toBe(false)
    expect(isOverdue(task({ estimateHours: 4 }), 4.5, now)).toBe(true)
    expect(isOverdue(task({ estimateHours: 4 }), 4, now)).toBe(false)
    expect(isOverdue(task({ estimateHours: 0 }), 0, now)).toBe(false)
  })

  it('taskView adds loggedHours and overdue', () => {
    const view = taskView(task({ estimateHours: 1 }), data({ timeEntries: [entry({ startedAt: iso(-3), endedAt: iso(-1) })] }), now)
    expect(view).toMatchObject({ loggedHours: 2, overdue: true })
  })
})

describe('summarize', () => {
  const admin = { userId: 'u-1', role: 'admin' as const }
  const sales = { userId: 'u-9', role: 'sales' as const }

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
    const done = [phase({ status: 'done' })]
    expect(summarize(project, data({ phases: done }), now, admin).expectedFinish).toBe(project.dueDate)
  })

  it('cost is hours × rate for admins only, a missing rate counts 0', () => {
    const timeEntries = [entry({ id: 'a', userId: 'u-1', startedAt: iso(-3), endedAt: iso(-1) }), entry({ id: 'b', userId: 'u-2', startedAt: iso(-2), endedAt: iso(-1) })]
    const rates: Rate[] = [{ userId: 'u-1', hourlyCost: 300, currency: 'EGP' }]
    expect(summarize(project, data({ timeEntries, rates }), now, admin)).toMatchObject({ loggedHours: 3, cost: 600 })
    expect(summarize(project, data({ timeEntries, rates }), now, sales).cost).toBeNull()
  })

  it('currentPhaseId is the first phase not done by order; overdueCount counts overdue tasks', () => {
    const phases = [phase({ id: 'b', order: 2, status: 'notStarted' }), phase({ id: 'a', order: 1, status: 'done' })]
    const tickets = [task({ id: 'x', dueAt: day(-1) }), task({ id: 'y' })]
    expect(summarize(project, data({ phases, tickets }), now, admin)).toMatchObject({ currentPhaseId: 'b', overdueCount: 1 })
    expect(summarize(project, data({ phases: [phase({ status: 'done' })] }), now, admin).currentPhaseId).toBeNull()
  })
})
