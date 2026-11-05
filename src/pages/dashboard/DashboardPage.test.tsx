// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkingNow } from '@/api/types'
import { DashboardPage } from './DashboardPage'

// The dashboard's Working now (timer slice 3): who has a timer running on its projects, in place of Checked in now.

let working: WorkingNow[] = []
const loaded = <T,>(data: T) => ({ data, isPending: false, isError: false, refetch: vi.fn() })
vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' } }) }))
vi.mock('@/lib/useRole', () => ({ useRole: () => ({ persona: { id: 'u-2' } }) }))
vi.mock('@/lib/usePermission', () => ({ usePermission: () => (action: string) => action !== 'dashboard.everyProject', useAccess: () => 'allowed' }))
vi.mock('@/api/projects', () => ({ useProjectSummaries: () => loaded([{ id: 'p-nex', name: 'Nexus Core', managerId: 'u-2' }]) }))
vi.mock('@/api/dashboard', () => ({ useDashboard: () => loaded([]), useWorkingNow: () => loaded(working) }))
vi.mock('@/api/users', () => ({ useUsers: () => ({ data: [{ id: 'u-3', name: 'Mariam Fathy' }, { id: 'u-6', name: 'Hossam Adel' }] }) }))
vi.mock('@/api/tickets', () => ({ useTasksOf: () => ({ data: [{ id: 't-nex-106', key: 'NEX-106', title: 'Offline cache' }] }) }))

beforeEach(() => {
  working = []
})
afterEach(cleanup)

const show = () =>
  render(
    <MemoryRouter>
      <DashboardPage />
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
