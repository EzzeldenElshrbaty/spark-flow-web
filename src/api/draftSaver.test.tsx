// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDraftSaver } from '@/api/chat'
import { qk } from '@/api/queryKeys'
import type { Draft } from '@/api/types'
import { api } from '@/lib/api'
import { parseBody, type Body } from '@/lib/messageBody'

afterEach(() => vi.restoreAllMocks())

/** saveDraft held open until the test lets each call through. */
function setup() {
  const calls: { channelId: string; body: Body }[] = []
  const gates: ((ok: boolean) => void)[] = []
  vi.spyOn(api.chat, 'saveDraft').mockImplementation(
    (channelId, body) =>
      new Promise<Draft | null>((resolve, reject) => {
        calls.push({ channelId, body })
        gates.push((ok) => (ok ? resolve(null) : reject(new Error('no'))))
      }),
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const save = renderHook(() => useDraftSaver(), { wrapper }).result.current
  return { calls, gates, client, save }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('useDraftSaver (spec 6.8: drafts)', () => {
  it("sends one place's writes one at a time, in order, so an older draft never lands after the clear", async () => {
    const { calls, gates, save } = setup()
    const hello = parseBody('hello')
    const first = save('c1', hello)
    const cleared = save('c1', [])
    await tick()
    expect(calls.map((c) => c.body)).toEqual([hello])
    gates[0](true)
    expect(await first).toBe(true)
    await waitFor(() => expect(calls.map((c) => c.body)).toEqual([hello, []]))
    gates[1](true)
    expect(await cleared).toBe(true)
  })

  it('a failed write does not hold up the next one', async () => {
    const { calls, gates, save } = setup()
    const first = save('c1', parseBody('a'))
    const second = save('c1', parseBody('b'))
    await tick()
    gates[0](false)
    expect(await first).toBe(false)
    await waitFor(() => expect(calls).toHaveLength(2))
    gates[1](true)
    expect(await second).toBe(true)
  })

  it('another channel does not wait', async () => {
    const { calls, save } = setup()
    void save('c1', parseBody('a'))
    void save('c2', parseBody('b'))
    await tick()
    expect(calls.map((c) => c.channelId)).toEqual(['c1', 'c2'])
  })

  it('puts the draft in the cache at once, so coming back to the channel shows the latest', async () => {
    const { client, save } = setup()
    const old: Draft = { channelId: 'c1', rootId: null, body: parseBody('old'), updatedAt: '2026-10-28T08:00:00.000Z' }
    client.setQueryData(qk.drafts('w1'), [old])
    void save('c1', parseBody('new'))
    expect(client.getQueryData<Draft[]>(qk.drafts('w1'))?.map((d) => d.body)).toEqual([parseBody('new')])
    void save('c1', [])
    expect(client.getQueryData<Draft[]>(qk.drafts('w1'))).toEqual([])
  })
})
