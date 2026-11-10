import '@/index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import type { ProjectSummary } from '@/api/types'
import { OverviewTab } from './OverviewTab'

// Final review (UX Phase 5B): on a phone Overview fits the screen, so it isn't zoomed out (and touch areas stay 44px).
const idle = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null }
vi.mock('@/api/projects', async (original) => ({
  ...(await original<typeof import('@/api/projects')>()),
  useDeliverables: () => ({ data: [{ id: 'd1', projectId: 'p-nex', phaseId: null, title: 'Refresh-token rotation live on every client and every server we run today', dueDate: '2026-11-12T00:00:00.000Z', doneAt: null }], isPending: false, isError: false }),
  useRemoveDeliverable: () => idle,
  useUpdateDeliverable: () => idle,
}))
vi.mock('./ProjectFiles', () => ({ ProjectFiles: () => null }))
vi.mock('@/lib/usePermission', () => ({ usePermission: () => () => true }))

afterEach(async () => {
  cleanup()
  await page.viewport(414, 896)
})

const project = {
  id: 'p-nex', key: 'NEX', name: 'Nexus Core', status: 'active', methodology: 'waterfall', clientName: 'Spark', managerId: 'u-2', memberIds: [], teamIds: [], links: [],
  startDate: '2026-10-01T00:00:00.000Z', dueDate: '2026-12-01T00:00:00.000Z', description: 'API, database and web client.', progress: 0.2, loggedHours: 10, cost: null,
  expectedFinish: '2026-12-01T00:00:00.000Z', currentPhaseId: null, overdueCount: 0, overEstimateCount: 0, taskCount: 3, archivedAt: null,
} as unknown as ProjectSummary

describe('Overview on a phone (final review)', () => {
  it('a long deliverable title doesn’t make the page wider than a 390px screen', async () => {
    await page.viewport(390, 844)
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <div style={{ width: 358 }}>
            <OverviewTab project={project} phases={[]} people={[]} teams={[]} canEdit canPost />
          </div>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await screen.findByText(/Refresh-token rotation/)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390)
  })
})
