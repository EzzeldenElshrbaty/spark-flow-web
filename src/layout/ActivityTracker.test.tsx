// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Me } from '@/api/types'
import { api } from '@/lib/api'
import { ActivityTracker } from './ActivityTracker'

// App use (Admin and help, slice 5): a ping about once a minute while Flow is on screen and was used in the last 5
// minutes; a hidden tab or an idle one sends nothing.

const MIN = 60_000
let visible = true
let ping: ReturnType<typeof vi.fn<() => Promise<void>>>
const me: Me = { id: 'u-1', name: 'Youssef Abdelrahman', email: '', title: '', roleIds: ['admin'], presence: 'active', teamIds: [], grants: [] }

beforeEach(() => {
  vi.useFakeTimers()
  visible = true
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (visible ? 'visible' : 'hidden') })
  ping = vi.fn<() => Promise<void>>(async () => {})
  vi.spyOn(api.attendance, 'ping').mockImplementation(ping)
  vi.spyOn(api.users, 'me').mockResolvedValue(me)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ActivityTracker />
    </QueryClientProvider>,
  )
  await act(() => vi.advanceTimersByTimeAsync(0))
}
const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

describe('ActivityTracker', () => {
  it('reports on opening and then once a minute while someone keeps using Flow', async () => {
    await mount()
    expect(ping).toHaveBeenCalledTimes(1)
    for (let i = 0; i < 3; i++) {
      window.dispatchEvent(new Event('pointerdown'))
      await wait(MIN)
    }
    expect(ping).toHaveBeenCalledTimes(4)
  })

  it('stops after 5 minutes without a click, key or scroll; using it again reports at once', async () => {
    await mount()
    await wait(10 * MIN)
    // Opening counts as use: minutes 1 to 5 report, then nothing.
    expect(ping).toHaveBeenCalledTimes(6)
    window.dispatchEvent(new KeyboardEvent('keydown'))
    expect(ping).toHaveBeenCalledTimes(7)
  })

  it('a hidden tab reports nothing, and coming back counts as use', async () => {
    await mount()
    visible = false
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('pointerdown'))
    await wait(3 * MIN)
    expect(ping).toHaveBeenCalledTimes(1)
    visible = true
    document.dispatchEvent(new Event('visibilitychange'))
    expect(ping).toHaveBeenCalledTimes(2)
  })

  it('coming back counts once: the tick seconds later doesn’t report it again', async () => {
    await mount()
    visible = false
    document.dispatchEvent(new Event('visibilitychange'))
    await wait(2 * MIN + 50_000)
    visible = true
    document.dispatchEvent(new Event('visibilitychange'))
    expect(ping).toHaveBeenCalledTimes(2)
    await wait(10_000) // the 3-minute tick
    expect(ping).toHaveBeenCalledTimes(2)
    await wait(MIN)
    expect(ping).toHaveBeenCalledTimes(3)
  })

  it('a deactivated person, or nobody signed in, reports nothing', async () => {
    vi.mocked(api.users.me).mockResolvedValue({ ...me, deactivated: { at: '2026-10-30T10:00:00.000Z', by: 'u-2', reason: null } })
    await mount()
    await wait(2 * MIN)
    expect(ping).not.toHaveBeenCalled()
  })
})
