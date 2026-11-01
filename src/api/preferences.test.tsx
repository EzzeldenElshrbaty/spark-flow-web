// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Preferences } from '@/api/types'
import { api } from '@/lib/api'
import { qk } from './queryKeys'
import { useDndEnd } from './preferences'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const prefs = (dndUntil: string | null): Preferences => ({
  defaultLevel: 'mentions', keywords: [], desktop: false, push: true, emailDigest: 'daily', dndUntil,
  dndSchedule: { on: false, from: '18:00', to: '09:00', days: [0, 1, 2, 3, 4], tz: 'Africa/Cairo' },
})

describe('useDndEnd (the bell’s note and the avatar’s moon, spec 6.11)', () => {
  it('says when a pause ends while it’s on, and goes quiet once it has passed, renders only when that changes', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date(2026, 9, 28, 15, 0))
    const paused = prefs(new Date(2026, 9, 28, 15, 45).toISOString())
    vi.spyOn(api.preferences, 'get').mockResolvedValue(paused)
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
    client.setQueryData(qk.preferences(), paused)
    let renders = 0
    const { result } = renderHook(
      () => {
        renders++
        return useDndEnd()
      },
      { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> },
    )
    expect(result.current).toBe('3:45 PM')
    const settled = renders
    act(() => vi.advanceTimersByTime(30 * 60_000))
    expect(result.current).toBe('3:45 PM')
    expect(renders).toBe(settled)
    act(() => vi.advanceTimersByTime(16 * 60_000))
    expect(result.current).toBeNull()
  })
})
