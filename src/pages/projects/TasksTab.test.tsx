// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSummary, Sprint, TaskView } from '@/api/types'
import type { SprintActions } from './sprints/SprintPlan'
import { TasksTab } from './TasksTab'

// Final review of UX Phase 2: clearing a stale ?archived=1 replaces the entry, so Back still leaves the page.

const project = {
  id: 'p-nex', key: 'NEX', name: 'Nexus Core', status: 'active', methodology: 'waterfall', clientName: 'Spark', managerId: 'u-2', memberIds: [], teamIds: [],
  links: [], startDate: '2026-10-01T00:00:00.000Z', dueDate: '2026-12-01T00:00:00.000Z', channelId: 'c-p-nex', currentPhaseId: null, archivedAt: null, board: undefined,
} as unknown as ProjectSummary
const mutation = { mutateAsync: vi.fn(), error: null }
let tasks: TaskView[] = []
let sprints: Sprint[] = []
vi.mock('@/api/tickets', () => ({
  useTickets: () => ({ data: tasks, isPending: false, isError: false }),
  useArchivedTasks: () => ({ data: [] }),
  useSprints: () => ({ data: sprints }),
  useUpdateTask: () => mutation,
  useMoveTask: () => mutation,
}))
vi.mock('@/api/projects', () => ({ useSetBoard: () => mutation }))
// Whoever may manage the project's tasks plans its sprints.
let manager = true
vi.mock('@/lib/usePermission', () => ({ usePermission: () => (action: string) => (action === 'task.manage' ? manager : true) }))
vi.mock('@/lib/useRole', () => ({ useRole: () => ({ persona: { id: 'u-2' } }) }))
// The list and the board say which tasks they were given.
vi.mock('@/pages/projects/ProjectBacklog', () => ({ ProjectBacklog: ({ tasks: shown }: { tasks: TaskView[] }) => <p>List {shown.map((t) => t.key).join(' ')}</p>, BacklogSkeleton: () => null }))
vi.mock('@/pages/projects/ProjectBoard', () => ({ ProjectBoard: ({ tickets }: { tickets: TaskView[] }) => <p>Board {tickets.map((t) => t.key).join(' ')}</p>, BoardSkeleton: () => null }))
// The Sprints view says which rows it was given, and how many tasks its totals count; with sprint actions it has a
// button for each (on the first planned sprint, or the first sprint of all for Complete).
vi.mock('@/pages/projects/sprints/SprintPlan', () => ({
  SprintPlan: ({ tasks: rows, allTasks, sprints: all, actions }: { tasks: TaskView[]; allTasks: TaskView[]; sprints: Sprint[]; actions: SprintActions }) => (
    <div>
      <p>
        Sprints {rows.map((t) => t.key).join(' ')} of {allTasks.length}
        {actions === null && ' · no actions'}
      </p>
      {actions && <button onClick={() => actions.create()}>Create sprint</button>}
      {actions && all.length > 1 && (
        <>
          <button onClick={() => actions.edit(all[1]!)}>Edit {all[1]!.name}</button>
          <button onClick={() => actions.start(all[1]!)}>Start {all[1]!.name}</button>
          <button onClick={() => actions.complete(all[0]!)}>Complete {all[0]!.name}</button>
          <button onClick={() => actions.remove(all[1]!)}>Delete {all[1]!.name}</button>
        </>
      )}
    </div>
  ),
}))
// The sheets say which one is open, over which sprint, and how many of the project's tasks they were given.
vi.mock('@/pages/projects/sprints/SprintSheet', () => ({
  SprintSheet: ({ mode, sprint, sprints: all, tasks: given, onClose }: { mode: string; sprint?: Sprint; sprints: Sprint[]; tasks: TaskView[]; onClose: () => void }) => (
    <div>
      <p>{`Sheet ${mode} ${sprint?.name ?? 'new'} · ${given.length} tasks · ${all.length} sprints`}</p>
      <button onClick={onClose}>Close sheet</button>
    </div>
  ),
}))
vi.mock('@/pages/projects/sprints/CompleteSprintSheet', () => ({
  CompleteSprintSheet: ({ sprint, tasks: given, onClose }: { sprint: Sprint; tasks: TaskView[]; onClose: () => void }) => (
    <div>
      <p>{`Sheet complete ${sprint.name} · ${given.length} tasks`}</p>
      <button onClick={onClose}>Close sheet</button>
    </div>
  ),
}))
vi.mock('@/pages/projects/sprints/DeleteSprintSheet', () => ({
  DeleteSprintSheet: ({ sprint, tasks: given, onClose }: { sprint: Sprint; tasks: TaskView[]; onClose: () => void }) => (
    <div>
      <p>{`Sheet delete ${sprint.name} · ${given.length} tasks`}</p>
      <button onClick={onClose}>Close sheet</button>
    </div>
  ),
}))

afterEach(() => {
  cleanup()
  tasks = []
  sprints = []
  manager = true
})

describe('the Tasks tab’s address (final review)', () => {
  it('a stale ?archived=1 is cleared in place, so Back still leaves the page', async () => {
    const router = createMemoryRouter([{ path: '/w/:ws/p/:projectKey/:tab', element: <TasksTab project={project} people={[]} phases={[]} /> }], {
      initialEntries: ['/w/engineering/p/NEX/overview', '/w/engineering/p/NEX/tasks?view=list&archived=1'],
      initialIndex: 1,
    })
    await act(async () => render(<RouterProvider router={router} />))
    expect(router.state.location.search).toBe('?view=list')
    expect(router.state.historyAction).toBe('REPLACE')
    await act(() => router.navigate(-1))
    expect(router.state.location.pathname).toBe('/w/engineering/p/NEX/overview')
  })
})

describe('Board | List (UX Phase 3, 3.5: one segmented control)', () => {
  it('choosing List is a step Back undoes', async () => {
    const router = createMemoryRouter([{ path: '/w/:ws/p/:projectKey/:tab', element: <TasksTab project={project} people={[]} phases={[]} /> }], {
      initialEntries: ['/w/engineering/p/NEX/tasks?view=board'],
    })
    await act(async () => render(<RouterProvider router={router} />))
    expect(screen.getByRole('radiogroup', { name: 'View' })).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('radio', { name: 'List' })))
    expect(router.state.location.search).toBe('?view=list')
    expect(router.state.historyAction).toBe('PUSH')
    await act(() => router.navigate(-1))
    expect(screen.getByRole('radio', { name: 'Board' }).getAttribute('aria-checked')).toBe('true')
  })
})

// UX Phase 4, 4.2: search, filters and sort, each kept in the address.
const task = (key: string, over: Partial<TaskView> = {}) =>
  ({ id: key, key, title: `Task ${key}`, status: 'todo', category: 'todo', phaseId: null, sprintId: null, assigneeId: null, priority: 'medium', type: 'task', dueAt: null, overdue: false, overEstimate: false, rank: 0, updatedAt: '2026-11-01T00:00:00.000Z', ...over }) as TaskView

async function open(search: string, of: ProjectSummary = project) {
  const router = createMemoryRouter([{ path: '/w/:ws/p/:projectKey/:tab', element: <TasksTab project={of} people={[]} phases={[]} /> }], {
    initialEntries: [`/w/engineering/p/NEX/tasks${search}`],
  })
  await act(async () => render(<RouterProvider router={router} />))
  return router
}

describe('the Tasks tab’s search and filters (UX Phase 4)', () => {
  it('a priority is a step Back undoes; the count says how many show', async () => {
    tasks = [task('NEX-1', { priority: 'high' }), task('NEX-2'), task('NEX-3'), task('NEX-4'), task('NEX-5')]
    const router = await open('?view=list')
    expect(screen.getByRole('status').textContent).toBe('5 tasks')
    await act(async () => fireEvent.change(screen.getByRole('combobox', { name: 'Priority' }), { target: { value: 'high' } }))
    expect(router.state.location.search).toBe('?view=list&priority=high')
    expect(router.state.historyAction).toBe('PUSH')
    expect(screen.getByText('List NEX-1')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Showing 1 of 5 tasks · Clear filters')
    await act(() => router.navigate(-1))
    expect(screen.getByRole('status').textContent).toBe('5 tasks')
  })

  it('typed words replace the entry instead of adding one', async () => {
    tasks = [task('NEX-1', { title: 'Login page' }), task('NEX-2')]
    vi.useFakeTimers()
    const router = await open('?view=board')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search tasks' }), { target: { value: 'login' } })
    await act(async () => vi.advanceTimersByTime(300))
    vi.useRealTimers()
    expect(router.state.location.search).toBe('?view=board&q=login')
    expect(router.state.historyAction).toBe('REPLACE')
    expect(screen.getByText('Board NEX-1')).toBeTruthy()
  })

  it('Clear filters takes off the search, assignee, priority, type, phase and sprint in one step', async () => {
    tasks = [task('NEX-1')]
    const router = await open('?view=list&q=x&assignee=me&priority=high&type=bug&phase=ph1')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Clear filters' })))
    expect(router.state.location.search).toBe('?view=list')
    expect(router.state.historyAction).toBe('PUSH')
  })

  it('nothing matching in the List says so and offers Clear; a stale person too', async () => {
    tasks = [task('NEX-1'), task('NEX-2')]
    await open('?view=list&q=zzz')
    expect(screen.getByText('No tasks match “zzz”.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear search and filters' })).toBeTruthy()
    cleanup()
    await open('?view=list&assignee=u-gone')
    expect(screen.getByText('No tasks match these filters.')).toBeTruthy()
  })

  it('the List sorts needing attention first by default; Sort is a step Back undoes', async () => {
    tasks = [task('NEX-1', { dueAt: '2026-11-20' }), task('NEX-2', { overdue: true })]
    const router = await open('?view=list')
    expect(screen.getByText('List NEX-2 NEX-1')).toBeTruthy()
    await act(async () => fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), { target: { value: 'board' } }))
    expect(router.state.location.search).toBe('?view=list&sort=board')
    expect(screen.queryByRole('combobox', { name: 'Sort' })).toBeTruthy()
  })
})

// Sprints spec §6.1: a third view on agile projects only.
describe('the Sprints view (sprints spec §6.1)', () => {
  const agile = { ...project, methodology: 'agile' } as ProjectSummary
  const sprint = (id: string, name: string, state: Sprint['state']): Sprint => ({ id, projectId: 'p-nex', name, goal: '', startDate: '2026-11-03T00:00:00.000Z', endDate: '2026-11-16T23:59:59.999Z', state })

  it('a waterfall project’s ?view=sprints opens the Board, and the switch offers no Sprints', async () => {
    tasks = [task('NEX-1')]
    await open('?view=sprints')
    expect(screen.getByText('Board NEX-1')).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'Sprints' })).toBeNull()
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label') ?? r.textContent)).toEqual(['Board', 'List'])
  })

  it('an agile project offers Board · List · Sprints; choosing Sprints is a step Back undoes', async () => {
    tasks = [task('NEX-1')]
    const router = await open('?view=board', agile)
    await act(async () => fireEvent.click(screen.getByRole('radio', { name: 'Sprints' })))
    expect(router.state.location.search).toBe('?view=sprints')
    expect(router.state.historyAction).toBe('PUSH')
    expect(screen.getByText(/^Sprints NEX-1/)).toBeTruthy()
  })

  it('hides the sprint select and ignores the address’s sprint (it stays there); the other filters narrow the rows, not the totals', async () => {
    sprints = [sprint('s-1', 'Sprint 14', 'active'), sprint('s-2', 'Sprint 15', 'planned')]
    // NEX-4 is done in no sprint: the view doesn't list it, so the count leaves it out.
    tasks = [task('NEX-1', { sprintId: 's-1', priority: 'high' }), task('NEX-2', { sprintId: 's-2' }), task('NEX-3', { priority: 'high' }), task('NEX-4', { status: 'done', category: 'done', priority: 'high' })]
    const router = await open('?view=sprints&sprint=s-1&priority=high', agile)
    expect(screen.queryByRole('combobox', { name: 'Sprint' })).toBeNull()
    expect(screen.getByText('Sprints NEX-1 NEX-3 NEX-4 of 4')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Showing 2 of 3 tasks · Clear filters')
    expect(router.state.location.search).toBe('?view=sprints&sprint=s-1&priority=high')
    // Going back to the Board, the sprint filter is there again.
    await act(async () => fireEvent.click(screen.getByRole('radio', { name: 'Board' })))
    expect(screen.getByRole('combobox', { name: 'Sprint' })).toBeTruthy()
    expect(screen.getByText('Board NEX-1')).toBeTruthy()
  })

  // Sprints spec §6.2: the sheets behind the section buttons (Task 5).
  it('a manager gets the sprint actions: each opens its sheet over all the project’s sprints and tasks, whatever the filters, and closing it leaves the view', async () => {
    sprints = [sprint('s-1', 'Sprint 14', 'active'), sprint('s-2', 'Sprint 15', 'planned')]
    tasks = [task('NEX-1', { sprintId: 's-1', priority: 'high' }), task('NEX-2', { sprintId: 's-2' }), task('NEX-3')]
    // Only NEX-1 matches the priority; the sheets still count all three.
    await open('?view=sprints&priority=high', agile)
    expect(screen.queryByText(/no actions/)).toBeNull()
    for (const [button, sheet] of [
      ['Create sprint', 'Sheet create new · 3 tasks · 2 sprints'],
      ['Edit Sprint 15', 'Sheet edit Sprint 15 · 3 tasks · 2 sprints'],
      ['Start Sprint 15', 'Sheet start Sprint 15 · 3 tasks · 2 sprints'],
      ['Complete Sprint 14', 'Sheet complete Sprint 14 · 3 tasks'],
      ['Delete Sprint 15', 'Sheet delete Sprint 15 · 3 tasks'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: button }))
      expect(screen.getByText(sheet)).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Close sheet' }))
      expect(screen.queryByText(/^Sheet /)).toBeNull()
    }
  })

  it('someone who may not manage the project’s tasks gets no actions, so no sheets', async () => {
    manager = false
    sprints = [sprint('s-1', 'Sprint 14', 'active'), sprint('s-2', 'Sprint 15', 'planned')]
    tasks = [task('NEX-1', { sprintId: 's-1' })]
    await open('?view=sprints', agile)
    expect(screen.getByText('Sprints NEX-1 of 1 · no actions')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Create sprint' })).toBeNull()
  })
})
