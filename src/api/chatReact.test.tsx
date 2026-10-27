// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { useReact } from '@/api/chat'
import { qk } from '@/api/queryKeys'
import type { ChatMessage, Page } from '@/api/types'

const message = (id: string): ChatMessage => ({
  id, channelId: 'c-backend', seq: 1, senderId: 'u-2', content: 'x', body: [], attachments: [], reactions: [{ emoji: '👍', userIds: ['u-2'] }],
  threadCount: 0, lastReplyAt: null, linkedTicketKeys: [], mentions: [], editedAt: null, createdAt: '2026-10-28T09:00:00.000Z',
})

function setup(id: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } })
  const data: InfiniteData<Page<ChatMessage>> = { pages: [{ items: [message(id)], nextCursor: null }], pageParams: [undefined] }
  client.setQueryData(qk.messages('c-backend'), data)
  client.setQueryData(qk.message(id), message(id))
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const hook = renderHook(() => useReact('u-1'), { wrapper })
  const reactionsIn = () => ({
    list: client.getQueryData<InfiniteData<Page<ChatMessage>>>(qk.messages('c-backend'))!.pages[0].items[0].reactions,
    one: client.getQueryData<ChatMessage>(qk.message(id))!.reactions,
  })
  return { hook, reactionsIn }
}

describe('useReact (spec 6.6: optimistic toggle)', () => {
  it('shows my reaction at once, before the server answers', async () => {
    const { hook, reactionsIn } = setup('m-b07')
    act(() => hook.result.current.mutate({ target: { kind: 'message', id: 'm-b07' }, emoji: '👍' }))
    await waitFor(() => expect(reactionsIn().list).toEqual([{ emoji: '👍', userIds: ['u-2', 'u-1'] }]))
    expect(reactionsIn().one).toEqual([{ emoji: '👍', userIds: ['u-2', 'u-1'] }])
    expect(hook.result.current.isPending).toBe(true)
  })

  it('puts things back when the server refuses', async () => {
    const { hook, reactionsIn } = setup('m-nope')
    act(() => hook.result.current.mutate({ target: { kind: 'message', id: 'm-nope' }, emoji: '🎉' }))
    await waitFor(() => expect(hook.result.current.isError).toBe(true))
    expect(reactionsIn().list).toEqual([{ emoji: '👍', userIds: ['u-2'] }])
    expect(reactionsIn().one).toEqual([{ emoji: '👍', userIds: ['u-2'] }])
  })
})
