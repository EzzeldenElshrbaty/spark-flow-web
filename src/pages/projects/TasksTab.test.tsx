// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Phase, ProjectSummary, Sprint, TaskView, User } from '@/api/types'
import { useUiStore } from '@/lib/uiStore'
import type { SprintActions } from './sprints/SprintPlan'
import { TasksTab } from './TasksTab'

// Final review of UX Phase 2: clearing a stale ?archived=1 replaces the entry, so Back still leaves the page.

const project = {
  id: 'p-nex', key: 'NEX', name: 'Nexus Core', status: 'active', methodology: 'waterfall', clientName: 'Spark', managerId: 'u-2', memberIds: [], teamIds: [],
  links: [], startDate: '2026-10-01T00:00:00.000Z', dueDate: '2026-12-01T00:00:00.000Z', channelId: 'c-p-nex', currentPhaseId: null, archivedAt: null, board: undefined,
} as unknown as ProjectSummary
const mutation = { mutateAsync: vi.fn(), error: null }
let tasks: TaskView[] = []
let sprints: Sprint[] | undefined = [] // undefined while they load
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
  useUiStore.setState({ lastFilters: {}, lastProjectView: {} })
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

async function open(search: string, of: ProjectSummary = project, phases: Phase[] = [], people: User[] = []) {
  const router = createMemoryRouter([{ path: '/w/:ws/p/:projectKey/:tab', element: <TasksTab project={of} people={people} phases={phases} /> }], {
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
const agile = { ...project, methodology: 'agile' } as ProjectSummary
const sprint = (id: string, name: string, state: Sprint['state'], over: Partial<Sprint> = {}): Sprint => ({ id, projectId: 'p-nex', name, goal: '', startDate: '2026-11-03T00:00:00.000Z', endDate: '2026-11-16T23:59:59.999Z', state, ...over })

describe('the Sprints view (sprints spec §6.1)', () => {
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

// Sprints spec §6.3: an agile project's Board and List open on the running sprint.
describe('the Board opens on the active sprint (sprints spec §6.3)', () => {
  const phase = (id: string, order: number): Phase => ({ id, projectId: 'p-nex', name: `Phase ${order}`, order, startDate: '2026-10-01T00:00:00.000Z', dueDate: '2026-11-30T00:00:00.000Z', status: 'inProgress' })
  // Sprint 14 runs, Sprint 15 is planned; NEX-3 is in neither.
  const plan = () => {
    sprints = [sprint('s-nex-1', 'Sprint 14', 'active'), sprint('s-nex-2', 'Sprint 15', 'planned')]
    tasks = [task('NEX-1', { sprintId: 's-nex-1' }), task('NEX-2', { sprintId: 's-nex-2' }), task('NEX-3')]
  }
  const sprintSelect = () => screen.getByRole('combobox', { name: 'Sprint' }) as HTMLSelectElement

  // The default isn't written into the address (it would outlive the sprint), so the Board follows the running sprint.
  it('an agile project’s Board opens on Sprint 14 and leaves the address without a sprint', async () => {
    plan()
    const router = await open('?view=board', agile)
    expect(router.state.location.search).toBe('?view=board')
    expect(router.state.historyAction).toBe('POP')
    expect(sprintSelect().value).toBe('s-nex-1')
    expect(screen.getByText('Board NEX-1')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Showing 1 of 3 tasks · Clear filters')
    cleanup()
    await open('?view=list', agile)
    expect(screen.getByText('List NEX-1')).toBeTruthy()
  })

  it('when the running sprint changes, the Board follows it: Sprint 15 after Sprint 14, with no sprint in the address', async () => {
    plan()
    // As the Sprints view opens, then Sprint 14 is completed and Sprint 15 started.
    const router = await open('?view=sprints', agile)
    expect(router.state.location.search).toBe('?view=sprints')
    sprints = [sprint('s-nex-1', 'Sprint 14', 'closed'), sprint('s-nex-2', 'Sprint 15', 'active')]
    await act(async () => fireEvent.click(screen.getByRole('radio', { name: 'Board' })))
    expect(router.state.location.search).toBe('?view=board')
    expect(sprintSelect().value).toBe('s-nex-2')
    expect(screen.getByText('Board NEX-2')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Showing 1 of 3 tasks · Clear filters')
  })

  it('the address wins: a sprint in it stays, and a remembered sprint comes before the active one', async () => {
    plan()
    const router = await open('?view=board&sprint=s-nex-2', agile)
    expect(router.state.location.search).toBe('?view=board&sprint=s-nex-2')
    expect(screen.getByText('Board NEX-2')).toBeTruthy()
    cleanup()
    useUiStore.getState().setProjectFilters('NEX', { sprint: 's-nex-2' })
    expect((await open('?view=board', agile)).state.location.search).toBe('?view=board&sprint=s-nex-2')
  })

  // Open in project, for a task in no sprint (sprints final review).
  it('an empty sprint in the address is All sprints for this visit: not remembered, and Clear filters keeps it', async () => {
    plan()
    const router = await open('?view=board&sprint=&priority=high', agile)
    expect(router.state.location.search).toBe('?view=board&sprint=&priority=high')
    expect(sprintSelect().value).toBe('')
    expect(useUiStore.getState().lastFilters.NEX).toBeUndefined()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Clear filters' })))
    expect(router.state.location.search).toBe('?view=board&sprint=')
    expect(screen.getByText('Board NEX-1 NEX-2 NEX-3')).toBeTruthy()
    expect(useUiStore.getState().lastFilters.NEX?.sprint).toBeUndefined()
    cleanup()
    // Opened again without it, the tab is on the running sprint.
    await open('?view=board', agile)
    expect(sprintSelect().value).toBe('s-nex-1')
  })

  it('choosing All sprints is remembered: reopening the tab stays on All sprints', async () => {
    plan()
    const router = await open('?view=board', agile)
    await act(async () => fireEvent.change(sprintSelect(), { target: { value: '' } }))
    // The address had no sprint, so choosing All sprints changes it by nothing and adds no step.
    expect(router.state.location.search).toBe('?view=board')
    expect(router.state.historyAction).toBe('POP')
    expect(screen.getByText('Board NEX-1 NEX-2 NEX-3')).toBeTruthy()
    expect(useUiStore.getState().lastFilters.NEX?.sprint).toBe('')
    cleanup()
    const reopened = await open('?view=board', agile)
    expect(reopened.state.location.search).toBe('?view=board')
    expect(sprintSelect().value).toBe('')
    expect(screen.getByText('Board NEX-1 NEX-2 NEX-3')).toBeTruthy()
  })

  // Ruling 11 (sprints final review): picking the running sprint is choosing the default, so the tab keeps following it.
  it('picking the running sprint is no pick: pick Sprint 15, then Sprint 14 again, and the Board follows Sprint 15 once it starts', async () => {
    plan()
    const router = await open('?view=board', agile)
    await act(async () => fireEvent.change(sprintSelect(), { target: { value: 's-nex-2' } }))
    expect(router.state.location.search).toBe('?view=board&sprint=s-nex-2')
    expect(useUiStore.getState().lastFilters.NEX?.sprint).toBe('s-nex-2')
    await act(async () => fireEvent.change(sprintSelect(), { target: { value: 's-nex-1' } }))
    // Out of the address (it's the default) and not remembered; the pick is still a step Back undoes.
    expect(router.state.location.search).toBe('?view=board')
    expect(router.state.historyAction).toBe('PUSH')
    expect(useUiStore.getState().lastFilters.NEX).toEqual({ phase: undefined, sprint: undefined })
    expect(sprintSelect().value).toBe('s-nex-1')
    expect(screen.getByText('Board NEX-1')).toBeTruthy()
    cleanup()
    // Sprint 14 completes and Sprint 15 starts.
    sprints = [sprint('s-nex-1', 'Sprint 14', 'closed'), sprint('s-nex-2', 'Sprint 15', 'active')]
    const reopened = await open('?view=board', agile)
    expect(reopened.state.location.search).toBe('?view=board')
    expect(sprintSelect().value).toBe('s-nex-2')
    expect(screen.getByText('Board NEX-2')).toBeTruthy()
  })

  it('picking the running sprint from All sprints, or where the address names it, is no pick either', async () => {
    plan()
    useUiStore.getState().setProjectFilters('NEX', { sprint: '' })
    await open('?view=board', agile)
    await act(async () => fireEvent.change(sprintSelect(), { target: { value: 's-nex-1' } }))
    expect(useUiStore.getState().lastFilters.NEX?.sprint).toBeUndefined()
    expect(sprintSelect().value).toBe('s-nex-1')
    cleanup()
    // Open in project for a task in no sprint (`sprint=`), then the running sprint picked.
    const router = await open('?view=board&sprint=', agile)
    await act(async () => fireEvent.change(sprintSelect(), { target: { value: 's-nex-1' } }))
    expect(router.state.location.search).toBe('?view=board')
    expect(sprintSelect().value).toBe('s-nex-1')
    cleanup()
    // Open in project for a task in Sprint 14, then a phase picked: the running sprint isn't pinned by it.
    const phases = [phase('ph-1', 1)]
    await open('?view=board&sprint=s-nex-1', agile, phases)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Phase 1' })))
    expect(useUiStore.getState().lastFilters.NEX).toEqual({ phase: 'ph-1', sprint: undefined })
  })

  it('a remembered sprint that’s gone (deleted) is no pick: the Board opens on the running sprint', async () => {
    plan()
    useUiStore.getState().setProjectFilters('NEX', { sprint: 's-gone' })
    const router = await open('?view=board', agile)
    expect(router.state.location.search).toBe('?view=board')
    expect(sprintSelect().value).toBe('s-nex-1')
    expect(screen.getByText('Board NEX-1')).toBeTruthy()
  })

  it('Clear filters takes the opening sprint off too, and it stays off', async () => {
    plan()
    for (const view of ['list', 'board'] as const) {
      const router = await open(`?view=${view}`, agile)
      expect(sprintSelect().value).toBe('s-nex-1')
      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Clear filters' })))
      expect(router.state.location.search).toBe(`?view=${view}`)
      expect(sprintSelect().value).toBe('')
      expect(screen.getByText(`${view === 'list' ? 'List' : 'Board'} NEX-1 NEX-2 NEX-3`)).toBeTruthy()
      // Taking a sprint filter off is a pick: All sprints.
      expect(useUiStore.getState().lastFilters.NEX).toEqual({ sprint: '' })
      cleanup()
      useUiStore.setState({ lastFilters: {} })
    }
  })

  // '' means All sprints was chosen; what isn't that choice leaves the remembered sprint as it was.
  it('Clear filters with no sprint filter on keeps the remembered sprint as it was', async () => {
    // Only a planned sprint: nothing is filtered, nothing remembered.
    sprints = [sprint('s-nex-2', 'Sprint 15', 'planned')]
    tasks = [task('NEX-1', { priority: 'high' }), task('NEX-2')]
    await open('?view=list&priority=high', agile)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Clear filters' })))
    expect(useUiStore.getState().lastFilters.NEX?.sprint).toBeUndefined()
    cleanup()
    // A remembered All sprints stays All sprints, though a sprint is active now.
    plan()
    useUiStore.getState().setProjectFilters('NEX', { sprint: '' })
    await open('?view=list&priority=high', agile)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Clear filters' })))
    expect(useUiStore.getState().lastFilters.NEX?.sprint).toBe('')
  })

  it('Clear filters in the Sprints view isn’t a choice of All sprints: the Board still opens on the active sprint', async () => {
    plan()
    const phases = [phase('ph-1', 1), phase('ph-2', 2)]
    const router = await open('?view=sprints&phase=ph-1', agile, phases)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Clear filters' })))
    expect(router.state.location.search).not.toContain('phase')
    expect(useUiStore.getState().lastFilters.NEX?.sprint).toBeUndefined()
    await act(async () => fireEvent.click(screen.getByRole('radio', { name: 'Board' })))
    expect(sprintSelect().value).toBe('s-nex-1')
    expect(screen.getByText('Board NEX-1')).toBeTruthy()
    cleanup()
    // Reopened, still the active sprint, and still not in the address.
    expect((await open('?view=board', agile, phases)).state.location.search).toBe('?view=board')
    expect(sprintSelect().value).toBe('s-nex-1')
  })

  it('picking a phase keeps the sprint on screen, but never pins the sprint that was only the default', async () => {
    plan()
    const phases = [phase('ph-1', 1), phase('ph-2', 2)]
    const router = await open('?view=board', agile, phases)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Phase 2' })))
    expect(router.state.location.search).toBe('?view=board&phase=ph-2')
    // The active sprint stays unremembered: when Sprint 15 starts, the tab follows it.
    expect(useUiStore.getState().lastFilters.NEX).toEqual({ phase: 'ph-2', sprint: undefined })
    // A sprint picked by hand is remembered with the phase.
    await act(async () => fireEvent.change(sprintSelect(), { target: { value: 's-nex-2' } }))
    expect(useUiStore.getState().lastFilters.NEX).toEqual({ phase: 'ph-2', sprint: 's-nex-2' })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Phase 1' })))
    expect(useUiStore.getState().lastFilters.NEX).toEqual({ phase: 'ph-1', sprint: 's-nex-2' })
    // On All sprints, a phase pick keeps All sprints.
    await act(async () => fireEvent.change(sprintSelect(), { target: { value: '' } }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Phase 2' })))
    expect(useUiStore.getState().lastFilters.NEX).toEqual({ phase: 'ph-2', sprint: '' })
  })

  it('a phase picked while no sprint is on screen doesn’t choose All sprints: a sprint that starts later opens the Board', async () => {
    const phases = [phase('ph-1', 1), phase('ph-2', 2)]
    // Only a planned sprint, so nothing is filtered.
    sprints = [sprint('s-nex-2', 'Sprint 15', 'planned')]
    tasks = [task('NEX-1', { sprintId: 's-nex-2' }), task('NEX-2')]
    await open('?view=board', agile, phases)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Phase 2' })))
    expect(useUiStore.getState().lastFilters.NEX).toEqual({ phase: 'ph-2', sprint: undefined })
    expect(useUiStore.getState().lastFilters.NEX?.sprint).toBeUndefined()
    cleanup()
    // Sprint 15 starts.
    sprints = [sprint('s-nex-2', 'Sprint 15', 'active')]
    const router = await open('?view=board', agile, phases)
    expect(router.state.location.search).toBe('?view=board&phase=ph-2')
    expect(sprintSelect().value).toBe('s-nex-2')
    cleanup()
    // An unknown ?sprint= is no sprint on screen either.
    useUiStore.setState({ lastFilters: {} })
    await open('?view=board&sprint=s-gone', agile, phases)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Phase 1' })))
    expect(useUiStore.getState().lastFilters.NEX?.sprint).toBeUndefined()
  })

  it('an active sprint past its end still opens the Board on it', async () => {
    sprints = [sprint('s-nex-1', 'Sprint 14', 'active', { startDate: '2026-09-01T00:00:00.000Z', endDate: '2026-09-14T23:59:59.999Z' })]
    tasks = [task('NEX-1', { sprintId: 's-nex-1' }), task('NEX-2')]
    const router = await open('?view=board', agile)
    expect(router.state.location.search).toBe('?view=board')
    expect(sprintSelect().value).toBe('s-nex-1')
    expect(screen.getByText('Board NEX-1')).toBeTruthy()
  })

  it('a waterfall project and an agile one with no active sprint are unchanged', async () => {
    tasks = [task('NEX-1', { sprintId: 's-nex-2' }), task('NEX-2')]
    // Waterfall: sprints are none of its business, even when some are listed.
    sprints = [sprint('s-nex-1', 'Sprint 14', 'active')]
    expect((await open('?view=board')).state.location.search).toBe('?view=board')
    expect(screen.getByText('Board NEX-1 NEX-2')).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: 'Sprint' })).toBeNull()
    cleanup()
    // Agile with a planned and a closed sprint: nothing is active.
    sprints = [sprint('s-nex-2', 'Sprint 15', 'planned'), sprint('s-nex-0', 'Sprint 13', 'closed')]
    expect((await open('?view=board', agile)).state.location.search).toBe('?view=board')
    expect(sprintSelect().value).toBe('')
    expect(screen.getByText('Board NEX-1 NEX-2')).toBeTruthy()
    cleanup()
    // Agile with no sprints at all.
    sprints = []
    expect((await open('?view=list', agile)).state.location.search).toBe('?view=list')
    expect(screen.getByText('List NEX-1 NEX-2')).toBeTruthy()
  })

  it('a stale person in the address is dropped, and a remembered sprint still lands in it', async () => {
    plan()
    useUiStore.getState().setProjectFilters('NEX', { sprint: 's-nex-2' })
    const router = await open('?view=list&assignee=u-gone', agile, [], [{ id: 'u-2', name: 'Nour' } as User])
    expect(router.state.location.search).toBe('?view=list&sprint=s-nex-2')
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('shows every task while the sprints are still loading, then the active sprint’s', async () => {
    tasks = [task('NEX-1', { sprintId: 's-nex-1' }), task('NEX-2')]
    sprints = undefined
    const router = await open('?view=board', agile)
    expect(router.state.location.search).toBe('?view=board')
    expect(screen.getByText('Board NEX-1 NEX-2')).toBeTruthy()
    // They load (the next render has them).
    sprints = [sprint('s-nex-1', 'Sprint 14', 'active')]
    await act(async () => fireEvent.click(screen.getByRole('radio', { name: 'List' })))
    expect(router.state.location.search).toBe('?view=list')
    expect(screen.getByText('List NEX-1')).toBeTruthy()
  })
})
