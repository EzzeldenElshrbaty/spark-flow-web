// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMessagesFrom } from '@/api/chat'
import type { ChatMessage, Page } from '@/api/types'
import { api } from '@/lib/api'

afterEach(() => vi.restoreAllMocks())

const m = (seq: number) => ({ id: `m${seq}`, seq }) as ChatMessage
const page = (seqs: number[], nextCursor: string | null = null): Page<ChatMessage> => ({ items: seqs.map(m), nextCursor })

describe('useMessagesFrom (a jump, spec 6.2)', () => {
  it('pages back from the oldest loaded message by its seq (before=), and on with the cursor the server gave', async () => {
    vi.spyOn(api.chat, 'messagesAfter').mockResolvedValue(page([12, 11, 10]))
    const before = vi.spyOn(api.chat, 'messagesBefore').mockResolvedValue(page([9, 8], 'opaque-1'))
    const messages = vi.spyOn(api.chat, 'messages').mockResolvedValue(page([7]))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useMessagesFrom('c1', 10), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    await act(() => result.current.fetchNextPage())
    expect(before).toHaveBeenCalledWith('c1', 10)
    await act(() => result.current.fetchNextPage())
    expect(messages).toHaveBeenCalledWith('c1', 'opaque-1')
  })
})
