// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSummary } from '@/api/types'
import { TasksTab } from './TasksTab'

// Final review of UX Phase 2: clearing a stale ?archived=1 replaces the entry, so Back still leaves the page.

const project = {
  id: 'p-nex', key: 'NEX', name: 'Nexus Core', status: 'active', methodology: 'waterfall', clientName: 'Spark', managerId: 'u-2', memberIds: [], teamIds: [],
  links: [], startDate: '2026-10-01T00:00:00.000Z', dueDate: '2026-12-01T00:00:00.000Z', channelId: 'c-p-nex', currentPhaseId: null, archivedAt: null, board: undefined,
} as unknown as ProjectSummary
const mutation = { mutateAsync: vi.fn(), error: null }
vi.mock('@/api/tickets', () => ({
  useTickets: () => ({ data: [], isPending: false, isError: false }),
  useArchivedTasks: () => ({ data: [] }),
  useSprints: () => ({ data: [] }),
  useUpdateTask: () => mutation,
  useMoveTask: () => mutation,
}))
vi.mock('@/api/projects', () => ({ useSetBoard: () => mutation }))
vi.mock('@/lib/usePermission', () => ({ usePermission: () => () => true }))
vi.mock('@/pages/projects/ProjectBacklog', () => ({ ProjectBacklog: () => <p>List</p>, BacklogSkeleton: () => null }))
vi.mock('@/pages/projects/ProjectBoard', () => ({ ProjectBoard: () => <p>Board</p>, BoardSkeleton: () => null }))

afterEach(cleanup)

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
