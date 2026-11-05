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

// CLAUDE.md: Home's Today card and the dashboard's Working now (timer slice 3) read well in light and dark (axe,
// contrast included) and fit a 390px phone.

const loaded = <T,>(data: T) => ({ data, isPending: false, isError: false, refetch: () => undefined })
const idle = { mutate: () => undefined, isPending: false, error: null }
vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' } }) }))
vi.mock('@/lib/useRole', () => ({ useRole: () => ({ persona: { id: 'u-2' } }) }))
vi.mock('@/lib/usePermission', async (load) => ({ ...(await load<object>()), usePermission: () => (action: string) => action !== 'dashboard.everyProject', useAccess: () => 'allowed' }))
vi.mock('@/api/time', async (load) => ({ ...(await load<object>()), usePauseTimer: () => idle, useResumeTimer: () => idle, useStopTimer: () => idle, useStartTimer: () => idle }))
vi.mock('@/api/projects', async (load) => ({ ...(await load<object>()), useProjectSummaries: () => loaded([{ id: 'p-nex', name: 'Nexus Core', managerId: 'u-2' }]) }))
vi.mock('@/api/dashboard', async (load) => ({
  ...(await load<object>()),
  useDashboard: () => loaded([]),
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

  it('the dashboard with Working now has no axe violations, wide and at 390px', async () => {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      await page.viewport(width, height)
      mount(<DashboardPage />, dark)
      await screen.findByRole('heading', { name: 'Working now' })
      expect(await violations()).toEqual([])
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width)
      cleanup()
    }
  })
})
