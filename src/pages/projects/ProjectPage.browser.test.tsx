import '@/index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { ProjectPage } from './ProjectPage'

// UX Phase 5B (5.1): on a 390px phone a project's content starts in the top third, the tabs stick under the top bar
// with the project's name once the header has scrolled away, and the pinned action shows on Overview and Tasks only.

const project = {
  id: 'p-nex', key: 'NEX', name: 'Nexus Core', status: 'active', methodology: 'waterfall', clientName: 'Spark Systems (internal)', managerId: 'u-2', memberIds: [], teamIds: [],
  links: [{ label: 'Staging', url: 'https://staging.example.com' }], startDate: '2026-10-01T00:00:00.000Z', dueDate: '2026-12-01T00:00:00.000Z', channelId: 'c-p-nex', currentPhaseId: 'ph-1', archivedAt: null,
}
const phases = [
  { id: 'ph-1', projectId: 'p-nex', name: 'Build', order: 1, startDate: '2026-10-01T00:00:00.000Z', dueDate: '2026-11-20T00:00:00.000Z', status: 'inProgress' },
  { id: 'ph-2', projectId: 'p-nex', name: 'QA', order: 2, startDate: '2026-11-20T00:00:00.000Z', dueDate: '2026-11-27T00:00:00.000Z', status: 'notStarted' },
]
vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' } }) }))
vi.mock('@/lib/usePermission', () => ({ usePermission: () => () => true }))
vi.mock('@/api/projects', async (original) => ({
  ...(await original<typeof import('@/api/projects')>()),
  useProjectSummary: () => ({ data: project, isPending: false, isError: false }),
  usePhases: () => ({ data: phases, isPending: false, isError: false }),
  useTeams: () => ({ data: [] }),
  useArchiveProject: () => ({ mutateAsync: vi.fn() }),
  useRestoreProject: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}))
vi.mock('@/api/tickets', async (original) => ({ ...(await original<typeof import('@/api/tickets')>()), useSprints: () => ({ data: [] }), useTickets: () => ({ data: [] }) }))
vi.mock('@/api/users', async (original) => ({ ...(await original<typeof import('@/api/users')>()), useMe: () => ({ data: { id: 'u-2', teamIds: [] } }), useUsers: () => ({ data: [{ id: 'u-2', name: 'Nour El-Sayed', teamIds: [] }] }) }))
vi.mock('./OverviewTab', () => ({ OverviewTab: () => <div data-testid="content" style={{ height: 2000 }}>Overview</div> }))
vi.mock('./HistoryTab', () => ({ HistoryTab: () => <div data-testid="content" style={{ height: 2000 }}>History</div> }))

afterEach(async () => {
  cleanup()
  window.scrollTo(0, 0)
  await page.viewport(414, 896)
})

/** The page in a stand-in shell: a 56px sticky top bar and `main`'s phone padding, as AppLayout has. */
function at(tab: string) {
  const router = createMemoryRouter([{ path: '/w/:ws/p/:projectKey/:tab', element: <ProjectPage /> }], { initialEntries: [`/w/engineering/p/NEX/${tab}`] })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <header style={{ position: 'sticky', top: 0, height: 56, zIndex: 20, background: 'white' }} />
      <main id="main" className="w-full px-4 pt-6 pb-24">
        <RouterProvider router={router} />
      </main>
    </QueryClientProvider>,
  )
}

describe('the phone project page (UX Phase 5B, 5.1)', () => {
  it('Overview’s content starts in the top third of a 390 × 844 phone', async () => {
    await page.viewport(390, 844)
    at('overview')
    expect(screen.getByTestId('content').getBoundingClientRect().top).toBeLessThanOrEqual(281)
  })

  it('History has no pinned action bar; Overview has it', async () => {
    await page.viewport(390, 844)
    at('history')
    expect(document.querySelector('[data-pinned-actions]')).toBeNull()
    cleanup()
    at('overview')
    expect(document.querySelector('[data-pinned-actions]')).not.toBeNull()
  })

  it('scrolled down, the tabs stick under the top bar and show the project’s name', async () => {
    await page.viewport(390, 844)
    at('overview')
    window.scrollTo(0, 600)
    const row = screen.getByRole('navigation', { name: 'Project' })
    await vi.waitFor(() => expect(Math.round(row.getBoundingClientRect().top)).toBe(56))
    await vi.waitFor(() => expect(document.querySelector('[data-stuck-name]')?.textContent).toBe('Nexus Core'))
  })

  it('at 1280 the tabs don’t stick and show no name', async () => {
    await page.viewport(1280, 800)
    at('overview')
    window.scrollTo(0, 600)
    await new Promise((r) => setTimeout(r, 100))
    expect(document.querySelector('[data-stuck-name]')?.getClientRects().length ?? 0).toBe(0)
    expect(screen.getByRole('navigation', { name: 'Project' }).getBoundingClientRect().top).toBeLessThan(0)
  })
})
