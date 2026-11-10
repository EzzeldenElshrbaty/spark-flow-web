import '@/index.css'
import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import type { MyTimer } from '@/api/types'
import { StartTimerDialog } from '@/layout/StartTimerDialog'
import { StillWorkingDialog } from '@/layout/StillWorkingDialog'
import { PhoneTimerBar, TimerPill } from '@/layout/TimerBar'
import { answersTouch } from '@/test/touch'

// CLAUDE.md: the timer in the top bar, the phone bar and the Start timer dialog read well in light and dark (axe,
// contrast included) and fit a 390px phone (timer slice 1).

let timer: MyTimer | null = null
const idle = { mutate: () => undefined, isPending: false, error: null }
vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' } }) }))
vi.mock('@/api/projects', () => ({ useProjectSummaries: () => ({ data: [{ id: 'p-nex', key: 'NEX', name: 'Nexus Core', managerId: 'u-1' }] }) }))
const loginTask = { id: 't-101', key: 'NEX-101', title: 'Login page with a longer title than fits', projectId: 'p-nex', assigneeId: 'u-1', category: 'todo', overdue: false, overEstimate: false, dueAt: null }
vi.mock('@/api/tickets', () => ({
  useTickets: (projectId?: string) => ({ data: projectId ? [loginTask] : undefined }),
  // Start timer's list (UX Phase 4, 4.3) reads every project's tasks at once.
  useTasksOf: (projectIds: string[]) => ({ data: projectIds.includes('p-nex') ? [loginTask] : [], isPending: false }),
}))
vi.mock('@/api/users', () => ({ useMe: () => ({ data: { id: 'u-1', teamIds: [] } }) }))
vi.mock('@/api/attendance', () => ({ useTimerSetting: () => ({ data: { timeoutHours: 4 } }) }))
vi.mock('@/lib/usePermission', () => ({ usePermission: () => () => true }))
vi.mock('@/api/time', () => ({
  useMyDay: () => ({ data: { timer, firstStart: true } }),
  usePauseTimer: () => idle,
  useResumeTimer: () => idle,
  useStopTimer: () => idle,
  useStartTimer: () => idle,
}))

const MIN = 60_000
const states: [string, () => MyTimer | null][] = [
  ['no timer', () => null],
  ['running', () => ({ state: 'running', target: { taskId: 't-101' }, projectId: 'p-nex', entryId: 'te-1', runMs: 30 * MIN, startedAt: new Date(Date.now() - MIN).toISOString(), pausedBy: null })],
  ['paused', () => ({ state: 'paused', target: { taskId: 't-101' }, projectId: 'p-nex', entryId: 'te-1', runMs: 45 * MIN, startedAt: null, pausedBy: 'me' })],
]

beforeEach(() => {
  timer = null
})
afterEach(async () => {
  cleanup()
  document.documentElement.classList.remove('dark')
  await page.viewport(414, 896)
})

async function violations() {
  const result = await axe.run(document)
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((node) => node.target.join(' ')).join(', ')}`)
}

function mount(dark: boolean, dialog = false) {
  document.documentElement.classList.toggle('dark', dark)
  render(
    <MemoryRouter>
      <header className="sf flex h-14 items-center gap-2 bg-sf-surface px-4">
        <TimerPill />
      </header>
      <main>
        <h1>Home</h1>
      </main>
      <PhoneTimerBar />
      {dialog && <StartTimerDialog open onClose={() => undefined} />}
    </MemoryRouter>,
  )
}

describe.each([
  ['light', false],
  ['dark', true],
])('the timer in %s', (_theme, dark) => {
  it.each(states)('%s: the top bar and phone bar have no axe violations, wide and at 390px', async (_state, make) => {
    timer = make()
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      await page.viewport(width, height)
      mount(dark)
      expect(await violations()).toEqual([])
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width)
      cleanup()
    }
  })

  it('the Start timer dialog has no axe violations and fits a 390px phone', async () => {
    await page.viewport(390, 844)
    mount(dark, true)
    const dialog = await screen.findByRole('dialog', { name: 'Start timer' })
    expect(await violations()).toEqual([])
    expect(dialog.getBoundingClientRect().width).toBeLessThanOrEqual(390)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390)
  })

  it('Still working? (timer slice 2) has no axe violations and fits a 390px phone', async () => {
    await page.viewport(390, 844)
    timer = { state: 'paused', target: { taskId: 't-101' }, projectId: 'p-nex', entryId: 'te-1', runMs: 4 * 60 * MIN, startedAt: null, pausedBy: 'timeout' }
    document.documentElement.classList.toggle('dark', dark)
    render(
      <MemoryRouter>
        <main>
          <h1>Home</h1>
        </main>
        <StillWorkingDialog />
      </MemoryRouter>,
    )
    const dialog = await screen.findByRole('dialog', { name: 'Still working?' })
    expect(await violations()).toEqual([])
    expect(dialog.getBoundingClientRect().width).toBeLessThanOrEqual(390)
  })
})

describe('the phone bar’s buttons answer a 44px touch (UX Phase 5B, 5.4)', () => {
  it('Pause and Stop: up and down from their centres', async () => {
    await page.viewport(390, 844)
    timer = states[1]![1]()
    render(
      <MemoryRouter>
        <PhoneTimerBar />
      </MemoryRouter>,
    )
    for (const name of ['Pause', 'Stop']) expect(answersTouch(screen.getByRole('button', { name })).slice(0, 2), name).toEqual([true, true])
  })
})

describe('the pill’s title fits the top bar (UX Phase 5B, 5.3)', () => {
  it('at 1280 a long task title is cut to 128px', async () => {
    await page.viewport(1280, 800)
    timer = states[1]![1]()
    render(
      <MemoryRouter>
        <header className="sf flex h-14 items-center">
          <TimerPill />
        </header>
      </MemoryRouter>,
    )
    const title = await screen.findByText(/Login page with a longer title/)
    expect(title.getBoundingClientRect().width).toBeLessThanOrEqual(128)
  })
})

describe('the phone bar fits when paused (final review)', () => {
  it('at 360 every part is on screen, the key stays on one line, and the title keeps room', async () => {
    await page.viewport(360, 800)
    timer = states[2]![1]()
    render(
      <MemoryRouter>
        <PhoneTimerBar />
      </MemoryRouter>,
    )
    const bar = screen.getByRole('region', { name: 'Timer' })
    for (const child of bar.children) expect(child.getBoundingClientRect().right, child.textContent ?? '').toBeLessThanOrEqual(360)
    expect(screen.getByText('NEX-101').getBoundingClientRect().height).toBeLessThanOrEqual(20)
    expect(screen.getByText(/Login page with a longer title/).getBoundingClientRect().width).toBeGreaterThanOrEqual(40)
  })
})
