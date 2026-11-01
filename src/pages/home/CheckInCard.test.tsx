// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { MyDay } from '@/api/types'
import { CheckInCard } from './CheckInCard'

// Before someone's first check-in, the card says what checking in records (Admin and help, slice 5).

const day = (over: Partial<MyDay>): MyDay => ({ day: '2026-11-01', checkIn: null, openCheckIn: null, running: null, entries: [], firstCheckIn: false, ...over })
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
