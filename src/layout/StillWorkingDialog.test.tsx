// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyTimer } from '@/api/types'
import { StillWorkingDialog } from '@/layout/StillWorkingDialog'

let timer: MyTimer | null = null
const resume = { mutate: vi.fn(), isPending: false, error: null as Error | null }

vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' } }) }))
vi.mock('@/api/projects', () => ({ useProjectSummaries: () => ({ data: [{ id: 'p-nex', key: 'NEX', name: 'Nexus Core' }] }) }))
vi.mock('@/api/tickets', () => ({ useTickets: () => ({ data: [{ id: 't-101', key: 'NEX-101', title: 'Login page', projectId: 'p-nex' }] }) }))
vi.mock('@/api/attendance', () => ({ useTimerSetting: () => ({ data: { timeoutHours: 4 } }) }))
vi.mock('@/api/time', () => ({ useMyDay: () => ({ data: { timer } }), useResumeTimer: () => resume }))

const timedOut = (over: Partial<MyTimer> = {}): MyTimer => ({ state: 'paused', target: { taskId: 't-101' }, projectId: 'p-nex', entryId: 'te-1', runMs: 4 * 3_600_000, startedAt: null, pausedBy: 'timeout', ...over })

beforeEach(() => {
  timer = null
  resume.mutate.mockReset()
  resume.error = null
  sessionStorage.clear()
})
afterEach(cleanup)

describe('Still working? (timer slice 2)', () => {
  it('shows "Your timer paused after 4 h on NEX-101 Login page." with Continue (primary) and Keep paused', () => {
    timer = timedOut()
    render(<StillWorkingDialog />)
    const dialog = screen.getByRole('dialog', { name: 'Still working?' })
    expect(dialog.textContent).toContain('Your timer paused after 4 h on NEX-101 Login page.')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Keep paused' })).toBeTruthy()
  })

  it('stays away for a timer I paused, a running one, or none', () => {
    for (const t of [timedOut({ pausedBy: 'me' }), timedOut({ state: 'running', pausedBy: null, startedAt: new Date().toISOString() }), null]) {
      timer = t
      render(<StillWorkingDialog />)
      expect(screen.queryByRole('dialog')).toBeNull()
      cleanup()
    }
  })

  it('Continue resumes; Keep paused closes and stays closed for that entry, not the next', async () => {
    timer = timedOut()
    render(<StillWorkingDialog />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continue' })))
    expect(resume.mutate).toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Keep paused' })))
    expect(screen.queryByRole('dialog')).toBeNull()
    cleanup()
    render(<StillWorkingDialog />)
    expect(screen.queryByRole('dialog')).toBeNull()
    cleanup()
    timer = timedOut({ entryId: 'te-2' })
    render(<StillWorkingDialog />)
    expect(screen.getByRole('dialog', { name: 'Still working?' })).toBeTruthy()
  })

  it('a failed Continue shows its error in the dialog', () => {
    timer = timedOut()
    resume.error = new Error('That task is done. Reopen it to log time.')
    render(<StillWorkingDialog />)
    expect(screen.getByRole('alert').textContent).toBe('That task is done. Reopen it to log time.')
  })
})
