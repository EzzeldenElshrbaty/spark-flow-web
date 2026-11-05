// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { MyDay } from '@/api/types'
import { CheckInCard } from './CheckInCard'

// Before someone's first check-in, the card says what checking in records (Admin and help, slice 5).

const day = (over: Partial<MyDay>): MyDay => ({ day: '2026-11-01', checkIn: null, openCheckIn: null, entries: [], firstCheckIn: false, timer: null, firstStart: false, ...over })
const show = (d: MyDay) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CheckInCard day={d} tasks={[]} label={() => ''} />
    </QueryClientProvider>,
  )
afterEach(cleanup)

describe('the check-in notice', () => {
  it('says what is recorded and who sees it, before the first check-in only', () => {
    show(day({ firstCheckIn: true }))
    expect(screen.getByText(/Checking in and out records the time, this device’s IP address and browser, and your location if you allow it\. You, the managers of your projects and Admins can see them in Attendance\./)).toBeTruthy()
    cleanup()
    show(day({ firstCheckIn: false }))
    expect(screen.queryByText(/records the time/)).toBeNull()
  })
})

describe('the timer row (timer slice 1)', () => {
  const MIN = 60_000
  it('a running timer offers Pause and Stop; a paused one Resume, Stop and Switch task', () => {
    show(day({ timer: { state: 'running', target: { projectId: 'p-1' }, projectId: 'p-1', entryId: 'te-1', runMs: 0, startedAt: new Date(Date.now() - MIN).toISOString(), pausedBy: null } }))
    const row = screen.getByRole('timer').parentElement!
    expect(within(row).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Pause', 'Stop'])
    cleanup()
    show(day({ timer: { state: 'paused', target: { projectId: 'p-1' }, projectId: 'p-1', entryId: 'te-1', runMs: 5 * MIN, startedAt: null, pausedBy: 'me' } }))
    expect(screen.getByRole('timer').textContent).toBe('0:05:00')
    expect(within(screen.getByRole('timer').parentElement!).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Resume', 'Stop', 'Switch task'])
  })
})
