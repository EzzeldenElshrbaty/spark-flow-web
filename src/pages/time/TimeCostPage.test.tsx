// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TimeReport } from '@/api/types'
import { TimeCostPage } from './TimeCostPage'

// UX Phase 4, 4.7: Time & cost's filters on one row, tables that sort by column, a list on phones, and empty text that
// names the filter.

const report: TimeReport = {
  from: '2026-11-02', to: '2026-11-09',
  totals: { hours: 30, cost: 9000, people: 2 },
  byProject: [
    { projectId: 'p-nex', hours: 20, cost: 6000 },
    { projectId: 'p-mob', hours: 10, cost: 3000 },
  ],
  byPerson: [
    { userId: 'u-3', rate: 300, hours: 12, cost: 3600 },
    { userId: 'u-6', rate: 300, hours: 18, cost: 5400 },
  ],
  byWeek: [{ weekStart: '2026-11-01', hours: 30, cost: 9000 }],
}
const query = { data: report as TimeReport | undefined, isError: false, isPlaceholderData: false, refetch: vi.fn() }
const projects = [
  { id: 'p-nex', key: 'NEX', name: 'Nexus Core' },
  { id: 'p-mob', key: 'MOB', name: 'Mobile App' },
]
vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' } }) }))
vi.mock('@/lib/usePermission', () => ({ useAccess: () => 'allowed' }))
vi.mock('@/api/time', () => ({ useTimeReport: () => query }))
vi.mock('@/api/users', () => ({ useUsers: () => ({ data: [{ id: 'u-3', name: 'Mariam Fathy' }, { id: 'u-6', name: 'Hossam Adel' }] }) }))
vi.mock('@/api/projects', () => ({ useProjectSummaries: () => ({ data: projects }), useArchivedProjects: () => ({ data: [] }) }))
vi.mock('@/api/audit', () => ({ noteExport: vi.fn() }))

afterEach(() => {
  cleanup()
  query.data = report
  query.isPlaceholderData = false
})

async function open(search = '') {
  const router = createMemoryRouter([{ path: '/w/:ws/time', element: <TimeCostPage /> }], { initialEntries: [`/w/engineering/time${search}`] })
  await act(async () => render(<RouterProvider router={router} />))
  return router
}

describe('Time & cost (UX Phase 4)', () => {
  it('period, project and Export CSV share one row; the project drop-down isn’t full width', async () => {
    await open()
    const project = screen.getByRole('combobox', { name: 'Project' })
    const row = project.parentElement!
    expect(within(row).getByRole('radiogroup', { name: 'Period' })).toBeTruthy()
    expect(within(row).getByRole('button', { name: /Export CSV/ })).toBeTruthy()
    expect(project.className.split(' ')).not.toContain('w-full')
  })

  it('a header sorts the table and is a step Back undoes', async () => {
    const router = await open('?by=person')
    const table = screen.getByRole('table', { name: 'Hours by person' })
    // Each name follows its avatar's two initials.
    const names = () => within(screen.getByRole('table', { name: 'Hours by person' })).getAllByRole('row').slice(1).map((r) => r.querySelector('td')?.textContent?.slice(2))
    expect(names()).toEqual(['Mariam Fathy', 'Hossam Adel'])
    await act(async () => fireEvent.click(within(table).getByRole('button', { name: 'Hours' })))
    expect(router.state.location.search).toBe('?by=person&sort=hours&dir=asc')
    expect(router.state.historyAction).toBe('PUSH')
    await act(async () => fireEvent.click(within(screen.getByRole('table', { name: 'Hours by person' })).getByRole('button', { name: 'Hours' })))
    expect(names()).toEqual(['Hossam Adel', 'Mariam Fathy'])
  })

  it('each table has a list for phones', async () => {
    await open()
    expect(screen.getByRole('list', { name: 'Hours by project' }).className).toContain('sm:hidden')
  })

  it('with nothing logged, the empty text names the project and the period', async () => {
    query.data = { ...report, totals: { hours: 0, cost: 0, people: 0 }, byProject: [], byPerson: [] }
    await open('?project=p-nex&days=7')
    expect(screen.getByText('No time logged on Nexus Core in the last 7 days.')).toBeTruthy()
  })

  it('Export CSV waits while the report shown is the last period’s (UX Phase 4, 4.5)', async () => {
    query.isPlaceholderData = true
    await open()
    expect((screen.getByRole('button', { name: /Export CSV/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('while the last period’s report shows, its missing-rate line dims with it (UX Phase 6, deferred minor #20)', async () => {
    query.data = { ...report, byPerson: [{ userId: 'u-3', rate: 0, hours: 12, cost: 0 }] }
    query.isPlaceholderData = true
    await open()
    expect(screen.getByText(/1 person has no hourly cost/).closest('p')!.className).toContain('opacity-60')
  })

  it('the empty text names the period on screen, not the one still loading (UX Phase 6, deferred minor #20)', async () => {
    query.data = { ...report, byProject: [], byPerson: [], totals: { hours: 0, cost: 0, people: 0 } }
    const router = await open('?days=7')
    expect(screen.getByText('No time logged in the last 7 days.')).toBeTruthy()
    query.isPlaceholderData = true
    await act(() => router.navigate('/w/engineering/time?days=30'))
    expect(screen.getByText('No time logged in the last 7 days.')).toBeTruthy()
  })
})

