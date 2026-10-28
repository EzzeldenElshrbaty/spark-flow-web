// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Channel } from '@/api/types'
import { api } from '@/lib/api'
import { useChannelReadState, useReadHold, useReadHoldScope } from '@/pages/chat/readState'

afterEach(() => {
  vi.restoreAllMocks()
  useReadHold.setState({ channelId: null })
})

const channel = (id: string): Channel => ({
  id, workspaceId: 'ws-eng', kind: 'channel', name: id, topic: '', memberIds: ['u-1'], isPrivate: false, lastMessageAt: null,
  unreadCount: 0, lastSeq: 9, lastReadSeq: 9, starred: false, muted: false, notifyLevel: 'all',
})

function setup(c = channel('c1')) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return renderHook(() => useChannelReadState(c), { wrapper })
}

describe('useChannelReadState (U, spec 6.5 and 10)', () => {
  it('U moves the New line to that message and holds the read: being on screen no longer marks it read', async () => {
    const markUnread = vi.spyOn(api.chat, 'markUnread').mockResolvedValue()
    const { result } = setup()
    expect(result.current).toMatchObject({ newAfterSeq: 9, held: false })
    await act(() => result.current.markUnread(5))
    expect(markUnread).toHaveBeenCalledWith('c1', 5)
    expect(result.current).toMatchObject({ newAfterSeq: 4, held: true })
  })

  it('a U the server refuses holds nothing and leaves the New line where it was', async () => {
    vi.spyOn(api.chat, 'markUnread').mockRejectedValue(new Error('no'))
    const { result } = setup()
    await act(() => expect(result.current.markUnread(5)).rejects.toThrow('no'))
    expect(result.current).toMatchObject({ newAfterSeq: 9, held: false })
  })

  it('marking it read myself ends the hold', async () => {
    vi.spyOn(api.chat, 'markUnread').mockResolvedValue()
    const markRead = vi.spyOn(api.chat, 'markRead').mockResolvedValue()
    const { result } = setup()
    await act(() => result.current.markUnread(5))
    act(() => result.current.markRead())
    expect(result.current.held).toBe(false)
    await vi.waitFor(() => expect(markRead).toHaveBeenCalledWith('c1', undefined))
  })

  it('the hold is for one channel', async () => {
    vi.spyOn(api.chat, 'markUnread').mockResolvedValue()
    const first = setup(channel('c1'))
    await act(() => first.result.current.markUnread(5))
    expect(setup(channel('c2')).result.current.held).toBe(false)
  })
})

describe('useReadHoldScope', () => {
  it('ends the hold when I leave the channel, for another one or another page', () => {
    useReadHold.getState().hold('c1')
    const { rerender, unmount } = renderHook(({ id }) => useReadHoldScope(id), { initialProps: { id: 'c1' } })
    rerender({ id: 'c1' })
    expect(useReadHold.getState().channelId).toBe('c1')
    rerender({ id: 'c2' })
    expect(useReadHold.getState().channelId).toBeNull()
    useReadHold.getState().hold('c2')
    unmount()
    expect(useReadHold.getState().channelId).toBeNull()
  })
})
