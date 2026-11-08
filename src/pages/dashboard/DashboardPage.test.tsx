// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardProject, DashboardStats, WorkingNow } from '@/api/types'
import { DashboardPage } from './DashboardPage'

// The dashboard for everyone (dashboard slice): charts, overdue tasks and the project cards over the projects in my
// scope; Working now (timer slice 3) lists who has a timer running.

const nex = {
  id: 'p-nex', key: 'NEX', name: 'Nexus Core', status: 'active', managerId: 'u-2', phaseName: 'Build', progress: 0.5, loggedHours: 40, cost: null,
  estimateHours: null, estimatedLoggedHours: 0, expectedFinish: '2026-12-01T00:00:00.000Z', dueDate: '2026-12-01T00:00:00.000Z', overdueCount: 1, overEstimateCount: 2, taskCount: 10, week: [], weekHours: 0,
} as unknown as DashboardProject
const fullStats: DashboardStats = {
  // 23 Oct to 5 Nov, 3 h a day of which 1 h is mine: 42 h in all.
  days: Array.from({ length: 14 }, (_, i) => ({ day: new Date(Date.UTC(2026, 9, 23 + i)).toISOString().slice(0, 10), hours: 3, mine: 1 })),
  byProject: [
    { projectId: 'p-nex', hours: 30 },
    { projectId: 'p-mob', hours: 12 },
  ],
  byStatus: [
    { category: 'todo', count: 4 },
    { category: 'inProgress', count: 2 },
    { category: 'done', count: 3 },
  ],
  attention: [
    { taskId: 't-nex-103', key: 'NEX-103', title: 'Fix duplicate rows', projectId: 'p-nex', assigneeId: 'u-3', dueAt: '2026-01-03T00:00:00.000Z', overdue: true, overEstimate: false, loggedHours: 2, estimateHours: 4 },
    { taskId: 't-nex-105', key: 'NEX-105', title: 'Drag a card', projectId: 'p-nex', assigneeId: null, dueAt: '2099-01-01T00:00:00.000Z', overdue: false, overEstimate: true, loggedHours: 21.9, estimateHours: 6 },
    { taskId: 't-nex-108', key: 'NEX-108', title: 'Load test', projectId: 'p-nex', assigneeId: 'u-6', dueAt: null, overdue: false, overEstimate: true, loggedHours: 5, estimateHours: 4 },
  ],
}
let working: WorkingNow[] = []
let projects: DashboardProject[] = [nex]
let everyProject = false
const loaded = <T,>(data: T) => ({ data, isPending: false, isError: false, refetch: vi.fn() })
vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' } }) }))
let meId = 'u-2'
let grants: string[] = ['checkins.managed']
vi.mock('@/lib/useRole', () => ({ useRole: () => ({ persona: { id: meId }, grants }) }))
vi.mock('@/lib/usePermission', () => ({ usePermission: () => (action: string) => action !== 'dashboard.everyProject' || everyProject }))
vi.mock('@/api/projects', () => ({
  useProjectSummaries: () =>
    loaded([
      { id: 'p-nex', name: 'Nexus Core', managerId: 'u-2' },
      { id: 'p-mob', name: 'Mobile App', managerId: 'u-4' },
    ]),
}))
vi.mock('@/api/dashboard', () => ({ useDashboard: () => loaded(projects), useWorkingNow: () => loaded(working), useDashboardStats: () => loaded(fullStats) }))
vi.mock('@/api/users', () => ({ useUsers: () => ({ data: [{ id: 'u-3', name: 'Mariam Fathy' }, { id: 'u-6', name: 'Hossam Adel' }] }) }))
vi.mock('@/api/tickets', () => ({ useTasksOf: () => ({ data: [{ id: 't-nex-106', key: 'NEX-106', title: 'Offline cache' }] }) }))
// The charts measure their width; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

beforeEach(() => {
  working = []
  projects = [nex]
  everyProject = false
  meId = 'u-2'
  grants = ['checkins.managed']
})
afterEach(cleanup)

function Address() {
  const { pathname, search } = useLocation()
  return <p data-testid="address">{pathname + search}</p>
}
const show = () =>
  render(
    <MemoryRouter initialEntries={['/w/engineering/dashboard']}>
      <DashboardPage />
      <Address />
    </MemoryRouter>,
  )

describe('Working now (timer slice 3)', () => {
  it('lists people with a running timer: who, since when, and on what', () => {
    working = [
      { userId: 'u-3', taskId: 't-nex-106', projectId: 'p-nex', startedAt: '2026-11-05T08:00:00.000Z' },
      { userId: 'u-6', taskId: null, projectId: 'p-nex', startedAt: '2026-11-05T07:30:00.000Z' },
    ]
    show()
    const card = screen.getByRole('heading', { name: 'Working now' }).closest('section, div')!.parentElement!
    const items = within(card).getAllByRole('listitem').map((li) => li.textContent)
    expect(items[0]).toMatch(/Mariam Fathy · since \d+:00 [AP]MNEX-106 · Offline cache/)
    expect(items[1]).toMatch(/Hossam Adel · since \d+:30 [AP]MNexus Core/)
    // Each row counts up from its start (useNow, not a counter).
    expect(within(card).getAllByRole('timer')).toHaveLength(2)
  })

  it("each row's count is the time since its timer started", () => {
    working = [{ userId: 'u-3', taskId: 't-nex-106', projectId: 'p-nex', startedAt: new Date(Date.now() - 3_600_000).toISOString() }]
    show()
    expect(screen.getByRole('timer').textContent).toMatch(/^1:00:0\d$/)
    // The tile says how many, as Checked in now did.
    expect(screen.getByText('Working now', { selector: 'p, span, dt, div' })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/[Cc]hecked in/)
  })

  it('says so when nobody has a timer running', () => {
    show()
    expect(screen.getByText('Nobody has a timer running.')).toBeTruthy()
  })
})

describe('the dashboard for everyone (dashboard slice)', () => {
  it('charts: "{n} logged in 14 days" columns (scope red, mine grey), Hours by project, Tasks by status', () => {
    show()
    // Hours per day: everyone in scope stacked on my own hours; the title is the takeaway.
    const days = screen.getByRole('heading', { name: '42h logged in 14 days' }).closest('div.rounded-xl') as HTMLElement
    expect(within(days).getByRole('group', { name: 'Hours per day' })).toBeTruthy()
    const swatch = (label: string) => (within(days).getByText(label).firstElementChild as HTMLElement).style.background
    expect(swatch('Everyone else')).toBe('var(--chart-primary)')
    expect(swatch('You')).toBe('var(--chart-context)')

    const byProject = screen.getByRole('heading', { name: 'Nexus Core had the most hours' }).closest('div.rounded-xl') as HTMLElement
    expect(within(byProject).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual(['Nexus Core: 30h', 'Mobile App: 12h'])

    const byStatus = screen.getByRole('heading', { name: '3 tasks done in 14 days' }).closest('div.rounded-xl') as HTMLElement
    expect(within(byStatus).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual(['To do: 4', 'In progress: 2', 'Done in 14 days: 3'])
  })

  it('Overdue tasks table opens the task inspector', () => {
    show()
    const table = screen.getByRole('table', { name: 'Overdue tasks' })
    const row = within(table).getByText('Fix duplicate rows').closest('tr')!
    expect(row.textContent).toMatch(/NEX-103.*Fix duplicate rows.*Nexus Core.*Mariam Fathy.*3 Jan 2026/)
    // Not yet due, so over its estimate: the due date isn't the problem.
    expect(within(table).getByText('Drag a card').closest('tr')!.textContent).toMatch(/—Over estimate · 1 Jan 2099$/)
    expect(within(table).getByText('Load test').closest('tr')!.textContent).toMatch(/Over estimate$/)
    fireEvent.click(row)
    expect(screen.getByTestId('address').textContent).toBe('/w/engineering/dashboard?ticket=NEX-103')
    // The key is the row's link for the keyboard.
    expect(within(table).getByRole('link', { name: 'NEX-103' }).getAttribute('href')).toBe('/w/engineering/dashboard?ticket=NEX-103')
  })

  it('Working now only for whoever can see a timer on these projects: everyone\'s, or those on projects they manage', () => {
    meId = 'u-3' // a Member on Nexus Core, which Nour manages
    show()
    expect(screen.queryByRole('heading', { name: 'Working now' })).toBeNull()
    cleanup()
    grants = ['checkins.all']
    show()
    expect(screen.getByRole('heading', { name: 'Working now' })).toBeTruthy()
  })

  it("the 7-day tile and each card add everyone's hours, even when the card names only mine", () => {
    projects = [{ ...nex, week: [{ userId: 'u-3', hours: 2 }], weekHours: 6.5 }]
    show()
    expect(screen.getByText('Hours, last 7 days').parentElement!.textContent).toBe('Hours, last 7 days6.5h')
    expect(screen.getByText(/^Last 7 days/).textContent).toBe('Last 7 days · 6.5h')
    cleanup()
    // Time logged by others only: the card doesn't say none was logged.
    projects = [{ ...nex, week: [], weekHours: 4 }]
    show()
    expect(screen.queryByText('No time logged.')).toBeNull()
  })

  it('"You\'re not on any projects yet." with no scope', () => {
    projects = []
    show()
    expect(screen.getByText('You’re not on any projects yet.')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Hours per day' })).toBeNull()
    expect(screen.queryByRole('table', { name: 'Overdue tasks' })).toBeNull()
    expect(screen.getByText('The projects you manage or work on.')).toBeTruthy()
  })
})
