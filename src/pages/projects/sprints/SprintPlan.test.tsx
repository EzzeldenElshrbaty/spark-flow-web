// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSummary, Sprint, TaskView, User } from '@/api/types'
import { sprintDays } from '@/lib/sprints'
import { SprintPlan, type SprintActions } from './SprintPlan'

// Sprints spec §6.1: the Sprints view in the Tasks tab — the active sprint, the planned ones, then Backlog.

window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const mutateAsync = vi.fn<(input: { key: string; patch: { sprintId: string | null } }) => Promise<unknown>>(async () => ({}))
vi.mock('@/api/tickets', () => ({ useUpdateTask: () => ({ mutateAsync, error: null }) }))
// A manager may move tasks (task.manage); a member may not.
let manager = true
vi.mock('@/lib/usePermission', () => ({ usePermission: () => (action: string) => (action === 'task.manage' ? manager : true) }))

const NOW = new Date(2026, 10, 11, 10)
const project = { id: 'p-nex', key: 'NEX', name: 'Nexus Core', methodology: 'agile', managerId: 'u-2', board: undefined } as unknown as ProjectSummary
const users = [{ id: 'u-2', name: 'Nour El-Sayed' }, { id: 'u-3', name: 'Mariam Fathy' }] as User[]

const day = (d: number, m = 10) => new Date(2026, m, d).toISOString()
const end = (d: number, m = 10) => new Date(2026, m, d, 23, 59, 59, 999).toISOString()
const s14: Sprint = { id: 's-nex-1', projectId: 'p-nex', name: 'Sprint 14', goal: 'Rotate refresh tokens and fix the duplicate invoice rows.', startDate: day(3), endDate: end(17), state: 'active' }
const s15: Sprint = { id: 's-nex-2', projectId: 'p-nex', name: 'Sprint 15', goal: 'Audit log for role changes and the first WebSocket load test.', startDate: day(18), endDate: end(1, 11), state: 'planned' }
const s13: Sprint = { id: 's-nex-0', projectId: 'p-nex', name: 'Sprint 13', goal: '', startDate: day(20, 9), endDate: end(2), state: 'closed' }
const s16: Sprint = { id: 's-nex-3', projectId: 'p-nex', name: 'Sprint 16', goal: '', startDate: day(2, 11), endDate: end(15, 11), state: 'planned' }

const category = { backlog: 'todo', todo: 'todo', inProgress: 'inProgress', inReview: 'inProgress', done: 'done' } as const
const task = (key: string, status: keyof typeof category, sprintId: string | null, storyPoints: number | null, rank = 1000) =>
  ({ id: key, key, title: `Task ${key}`, status, category: category[status], sprintId, storyPoints, phaseId: null, assigneeId: null, priority: 'medium', type: 'task', dueAt: null, overdue: false, overEstimate: false, rank, loggedHours: 0, estimateHours: null, archivedAt: null, updatedAt: '2026-11-01T00:00:00.000Z' }) as unknown as TaskView

// As the seed: Sprint 14 has NEX-101…107 (23 points, NEX-103 and NEX-104 done: 4 points), Sprint 15 has NEX-110,
// NEX-108 and NEX-109 are in no sprint. Plus a done task in no sprint and one in the closed Sprint 13.
const TASKS = [
  task('NEX-101', 'inReview', 's-nex-1', 5),
  task('NEX-102', 'todo', 's-nex-1', 3),
  task('NEX-103', 'done', 's-nex-1', 2),
  task('NEX-104', 'done', 's-nex-1', 2, 2000),
  task('NEX-105', 'inReview', 's-nex-1', 8, 2000),
  task('NEX-106', 'todo', 's-nex-1', 3, 2000),
  task('NEX-107', 'inProgress', 's-nex-1', null),
  task('NEX-108', 'backlog', null, null),
  task('NEX-109', 'backlog', null, 3, 2000),
  task('NEX-110', 'todo', 's-nex-2', 5, 3000),
  task('NEX-111', 'done', null, 1, 3000),
  task('NEX-112', 'todo', 's-nex-0', 2, 4000),
]

const fakeActions = () => ({ create: vi.fn(), edit: vi.fn(), start: vi.fn(), complete: vi.fn(), remove: vi.fn() })

function mount({ tasks = TASKS, allTasks = TASKS, sprints = [s14, s15, s13], actions = null }: { tasks?: TaskView[]; allTasks?: TaskView[]; sprints?: Sprint[]; actions?: SprintActions } = {}) {
  return render(
    <MemoryRouter initialEntries={['/w/engineering/p/NEX/tasks?view=sprints']}>
      <SprintPlan project={project} tasks={tasks} allTasks={allTasks} sprints={sprints} users={users} actions={actions} />
    </MemoryRouter>,
  )
}

const section = (name: string) => screen.getByRole('region', { name })
const keysIn = (name: string) => within(section(name)).queryAllByRole('link').map((a) => /[A-Z]+-\d+/.exec(a.textContent ?? '')![0])

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  manager = true
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  mutateAsync.mockReset()
  mutateAsync.mockImplementation(async () => ({}))
})

describe('the Sprints view’s sections (sprints spec §6.1)', () => {
  it('shows Sprint 14 (Active, its dates, days left, goal and totals), Sprint 15 (Planned), then Backlog; no closed sprint', () => {
    mount()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Sprint 14', 'Sprint 15', 'Backlog'])
    const active = within(section('Sprint 14'))
    expect(active.getByText('Active')).toBeTruthy()
    expect(active.getByText('3 Nov – 17 Nov')).toBeTruthy()
    expect(active.getByText(sprintDays(s14, NOW))).toBeTruthy()
    expect(sprintDays(s14, NOW)).toBe('6 days left')
    expect(active.getByText(s14.goal)).toBeTruthy()
    expect(active.getByText('7 tasks · 23 points · 4 points done')).toBeTruthy()
    const planned = within(section('Sprint 15'))
    expect(planned.getByText('Planned')).toBeTruthy()
    expect(planned.getByText('18 Nov – 1 Dec')).toBeTruthy()
    expect(planned.getByText('1 task · 5 points')).toBeTruthy()
    expect(planned.queryByText(/left|Ended/)).toBeNull()
    const backlog = within(section('Backlog'))
    expect(backlog.getByText('Tasks in no sprint')).toBeTruthy()
    expect(backlog.getByText('2 tasks')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Sprint 13' })).toBeNull()
  })

  it('an active sprint past its end says how long ago it ended', () => {
    mount({ sprints: [{ ...s14, endDate: end(9) }] })
    expect(within(section('Sprint 14')).getByText('Ended 2 days ago')).toBeTruthy()
  })

  it('rows follow the board’s order: columns, then rank', () => {
    mount()
    expect(keysIn('Sprint 14')).toEqual(['NEX-102', 'NEX-106', 'NEX-107', 'NEX-101', 'NEX-105', 'NEX-103', 'NEX-104'])
  })

  it('Backlog lists unfinished tasks with no sprint only', () => {
    mount()
    expect(keysIn('Backlog')).toEqual(['NEX-108', 'NEX-109'])
    expect(screen.queryByText('Task NEX-111')).toBeNull()
    expect(screen.queryByText('Task NEX-112')).toBeNull()
  })

  it('section totals ignore the filters; rows follow them', () => {
    const shown = TASKS.filter((t) => t.key === 'NEX-101' || t.key === 'NEX-108')
    mount({ tasks: shown })
    expect(keysIn('Sprint 14')).toEqual(['NEX-101'])
    expect(within(section('Sprint 14')).getByText('7 tasks · 23 points · 4 points done')).toBeTruthy()
    expect(keysIn('Sprint 15')).toEqual([])
    expect(within(section('Sprint 15')).getByText('No tasks match these filters.')).toBeTruthy()
    expect(within(section('Sprint 15')).getByText('1 task · 5 points')).toBeTruthy()
    expect(keysIn('Backlog')).toEqual(['NEX-108'])
    expect(within(section('Backlog')).getByText('2 tasks')).toBeTruthy()
  })

  it('an empty planned sprint shows “Drag tasks here, or use a task’s Move to.”', () => {
    mount({ sprints: [s14, s15, s16] })
    expect(within(section('Sprint 16')).getByText('Drag tasks here, or use a task’s Move to.')).toBeTruthy()
    expect(within(section('Sprint 16')).getByText('0 tasks · 0 points')).toBeTruthy()
  })

  it('no sprints: “No sprints yet.” with Create sprint for a manager, without for a member', () => {
    const actions = fakeActions()
    mount({ sprints: [], actions })
    expect(screen.getByText('No sprints yet.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Create sprint' }))
    expect(actions.create).toHaveBeenCalledTimes(1)
    // The tasks are all in the backlog until there's a sprint.
    expect(section('Backlog')).toBeTruthy()
    cleanup()
    manager = false
    mount({ sprints: [] })
    expect(screen.getByText('No sprints yet.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Create sprint' })).toBeNull()
  })

  it('Create sprint sits under the last planned sprint, above Backlog', () => {
    mount({ actions: fakeActions() })
    const create = screen.getByRole('button', { name: 'Create sprint' })
    expect(section('Sprint 15').compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(create.compareDocumentPosition(section('Backlog')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('who sees what (sprints spec §6.1)', () => {
  it('a member sees no handles, no Move to, no Start, Complete or ⋯', () => {
    manager = false
    mount()
    expect(keysIn('Sprint 14')).toHaveLength(7)
    expect(screen.queryAllByRole('button')).toEqual([])
  })

  it('a manager gets a drag handle and Move to on every row', () => {
    mount()
    expect(screen.getAllByRole('button', { name: /^Drag NEX-/ })).toHaveLength(10)
    expect(screen.getAllByRole('button', { name: /^Move to: NEX-/ })).toHaveLength(10)
    // No sprint actions until someone may change sprints.
    expect(screen.queryByRole('button', { name: /Start sprint|Complete sprint|Sprint actions/ })).toBeNull()
  })
})

describe('Move to (sprints spec §6.1)', () => {
  const openMoveTo = (key: string) => {
    fireEvent.click(screen.getByRole('button', { name: `Move to: ${key}` }))
    return screen.getByRole('menu', { name: `Move ${key} to` })
  }

  it('lists the other active and planned sprints and Backlog, and saves the task’s sprintId', async () => {
    mount({ sprints: [s14, s15, s13, s16] })
    let menu = openMoveTo('NEX-108')
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent?.trim())).toEqual(['Sprint 14', 'Sprint 15', 'Sprint 16'])
    await act(async () => fireEvent.click(within(menu).getByRole('menuitem', { name: 'Sprint 15' })))
    expect(mutateAsync).toHaveBeenCalledWith({ key: 'NEX-108', patch: { sprintId: 's-nex-2' } })
    menu = openMoveTo('NEX-102')
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent?.trim())).toEqual(['Sprint 15', 'Sprint 16', 'Backlog'])
    await act(async () => fireEvent.click(within(menu).getByRole('menuitem', { name: 'Backlog' })))
    expect(mutateAsync).toHaveBeenLastCalledWith({ key: 'NEX-102', patch: { sprintId: null } })
  })

  it('shows the move at once, and a refused move goes back and says why', async () => {
    let refuse!: (e: Error) => void
    mutateAsync.mockImplementation(() => new Promise((_, reject) => (refuse = reject)))
    mount()
    const menu = openMoveTo('NEX-108')
    await act(async () => fireEvent.click(within(menu).getByRole('menuitem', { name: 'Sprint 15' })))
    expect(keysIn('Sprint 15')).toEqual(['NEX-108', 'NEX-110'])
    await act(async () => refuse(new Error('That sprint is closed. Pick a planned or running one.')))
    expect(keysIn('Backlog')).toEqual(['NEX-108', 'NEX-109'])
    expect(screen.getByRole('alert').textContent).toBe('That sprint is closed. Pick a planned or running one.')
  })
})

describe('sprint actions (sprints spec §6.1; the sheets are Task 5’s)', () => {
  const openMenu = (name: string) => {
    fireEvent.click(within(section(name)).getByRole('button', { name: `Sprint actions: ${name}` }))
    return screen.getByRole('menu', { name: 'Sprint actions' })
  }

  it('Start sprint shows on a planned sprint only while none is active; Complete sprint on the active one', () => {
    const actions = fakeActions()
    mount({ actions })
    expect(screen.queryByRole('button', { name: 'Start sprint' })).toBeNull()
    fireEvent.click(within(section('Sprint 14')).getByRole('button', { name: 'Complete sprint' }))
    expect(actions.complete).toHaveBeenCalledWith(s14)
    cleanup()
    mount({ sprints: [{ ...s14, state: 'closed' }, s15, s16], actions })
    expect(screen.queryByRole('button', { name: 'Complete sprint' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Start sprint' })).toHaveLength(2)
    fireEvent.click(within(section('Sprint 15')).getByRole('button', { name: 'Start sprint' }))
    expect(actions.start).toHaveBeenCalledWith(s15)
  })

  it('⋯ holds Edit sprint, and Delete sprint on a planned sprint only', () => {
    const actions = fakeActions()
    mount({ actions })
    let menu = openMenu('Sprint 14')
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent?.trim())).toEqual(['Edit sprint'])
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Edit sprint' }))
    expect(actions.edit).toHaveBeenCalledWith(s14)
    menu = openMenu('Sprint 15')
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent?.trim())).toEqual(['Edit sprint', 'Delete sprint'])
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Delete sprint' }))
    expect(actions.remove).toHaveBeenCalledWith(s15)
  })

  it('the sprint buttons are secondary: no red primary in the view', () => {
    mount({ actions: fakeActions() })
    for (const b of screen.getAllByRole('button')) expect(b.className).not.toContain('bg-brand-500')
  })
})
