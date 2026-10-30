// @vitest-environment jsdom
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSaveSidebarOrder, useShownSidebarOrder } from '@/api/sidebar'
import type { SidebarOrder } from '@/api/types'
import { api } from '@/lib/api'

let server: SidebarOrder
const saves: { ids: string[]; resolve: () => void; reject: (e: Error) => void }[] = []
beforeEach(() => {
  server = { starred: [], channels: ['a', 'b', 'c'] }
  saves.length = 0
  vi.spyOn(api.sidebar, 'order').mockImplementation(async () => structuredClone(server))
  vi.spyOn(api.sidebar, 'setOrder').mockImplementation(
    (_ws, _section, ids) =>
      new Promise<void>((resolve, reject) =>
        saves.push({
          ids,
          resolve: () => {
            server = { ...server, channels: ids }
            resolve()
          },
          reject,
        }),
      ),
  )
})
afterEach(() => vi.restoreAllMocks())

let n = 0
/** Each test in its own workspace: drops still saving are kept per workspace, across renders. */
function setup() {
  const ws = `ws-${++n}`
  // As in the app: a change reloads everything before it counts as done.
  const client: QueryClient = new QueryClient({ mutationCache: new MutationCache({ onSuccess: () => client.invalidateQueries() }) })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return renderHook(() => ({ shown: useShownSidebarOrder(ws), save: useSaveSidebarOrder(ws) }), { wrapper })
}
const shown = (r: ReturnType<typeof setup>['result']) => r.current.shown.data?.channels

describe('saving my sidebar order (spec 5.1): a drop shows at once and never jumps back while it saves', () => {
  it('shows the new order before the server answers, and keeps it after', async () => {
    const { result } = setup()
    await waitFor(() => expect(shown(result)).toEqual(['a', 'b', 'c']))
    act(() => result.current.save.save('channels', ['c', 'a', 'b']))
    expect(shown(result)).toEqual(['c', 'a', 'b'])
    await waitFor(() => expect(saves.length).toBeGreaterThan(0))
    await act(async () => saves[0].resolve())
    await waitFor(() => expect(api.sidebar.order).toHaveBeenCalledTimes(2))
    expect(shown(result)).toEqual(['c', 'a', 'b'])
    expect(result.current.save.error).toBeNull()
  })

  it('two quick drops: the first one landing doesn’t undo the second on screen', async () => {
    const { result } = setup()
    await waitFor(() => expect(shown(result)).toEqual(['a', 'b', 'c']))
    act(() => result.current.save.save('channels', ['c', 'a', 'b']))
    act(() => result.current.save.save('channels', ['b', 'c', 'a']))
    await waitFor(() => expect(saves.length).toBeGreaterThan(0))
    await act(async () => saves[0].resolve())
    await waitFor(() => expect(api.sidebar.order).toHaveBeenCalledTimes(2))
    expect(shown(result)).toEqual(['b', 'c', 'a'])
    await waitFor(() => expect(saves.length).toBe(2))
    await act(async () => saves[1].resolve())
    await waitFor(() => expect(shown(result)).toEqual(['b', 'c', 'a']))
  })

  it('the latest drop refused: the server’s order comes back, and the section says so', async () => {
    const { result } = setup()
    await waitFor(() => expect(shown(result)).toEqual(['a', 'b', 'c']))
    act(() => result.current.save.save('channels', ['c', 'a', 'b']))
    await waitFor(() => expect(saves.length).toBeGreaterThan(0))
    await act(async () => saves[0].reject(new Error('no')))
    expect(shown(result)).toEqual(['a', 'b', 'c'])
    expect(result.current.save.error).toBe('channels')
  })

  it('an older drop refused while a newer one saves changes nothing on screen', async () => {
    const { result } = setup()
    await waitFor(() => expect(shown(result)).toEqual(['a', 'b', 'c']))
    act(() => result.current.save.save('channels', ['c', 'a', 'b']))
    act(() => result.current.save.save('channels', ['b', 'c', 'a']))
    await waitFor(() => expect(saves.length).toBeGreaterThan(0))
    await act(async () => saves[0].reject(new Error('no')))
    expect(shown(result)).toEqual(['b', 'c', 'a'])
    expect(result.current.save.error).toBeNull()
  })

  it('an order that can’t be read leaves the default order, without retrying for seconds', async () => {
    vi.spyOn(api.sidebar, 'order').mockRejectedValue(new Error('down'))
    const { result } = setup()
    await waitFor(() => expect(result.current.shown.isPending).toBe(false), { timeout: 500 })
    expect(result.current.shown.data).toBeUndefined()
  })
})
