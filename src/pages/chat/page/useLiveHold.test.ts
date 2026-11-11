// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PageHold } from '@/api/types'
import { PAGE_HOLD_MS } from '@/lib/pageBody'
import { useLiveHold } from './useLiveHold'

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-11-11T09:00:00.000Z') })
})
afterEach(() => vi.useRealTimers())

const hold = (until: string): PageHold => ({ userId: 'u-2', until })

describe('who holds the page, as a reader hears it (polish pass)', () => {
  it('a hold the server reports is live, even when my clock says its time has passed', () => {
    const { result } = renderHook(() => useLiveHold(hold('2026-11-11T08:00:00.000Z')))
    expect(result.current).toEqual(hold('2026-11-11T08:00:00.000Z'))
  })

  it('ends 60 s after I last heard of it', () => {
    const { result } = renderHook(() => useLiveHold(hold('2026-11-11T09:01:00.000Z')))
    act(() => void vi.advanceTimersByTime(PAGE_HOLD_MS - 100))
    expect(result.current).not.toBeNull()
    act(() => void vi.advanceTimersByTime(200))
    expect(result.current).toBeNull()
  })

  it('a renewal starts the 60 s again', () => {
    const { result, rerender } = renderHook(({ h }) => useLiveHold(h), { initialProps: { h: hold('2026-11-11T09:01:00.000Z') as PageHold | null } })
    act(() => void vi.advanceTimersByTime(30_000))
    rerender({ h: hold('2026-11-11T09:01:30.000Z') })
    act(() => void vi.advanceTimersByTime(50_000))
    expect(result.current).toEqual(hold('2026-11-11T09:01:30.000Z'))
    act(() => void vi.advanceTimersByTime(11_000))
    expect(result.current).toBeNull()
  })

  it('no hold is no hold', () => {
    const { result } = renderHook(() => useLiveHold(null))
    expect(result.current).toBeNull()
  })
})
