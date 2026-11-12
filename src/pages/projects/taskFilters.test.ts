import { describe, expect, it } from 'vitest'
import type { Phase, TaskView } from '@/api/types'
import { isDueToday, myTaskTiles, activeFilters, filtersFrom, filterTasks, groupByPhase, loggableTasks, matchesQuery, myOpenTasks, sortTasks, sprintPlanTasks, staleArchivedParam, taskQueryFrom, validSprint, viewOf } from './taskFilters'

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
    expect(viewOf(null, 'backlog', false)).toBe('board')
    expect(viewOf(null, undefined, false)).toBe('board')
    expect(viewOf(null, 'list', false)).toBe('list')
    expect(viewOf('list', 'board', false)).toBe('list')
    expect(viewOf('nonsense', 'list', false)).toBe('list')
  })
  it('Sprints is a view on agile projects only; elsewhere it falls back to the board (sprints spec §6.1)', () => {
    expect(viewOf('sprints', undefined, true)).toBe('sprints')
    expect(viewOf(null, 'sprints', true)).toBe('sprints')
    expect(viewOf('sprints', undefined, false)).toBe('board')
    expect(viewOf(null, 'sprints', false)).toBe('board')
    // Asked for on a waterfall project, it opens the board, whatever was last shown there.
    expect(viewOf('sprints', 'list', false)).toBe('board')
    expect(viewOf(null, 'sprints', false)).toBe('board')
  })
  it('the Sprints view lists tasks in an active or planned sprint, and unfinished ones in no open sprint', () => {
    const sprints = [{ id: 's-a', state: 'active' as const }, { id: 's-p', state: 'planned' as const }, { id: 's-c', state: 'closed' as const }]
    const tasks = [
      t({ key: 'A', sprintId: 's-a', status: 'done' }),
      t({ key: 'P', sprintId: 's-p' }),
      // Left unfinished in a closed sprint (reopened, unticked, restored): it's to plan again (sprints final review).
      t({ key: 'C', sprintId: 's-c' }),
      t({ key: 'CD', sprintId: 's-c', status: 'done' }),
      t({ key: 'B' }),
      t({ key: 'D', status: 'done' }),
      t({ key: 'G', sprintId: 's-gone' }),
    ]
    expect(sprintPlanTasks(tasks, sprints).map((x) => x.key)).toEqual(['A', 'P', 'C', 'B', 'G'])
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
    expect(filtersFrom(new URLSearchParams(''), last, null)).toEqual({ phase: 'ph-old', sprint: 's2' })
    expect(filtersFrom(new URLSearchParams('phase=design'), last, null)).toEqual({ phase: 'design', sprint: 's2' })
    expect(filtersFrom(new URLSearchParams('sprint=s1'), undefined, null)).toEqual({ phase: null, sprint: 's1' })
  })

  // Sprints spec §6.3: an agile project's sprint is the active one until the address or a remembered pick says otherwise.
  it('the sprint is the active one when neither the address nor memory has one', () => {
    expect(filtersFrom(new URLSearchParams(), undefined, 's-nex-1').sprint).toBe('s-nex-1')
    expect(filtersFrom(new URLSearchParams(), { phase: 'ph1' }, 's-nex-1').sprint).toBe('s-nex-1')
    expect(filtersFrom(new URLSearchParams('phase=design'), undefined, 's-nex-1')).toEqual({ phase: 'design', sprint: 's-nex-1' })
    expect(filtersFrom(new URLSearchParams(), undefined, null).sprint).toBeNull()
  })

  it('a remembered All sprints (stored as an empty string) is a choice: no sprint, not the active one', () => {
    expect(filtersFrom(new URLSearchParams(), { sprint: '' }, 's-nex-1').sprint).toBeNull()
    expect(filtersFrom(new URLSearchParams(), { phase: 'ph1', sprint: '' }, 's-nex-1')).toEqual({ phase: 'ph1', sprint: null })
  })

  it('the address and a remembered sprint both win over the active one', () => {
    expect(filtersFrom(new URLSearchParams('sprint=s-nex-2'), undefined, 's-nex-1').sprint).toBe('s-nex-2')
    expect(filtersFrom(new URLSearchParams('sprint=s-nex-2'), { sprint: '' }, 's-nex-1').sprint).toBe('s-nex-2')
    expect(filtersFrom(new URLSearchParams(), { sprint: 's-nex-2' }, 's-nex-1').sprint).toBe('s-nex-2')
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

// UX Phase 4, 4.2: the Tasks tab's search, filters and sort.
describe('matchesQuery', () => {
  const login = t({ key: 'NEX-12', title: 'Login page', assigneeId: 'u-2', priority: 'high', type: 'task' })
  const bug = t({ key: 'NEX-13', title: 'Crash on save', assigneeId: null, priority: 'urgent', type: 'bug' })
  const keys = (query: Parameters<typeof matchesQuery>[1]) => [login, bug].filter((x) => matchesQuery(x, query, 'u-2')).map((x) => x.key)
  it('searches the key and the title, any case', () => {
    expect(keys({ q: 'nex-12' })).toEqual(['NEX-12'])
    expect(keys({ q: 'LOGIN' })).toEqual(['NEX-12'])
    expect(keys({ q: '  ' })).toEqual(['NEX-12', 'NEX-13'])
  })
  it('filters by assignee (me, nobody, someone), priority and type', () => {
    expect(keys({ assignee: 'me' })).toEqual(['NEX-12'])
    expect(keys({ assignee: 'none' })).toEqual(['NEX-13'])
    expect(keys({ assignee: 'u-9' })).toEqual([])
    expect(keys({ priority: 'urgent' })).toEqual(['NEX-13'])
    expect(keys({ type: 'task' })).toEqual(['NEX-12'])
  })
})

describe('taskQueryFrom and activeFilters', () => {
  it('reads the keys it knows and counts what is on', () => {
    const query = taskQueryFrom(new URLSearchParams('q=log&assignee=me&priority=loud&type=bug'))
    expect(query).toEqual({ q: 'log', assignee: 'me', priority: undefined, type: 'bug' })
    expect(activeFilters(query, { phase: 'ph1', sprint: null })).toBe(4)
    expect(activeFilters({}, { phase: null, sprint: null })).toBe(0)
  })
})

describe('sortTasks', () => {
  const a = t({ key: 'NEX-1', dueAt: '2026-11-20', priority: 'low', updatedAt: '2026-11-01T10:00:00.000Z' })
  const b = t({ key: 'NEX-2', dueAt: null, priority: 'urgent', overEstimate: true, updatedAt: '2026-11-08T10:00:00.000Z' })
  const c = t({ key: 'NEX-3', dueAt: '2026-11-02', priority: 'medium', overdue: true, updatedAt: '2026-11-05T10:00:00.000Z' })
  const keys = (sort: Parameters<typeof sortTasks>[1]) => sortTasks([a, b, c], sort).map((x) => x.key)
  it('needs attention first: overdue, then over estimate, then by due', () => expect(keys('attention')).toEqual(['NEX-3', 'NEX-2', 'NEX-1']))
  it('by due date, none last', () => expect(keys('due')).toEqual(['NEX-3', 'NEX-1', 'NEX-2']))
  it('by priority, urgent first', () => expect(keys('priority')).toEqual(['NEX-2', 'NEX-3', 'NEX-1']))
  it('recently updated first', () => expect(keys('updated')).toEqual(['NEX-2', 'NEX-3', 'NEX-1']))
  it('board order keeps the order given', () => expect(keys('board')).toEqual(['NEX-1', 'NEX-2', 'NEX-3']))
})

// UX Phase 4, 4.2: My work's attention tiles.
describe('isDueToday and myTaskTiles', () => {
  it('reads a due date as its calendar day, whatever the time zone', () => {
    const due = t({ dueAt: '2026-11-09T00:00:00.000Z' })
    expect(isDueToday(due, new Date(2026, 10, 9, 23, 30))).toBe(true)
    expect(isDueToday(due, new Date(2026, 10, 10, 0, 30))).toBe(false)
    expect(isDueToday(t({ dueAt: null }), new Date(2026, 10, 9))).toBe(false)
  })
  it('counts overdue, due today, in progress and over estimate', () => {
    const now = new Date(2026, 10, 9, 10)
    const tasks = [
      t({ key: 'A', overdue: true }),
      t({ key: 'B', dueAt: '2026-11-09T00:00:00.000Z', category: 'inProgress' }),
      t({ key: 'C', overEstimate: true, category: 'inProgress' }),
    ]
    expect(myTaskTiles(tasks, now)).toEqual({ overdue: 1, today: 1, inProgress: 2, overEstimate: 1 })
  })
})
