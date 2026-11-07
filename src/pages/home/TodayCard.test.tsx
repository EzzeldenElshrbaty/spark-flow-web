// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MyDay, TimeEntry } from '@/api/types'
import { TodayCard } from './TodayCard'

// Home's Today card (timer slice 3): the timer and its buttons, or Start timer, and today's hours. Check-in, its plan
// and check-out are gone.

vi.mock('@/api/users', async (load) => ({ ...(await load<object>()), useUsers: () => ({ data: [{ id: 'u-2', name: 'Nour El-Sayed' }] }) }))
vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering' } }) }))
vi.mock('@/layout/StartTimerDialog', () => ({ StartTimerDialog: ({ open, title = 'Start timer' }: { open: boolean; title?: string }) => (open ? <div role="dialog" aria-label={title} /> : null) }))

const MIN = 60_000
const day = (over: Partial<MyDay>): MyDay => ({ day: '2026-11-01', entries: [], timer: null, firstStart: false, ...over })
const entry = (id: string, startedAt: string, endedAt: string): TimeEntry => ({ id, userId: 'u-1', projectId: 'p-1', taskId: null, startedAt, endedAt, source: 'timer', note: '', endReason: 'stopped' })
const show = (d: MyDay) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TodayCard day={d} label={() => 'Nexus Core'} />
    </QueryClientProvider>,
  )
afterEach(cleanup)

describe('the Today card (timer slice 3)', () => {
  it('no timer: Start timer opens the Start timer dialog; no plan field and no check-out', async () => {
    show(day({}))
    expect(screen.getByRole('heading', { name: 'Today · 0h' })).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /Check (in|out)/ })).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start timer' })))
    expect(screen.getByRole('dialog', { name: 'Start timer' })).toBeTruthy()
  })

  it("the header says today's hours, and today's entries are listed", () => {
    show(day({ entries: [entry('te-2', '2026-11-01T09:00:00.000Z', '2026-11-01T10:30:00.000Z'), entry('te-1', '2026-11-01T07:00:00.000Z', '2026-11-01T08:00:00.000Z')] }))
    expect(screen.getByRole('heading', { name: 'Today · 2.5h' })).toBeTruthy()
    expect(screen.getAllByText('Nexus Core')).toHaveLength(2)
  })

  it('a running timer offers Pause and Stop; a paused one Resume, Stop and Switch task', () => {
    show(day({ timer: { state: 'running', target: { projectId: 'p-1' }, projectId: 'p-1', entryId: 'te-1', runMs: 0, startedAt: new Date(Date.now() - MIN).toISOString(), pausedBy: null } }))
    const row = screen.getByRole('timer').parentElement!
    expect(within(row).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Pause', 'Stop'])
    expect(screen.queryByRole('button', { name: 'Start timer' })).toBeNull()
    cleanup()
    show(day({ timer: { state: 'paused', target: { projectId: 'p-1' }, projectId: 'p-1', entryId: 'te-1', runMs: 5 * MIN, startedAt: null, pausedBy: 'me' } }))
    expect(screen.getByRole('timer').textContent).toBe('0:05:00')
    expect(within(screen.getByRole('timer').parentElement!).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Resume', 'Stop', 'Switch task'])
  })

  it('an entry someone else added for me says who (add time for)', () => {
    show(day({ entries: [{ ...entry('te-9', '2026-11-01T07:00:00.000Z', '2026-11-01T08:00:00.000Z'), source: 'manual', endReason: null, note: 'Pairing', addedBy: 'u-2' }] }))
    expect(screen.getByText(/Added by Nour El-Sayed/)).toBeTruthy()
  })
})
