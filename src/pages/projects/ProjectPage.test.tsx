// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectPage } from './ProjectPage'

// UX Phase 2, 2.7: a project's sheets live in the address: a link opens one, Back closes it.

const project = {
  id: 'p-nex', key: 'NEX', name: 'Nexus Core', status: 'active', methodology: 'waterfall', clientName: 'Spark', managerId: 'u-2', memberIds: [], teamIds: [],
  links: [], startDate: '2026-10-01T00:00:00.000Z', dueDate: '2026-12-01T00:00:00.000Z', channelId: 'c-p-nex', currentPhaseId: null, archivedAt: null,
}
vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' } }) }))
vi.mock('@/lib/usePermission', () => ({ usePermission: () => () => true }))
vi.mock('@/api/projects', () => ({
  useProjectSummary: () => ({ data: project, isPending: false, isError: false }),
  usePhases: () => ({ data: [], isPending: false, isError: false }),
  useTeams: () => ({ data: [] }),
  useArchiveProject: () => ({ mutateAsync: vi.fn() }),
  useRestoreProject: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}))
vi.mock('@/api/tickets', () => ({ useSprints: () => ({ data: [] }), useTickets: () => ({ data: [] }) }))
vi.mock('@/api/users', () => ({ useMe: () => ({ data: { id: 'u-2', teamIds: [] } }), useUsers: () => ({ data: [] }) }))
const { sheet } = vi.hoisted(() => ({
  sheet:
    (name: string) =>
    ({ onClose }: { onClose: () => void }) => (
      <div role="dialog" aria-label={name}>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    ),
}))
vi.mock('./TaskSheet', () => ({ TaskSheet: sheet('New task') }))
vi.mock('./ProjectSheet', () => ({ ProjectSheet: sheet('Edit project') }))
vi.mock('./PhasesSheet', () => ({ PhasesSheet: sheet('Manage phases') }))
vi.mock('./OverviewTab', () => ({ OverviewTab: () => <p>Overview</p> }))
vi.mock('./TasksTab', () => ({ TasksTab: () => <p>Tasks</p> }))
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

afterEach(cleanup)

const at = (search: string) => {
  const router = createMemoryRouter([{ path: '/w/:ws/p/:projectKey/:tab', element: <ProjectPage /> }], { initialEntries: [`/w/engineering/p/NEX/overview${search}`] })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('a project’s sheets in the address (UX Phase 2, 2.7)', () => {
  it('?new=task, ?edit=project and ?phases=1 open their sheets', () => {
    at('?new=task')
    expect(screen.getByRole('dialog', { name: 'New task' })).toBeTruthy()
    cleanup()
    at('?edit=project')
    expect(screen.getByRole('dialog', { name: 'Edit project' })).toBeTruthy()
    cleanup()
    at('?phases=1')
    expect(screen.getByRole('dialog', { name: 'Manage phases' })).toBeTruthy()
  })

  it('New task adds a step Back closes; Cancel closes it without leaving one', async () => {
    const router = at('')
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: /New task/ })[0]!))
    expect(router.state.location.search).toBe('?new=task')
    await act(() => router.navigate(-1))
    expect(screen.queryByRole('dialog', { name: 'New task' })).toBeNull()
    await act(() => router.navigate(1))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })))
    expect(router.state.location.search).toBe('')
    expect(router.state.historyAction).toBe('REPLACE')
  })
})
