// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSummary, TimeEntry, User } from '@/api/types'
import { TimeTab } from './TimeTab'

// UX Phase 1, 1.7: on a phone, the project's Time list lets me change or delete an entry, as the table does.

const entry: TimeEntry = { id: 'te-1', userId: 'u-2', projectId: 'p-nex', taskId: null, startedAt: '2026-11-05T09:00:00.000Z', endedAt: '2026-11-05T11:00:00.000Z', source: 'manual', note: '', endReason: null } as TimeEntry
vi.mock('@/api/projects', () => ({ useProjectTime: () => ({ data: { entries: [entry], rates: null }, isPending: false, isError: false }) }))
vi.mock('@/api/tickets', () => ({ useTickets: () => ({ data: [] }), useArchivedTasks: () => ({ data: [] }) }))
vi.mock('@/api/time', () => ({ useRemoveTime: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }), useAddTime: () => ({ mutate: vi.fn() }), useUpdateTime: () => ({ mutate: vi.fn() }) }))
vi.mock('@/lib/useCanLog', () => ({ useCanLog: () => () => true }))
vi.mock('@/lib/usePermission', () => ({ usePermission: () => () => true }))
vi.mock('@/lib/useRole', () => ({ useRole: () => ({ loading: false, persona: { id: 'u-2' } }) }))
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

afterEach(cleanup)

const project = { id: 'p-nex', key: 'NEX', name: 'Nexus Core', managerId: 'u-2', memberIds: [], teamIds: [], loggedHours: 2 } as unknown as ProjectSummary
const people = [{ id: 'u-2', name: 'Nour El-Sayed' }] as User[]

describe('TimeTab on a phone', () => {
  it('each entry I may change ends with its ⋯ menu in the phone list too', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <TimeTab project={project} people={people} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const phoneList = document.querySelector('ul.sm\\:hidden') as HTMLElement
    expect(within(phoneList).getByRole('button', { name: 'Entry actions' })).toBeTruthy()
  })
})
