// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSummary } from '@/api/types'
import { ProjectsPage } from './ProjectsPage'

// UX Phase 4, 4.2: Projects in the kit's list pattern — a search, tiles that filter (off while archived projects
// show), a count, and an archived list that says when it couldn't load.

const project = (id: string, name: string, over: Partial<ProjectSummary> = {}) =>
  ({
    id, key: id.toUpperCase(), name, clientName: 'Spark', managerId: 'u-2', status: 'active', dueDate: '2027-03-01T00:00:00.000Z', expectedFinish: '2027-02-01T00:00:00.000Z',
    progress: 0.4, loggedHours: 10, cost: null, overdueCount: 0, currentPhaseId: null, archivedAt: null, ...over,
  }) as unknown as ProjectSummary
const list = [project('nex', 'Nexus Core'), project('mob', 'Mobile App'), project('atl', 'Atlas', { clientName: 'Orbit' }), project('hr', 'HR Portal', { status: 'onHold' })]
const archived = { data: [] as ProjectSummary[], isPending: false, isError: false, refetch: vi.fn() }

vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' } }) }))
vi.mock('@/api/projects', () => ({
  useProjectSummaries: () => ({ data: list, isPending: false, isError: false }),
  useArchivedProjects: () => archived,
  usePhases: () => ({ data: [] }),
}))
vi.mock('@/api/users', () => ({ useUsers: () => ({ data: [] }) }))
vi.mock('@/lib/usePermission', () => ({ usePermission: () => () => false }))
vi.mock('./ProjectSheet', () => ({ ProjectSheet: () => null }))

afterEach(() => {
  cleanup()
  archived.isError = false
})

async function open(search = '') {
  const router = createMemoryRouter([{ path: '/w/:ws/projects', element: <ProjectsPage /> }], { initialEntries: [`/w/engineering/projects${search}`] })
  await act(async () => render(<RouterProvider router={router} />))
  return router
}
const names = () => screen.getAllByRole('row').slice(1).map((row) => row.querySelector('td')?.textContent ?? '')

describe('Projects list (UX Phase 4)', () => {
  it('?q= finds by name, key or client, and the count says so', async () => {
    await open('?q=nex')
    expect(names()).toEqual([expect.stringContaining('Nexus Core')])
    expect(screen.getByRole('status').textContent).toBe('Showing 1 of 4 projects · Clear filters')
    cleanup()
    await open('?q=orbit')
    expect(names()).toEqual([expect.stringContaining('Atlas')])
  })

  it('the tiles are the kit’s filter tiles, and off while archived projects show', async () => {
    const router = await open()
    const onHold = screen.getByRole('button', { name: /On hold/ })
    expect(onHold.getAttribute('aria-pressed')).toBe('false')
    await act(async () => fireEvent.click(onHold))
    expect(router.state.location.search).toBe('?show=onHold')
    cleanup()
    await open('?archived=1')
    expect((screen.getByRole('button', { name: /On hold/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('a failed archived load says so, with Try again', async () => {
    archived.isError = true
    await open('?archived=1')
    expect(screen.getByText(/Archived projects didn’t load/)).toBeTruthy()
    expect(screen.queryByText('No archived projects.')).toBeNull()
  })

  it('nothing matching names the search and clears it', async () => {
    const router = await open('?q=zzz')
    expect(screen.getByText('No projects match “zzz”.')).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' })))
    expect(router.state.location.search).toBe('')
  })
})

describe('Projects opens from the keyboard (UX Phase 5A, 5.6)', () => {
  it('each project’s name in the table is a link to it', async () => {
    await open()
    const table = screen.getByRole('table')
    expect(within(table).getByRole('link', { name: 'Nexus Core' }).getAttribute('href')).toBe('/w/engineering/p/NEX/overview')
  })
})
