// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyTimer } from '@/api/types'
import { PhoneTimerBar, TimerAnnouncer, TimerPill } from '@/layout/TimerBar'
import { formatClock } from '@/lib/format'

let timer: MyTimer | null = null
const mutation = () => ({ mutate: vi.fn(), isPending: false, error: null as Error | null })
let pause = mutation()
let resume = mutation()
let stop = mutation()

vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' } }) }))
vi.mock('@/api/projects', () => ({ useProjectSummaries: () => ({ data: [{ id: 'p-nex', key: 'NEX', name: 'Nexus Core' }] }) }))
vi.mock('@/api/tickets', () => ({ useTickets: () => ({ data: [{ id: 't-101', key: 'NEX-101', title: 'Login page', projectId: 'p-nex' }] }) }))
vi.mock('@/api/time', () => ({ useMyDay: () => ({ data: { timer } }), usePauseTimer: () => pause, useResumeTimer: () => resume, useStopTimer: () => stop }))
vi.mock('@/layout/StartTimerDialog', () => ({ StartTimerDialog: ({ open, title = 'Start timer' }: { open: boolean; title?: string }) => (open ? <div role="dialog" aria-label={title} /> : null) }))

const MIN = 60_000
const running = (over: Partial<MyTimer> = {}): MyTimer => ({ state: 'running', target: { taskId: 't-101' }, projectId: 'p-nex', entryId: 'te-1', runMs: 30 * MIN, startedAt: new Date(Date.now() - MIN).toISOString(), pausedBy: null, ...over })
const paused = (over: Partial<MyTimer> = {}): MyTimer => ({ state: 'paused', target: { taskId: 't-101' }, projectId: 'p-nex', entryId: 'te-1', runMs: 45 * MIN, startedAt: null, pausedBy: 'me', ...over })

beforeEach(() => {
  timer = null
  pause = mutation()
  resume = mutation()
  stop = mutation()
})
afterEach(cleanup)

const pill = () => document.querySelector<HTMLElement>('[data-timer="pill"]')!
const bar = () => document.querySelector<HTMLElement>('[data-timer="bar"]')!
const show = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('the top bar timer (timer slice 1)', () => {
  it('no timer: Start timer (text from md, a round icon below) opens the dialog', async () => {
    show(<TimerPill />)
    const buttons = screen.getAllByRole('button', { name: 'Start timer' })
    expect(buttons).toHaveLength(2)
    await act(async () => fireEvent.click(buttons[0]))
    expect(screen.getByRole('dialog', { name: 'Start timer' })).toBeTruthy()
  })

  it('running: the count (the run so far plus this entry), Pause and Stop', async () => {
    timer = running()
    show(<TimerPill />)
    const box = pill()
    expect(within(box).getByRole('timer').textContent).toBe(formatClock(31 * MIN))
    expect(within(box).getByText('NEX-101')).toBeTruthy()
    expect(within(box).queryByRole('button', { name: 'Resume' })).toBeNull()
    await act(async () => fireEvent.click(within(box).getByRole('button', { name: 'Pause' })))
    expect(pause.mutate).toHaveBeenCalled()
    await act(async () => fireEvent.click(within(box).getByRole('button', { name: 'Stop' })))
    expect(stop.mutate).toHaveBeenCalled()
  })

  it('paused: the frozen count (runMs), Resume, Stop and Switch task', async () => {
    timer = paused()
    show(<TimerPill />)
    const box = pill()
    expect(within(box).getByRole('timer').textContent).toBe(formatClock(45 * MIN))
    expect(within(box).queryByRole('button', { name: 'Pause' })).toBeNull()
    await act(async () => fireEvent.click(within(box).getByRole('button', { name: 'Resume' })))
    expect(resume.mutate).toHaveBeenCalled()
    await act(async () => fireEvent.click(within(box).getByRole('button', { name: 'Switch task' })))
    expect(screen.getByRole('dialog', { name: 'Switch task' })).toBeTruthy()
  })

  it('pending buttons say "Pausing…" and "Stopping…"', () => {
    timer = running()
    pause.isPending = true
    stop.isPending = true
    show(<TimerPill />)
    expect(screen.getByRole('button', { name: 'Pausing…' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stopping…' })).toBeTruthy()
  })

  it('a refused Resume shows the refusal in the pill and the phone bar', () => {
    timer = paused()
    resume.error = new Error('That task is done. Reopen it to log time.')
    show(
      <>
        <TimerPill />
        <PhoneTimerBar />
      </>,
    )
    expect(within(pill()).getByText('That task is done. Reopen it to log time.')).toBeTruthy()
    expect(within(bar()).getByText('That task is done. Reopen it to log time.')).toBeTruthy()
  })

  it('the phone bar shows a running or paused timer with the same buttons, and nothing without one', () => {
    show(<PhoneTimerBar />)
    expect(document.querySelector('[data-timer="bar"]')).toBeNull()
    cleanup()
    timer = running()
    show(<PhoneTimerBar />)
    const box = bar()
    expect(within(box).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim())).toEqual(['Pause', 'Stop'])
    cleanup()
    timer = paused()
    show(<PhoneTimerBar />)
    expect(within(bar()).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim())).toEqual(['Resume', 'Stop', 'Switch task'])
  })

  it('the announcer says when the timer runs, pauses and stops', () => {
    timer = running()
    const { rerender } = show(<TimerAnnouncer />)
    const live = () => document.querySelector('[aria-live="polite"]')!.textContent
    expect(live()).toBe('Timer running on NEX-101')
    timer = paused()
    rerender(<MemoryRouter><TimerAnnouncer /></MemoryRouter>)
    expect(live()).toBe('Timer paused on NEX-101')
    timer = null
    rerender(<MemoryRouter><TimerAnnouncer /></MemoryRouter>)
    expect(live()).toBe('Timer stopped')
  })
})
