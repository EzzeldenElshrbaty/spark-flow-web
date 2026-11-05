import '@/index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import type { MyDay } from '@/api/types'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { TodayCard } from './TodayCard'

// CLAUDE.md: Home's Today card and the dashboard (timer slice 3, dashboard slice) read well in light and dark (axe,
// contrast included) and fit a 390px phone.

const loaded = <T,>(data: T) => ({ data, isPending: false, isError: false, refetch: () => undefined })
const idle = { mutate: () => undefined, isPending: false, error: null }
vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' } }) }))
vi.mock('@/lib/useRole', () => ({ useRole: () => ({ persona: { id: 'u-2' }, grants: ['checkins.managed'] }) }))
vi.mock('@/lib/usePermission', async (load) => ({ ...(await load<object>()), usePermission: () => (action: string) => action !== 'dashboard.everyProject', useAccess: () => 'allowed' }))
vi.mock('@/api/time', async (load) => ({ ...(await load<object>()), usePauseTimer: () => idle, useResumeTimer: () => idle, useStopTimer: () => idle, useStartTimer: () => idle }))
vi.mock('@/api/projects', async (load) => ({ ...(await load<object>()), useProjectSummaries: () => loaded([{ id: 'p-nex', name: 'Nexus Core', managerId: 'u-2' }]) }))
const nex = {
  id: 'p-nex', key: 'NEX', name: 'Nexus Core', status: 'active', managerId: 'u-2', phaseName: 'Build', progress: 0.5, loggedHours: 40, cost: null, estimateHours: 60,
  estimatedLoggedHours: 70, expectedFinish: '2026-12-01T00:00:00.000Z', dueDate: '2026-11-20T00:00:00.000Z', overdueCount: 1, taskCount: 10, week: [{ userId: 'u-3', hours: 6 }], weekHours: 9,
}
const stats = {
  days: Array.from({ length: 14 }, (_, i) => ({ day: new Date(Date.UTC(2026, 9, 23 + i)).toISOString().slice(0, 10), hours: i % 3 ? 6 : 0, mine: i % 3 ? 2 : 0 })),
  byProject: [{ projectId: 'p-nex', hours: 54 }],
  byStatus: [
    { category: 'todo', count: 4 },
    { category: 'inProgress', count: 2 },
    { category: 'done', count: 3 },
  ],
  overdue: [
    { taskId: 't-nex-103', key: 'NEX-103', title: 'Fix duplicate rows in GET /v2/invoices at page size 100', projectId: 'p-nex', assigneeId: 'u-3', dueAt: '2026-11-03T00:00:00.000Z' },
    { taskId: 't-nex-104', key: 'NEX-104', title: 'Over its estimate', projectId: 'p-nex', assigneeId: null, dueAt: null },
  ],
}
vi.mock('@/api/dashboard', async (load) => ({
  ...(await load<object>()),
  useDashboard: () => loaded([nex]),
  useDashboardStats: () => loaded(stats),
  useWorkingNow: () => loaded([{ userId: 'u-3', taskId: 't-nex-106', projectId: 'p-nex', startedAt: new Date(Date.now() - 3_600_000).toISOString() }]),
}))
vi.mock('@/api/users', async (load) => ({ ...(await load<object>()), useUsers: () => ({ data: [{ id: 'u-3', name: 'Mariam Fathy' }] }) }))
vi.mock('@/api/tickets', async (load) => ({ ...(await load<object>()), useTasksOf: () => ({ data: [{ id: 't-nex-106', key: 'NEX-106', title: 'Offline cache with a longer title than fits' }] }) }))

const MIN = 60_000
const days: [string, MyDay][] = [
  ['no timer', { day: '2026-11-05', entries: [], timer: null, firstStart: false }],
  ['a running timer', { day: '2026-11-05', entries: [], firstStart: false, timer: { state: 'running', target: { taskId: 't-nex-106' }, projectId: 'p-nex', entryId: 'te-1', runMs: 30 * MIN, startedAt: new Date(Date.now() - MIN).toISOString(), pausedBy: null } }],
  ['a paused timer', { day: '2026-11-05', entries: [], firstStart: false, timer: { state: 'paused', target: { taskId: 't-nex-106' }, projectId: 'p-nex', entryId: 'te-1', runMs: 45 * MIN, startedAt: null, pausedBy: 'me' } }],
]

afterEach(async () => {
  cleanup()
  document.documentElement.classList.remove('dark')
  await page.viewport(414, 896)
})

async function violations() {
  const result = await axe.run(document)
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((node) => node.target.join(' ')).join(', ')}`)
}

function mount(ui: ReactNode, dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <main>{ui}</main>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe.each([
  ['light', false],
  ['dark', true],
])('timer slice 3 in %s', (_theme, dark) => {
  it.each(days)('the Today card with %s has no axe violations, wide and at 390px', async (_state, day) => {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      await page.viewport(width, height)
      mount(
        <>
          <h1>Home</h1>
          <TodayCard day={day} label={() => 'NEX-106 · Offline cache'} />
        </>,
        dark,
      )
      expect(await violations()).toEqual([])
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width)
      cleanup()
    }
  })

  it('the dashboard with its charts, overdue tasks and Working now has no axe violations, wide and at 390px', async () => {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      await page.viewport(width, height)
      mount(<DashboardPage />, dark)
      await screen.findByRole('heading', { name: 'Working now' })
      expect(screen.getByRole('group', { name: 'Hours per day' })).toBeTruthy()
      expect(screen.getByRole('heading', { name: '2 overdue tasks' })).toBeTruthy()
      expect(await violations()).toEqual([])
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width)
      cleanup()
    }
  })
})
