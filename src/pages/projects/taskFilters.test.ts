import { describe, expect, it } from 'vitest'
import type { Phase, TaskView } from '@/api/types'
import { filtersFrom, filterTasks, groupByPhase, loggableTasks, myOpenTasks, staleArchivedParam, validSprint, viewOf } from './taskFilters'

const t = (over: Partial<TaskView>): TaskView =>
  ({ id: over.key ?? 'x', key: 'P-1', status: 'todo', category: over.status === 'done' ? 'done' : 'todo', phaseId: null, sprintId: null, assigneeId: null, dueAt: null, overdue: false, overEstimate: false, rank: 0, ...over }) as TaskView
const phase = (id: string, order: number): Phase => ({ id, projectId: 'p', name: id, order, startDate: '', dueDate: '', status: 'notStarted' })

describe('filterTasks', () => {
  const tasks = [t({ key: 'A', phaseId: 'ph1', sprintId: 's1' }), t({ key: 'B', phaseId: 'ph2', sprintId: 's1' }), t({ key: 'C', phaseId: 'ph1' })]
  it('keeps all with no filter, and narrows by phase and sprint together', () => {
    expect(filterTasks(tasks, {}).map((x) => x.key)).toEqual(['A', 'B', 'C'])
    expect(filterTasks(tasks, { phase: 'ph1' }).map((x) => x.key)).toEqual(['A', 'C'])
    expect(filterTasks(tasks, { sprint: 's1' }).map((x) => x.key)).toEqual(['A', 'B'])
    expect(filterTasks(tasks, { phase: 'ph1', sprint: 's1' }).map((x) => x.key)).toEqual(['A'])
  })
})

describe('groupByPhase', () => {
  it('groups in phase order, "No phase" last; tasks of an unknown phase count as no phase', () => {
    const phases = [phase('b', 2), phase('a', 1)]
    const groups = groupByPhase([t({ key: 'X', phaseId: 'b' }), t({ key: 'Y' }), t({ key: 'Z', phaseId: 'a' }), t({ key: 'W', phaseId: 'gone' })], phases)
    expect(groups.map((g) => [g.phase?.id ?? null, g.tasks.map((x) => x.key)])).toEqual([
      ['a', ['Z']],
      ['b', ['X']],
      [null, ['Y', 'W']],
    ])
  })
})

describe('myOpenTasks', () => {
  it('mine and not done; overdue first, then due ascending (no due last), then key', () => {
    const tasks = [
      t({ key: 'P-5', assigneeId: 'me', dueAt: '2026-11-02T00:00:00Z' }),
      t({ key: 'P-4', assigneeId: 'me' }),
      t({ key: 'P-3', assigneeId: 'me', dueAt: '2026-11-01T00:00:00Z' }),
      t({ key: 'P-2', assigneeId: 'me', overdue: true, dueAt: '2026-11-09T00:00:00Z' }),
      t({ key: 'P-1', assigneeId: 'me', status: 'done' }),
      t({ key: 'P-0', assigneeId: 'other' }),
      t({ key: 'P-10', assigneeId: 'me' }),
    ]
    expect(myOpenTasks(tasks, 'me').map((x) => x.key)).toEqual(['P-2', 'P-3', 'P-5', 'P-4', 'P-10'])
  })
})

describe('viewOf and validSprint', () => {
  it('an old saved view (backlog) or none falls back to the board; the address wins', () => {
    expect(viewOf(null, 'backlog')).toBe('board')
    expect(viewOf(null, undefined)).toBe('board')
    expect(viewOf(null, 'list')).toBe('list')
    expect(viewOf('list', 'board')).toBe('list')
    expect(viewOf('nonsense', 'list')).toBe('list')
  })
  it('an unknown sprint id is ignored', () => {
    const sprints = [{ id: 's-1' }, { id: 's-2' }]
    expect(validSprint('s-2', sprints)).toBe('s-2')
    expect(validSprint('s-gone', sprints)).toBeNull()
    expect(validSprint(null, sprints)).toBeNull()
  })
})

describe('myOpenTasks and column types', () => {
  it('leaves out tasks of every Done-type column, whatever the column is called', () => {
    const tasks = [t({ key: 'A', assigneeId: 'me', status: 'col-ship', category: 'done' }), t({ key: 'B', assigneeId: 'me', status: 'done', category: 'inProgress' })]
    expect(myOpenTasks(tasks, 'me').map((x) => x.key)).toEqual(['B'])
  })
})

describe('loggableTasks', () => {
  it('leaves out tasks on projects I may not log time on, such as one I was taken off', () => {
    const tasks = [t({ key: 'A', projectId: 'p-on' }), t({ key: 'B', projectId: 'p-off' })]
    expect(loggableTasks(tasks, (projectId) => projectId === 'p-on').map((x) => x.key)).toEqual(['A'])
  })

  it('?archived=1 is cleared only once the project has no archived tasks at all', () => {
    expect(staleArchivedParam(true, 0)).toBe(true)
    expect(staleArchivedParam(true, undefined)).toBe(false) // still loading
    expect(staleArchivedParam(true, 2)).toBe(false) // the unfiltered count: a phase filter that hides them keeps it
    expect(staleArchivedParam(false, 0)).toBe(false)
  })
})

describe('filtersFrom', () => {
  it('each filter comes from the address when it is there, else from memory', () => {
    const last = { phase: 'ph-old', sprint: 's2' }
    expect(filtersFrom(new URLSearchParams(''), last)).toEqual({ phase: 'ph-old', sprint: 's2' })
    expect(filtersFrom(new URLSearchParams('phase=design'), last)).toEqual({ phase: 'design', sprint: 's2' })
    expect(filtersFrom(new URLSearchParams('sprint=s1'), undefined)).toEqual({ phase: null, sprint: 's1' })
  })
})


describe('myOpenTasks order (UX Phase 1, 1.1)', () => {
  it('overdue first, then over estimate, then the nearest due date', () => {
    const tasks = [
      t({ key: 'D', assigneeId: 'me', dueAt: '2026-11-10T00:00:00.000Z' }),
      t({ key: 'O', assigneeId: 'me', overEstimate: true, dueAt: '2026-12-01T00:00:00.000Z' }),
      t({ key: 'L', assigneeId: 'me', overdue: true, dueAt: '2026-11-01T00:00:00.000Z' }),
    ]
    expect(myOpenTasks(tasks, 'me').map((x) => x.key)).toEqual(['L', 'O', 'D'])
  })
})
