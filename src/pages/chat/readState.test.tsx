// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Channel } from '@/api/types'
import { api } from '@/lib/api'
import { markOpenChannelRead, useChannelReadState, useChannelVisit, useReadHold, useReadHoldScope } from '@/pages/chat/readState'

afterEach(() => {
  vi.restoreAllMocks()
  useReadHold.setState({ channelId: null })
  useChannelVisit.setState({ visit: null })
})

const channel = (id: string): Channel => ({
  id, workspaceId: 'ws-eng', kind: 'channel', name: id, topic: '', memberIds: ['u-1'], isPrivate: false, lastMessageAt: null, description: '', whoCanPost: 'everyone', isDefault: false,
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

  it('a refused U after one that went through keeps the first hold and its New line', async () => {
    vi.spyOn(api.chat, 'markUnread').mockResolvedValueOnce().mockRejectedValueOnce(new Error('no'))
    const { result } = setup()
    await act(() => result.current.markUnread(5))
    await act(() => expect(result.current.markUnread(8)).rejects.toThrow('no'))
    expect(result.current).toMatchObject({ newAfterSeq: 4, held: true })
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

describe('opening the channel marks it read (spec 6.2)', () => {
  const unread = (over: Partial<Channel> = {}): Channel => ({ ...channel('c1'), unreadCount: 3, lastSeq: 9, lastReadSeq: 6, ...over })

  it('up to its newest message at opening, once; the New line stays where I left off', async () => {
    const markRead = vi.spyOn(api.chat, 'markRead').mockResolvedValue()
    const { result, rerender } = setup(unread())
    await vi.waitFor(() => expect(markRead).toHaveBeenCalledWith('c1', 9))
    rerender()
    expect(markRead).toHaveBeenCalledOnce()
    expect(result.current).toMatchObject({ newAfterSeq: 6, readOnOpen: 9 })
  })

  it('with nothing unread it sends nothing', async () => {
    const markRead = vi.spyOn(api.chat, 'markRead').mockResolvedValue()
    const { result } = setup()
    await new Promise((r) => setTimeout(r, 20))
    expect(markRead).not.toHaveBeenCalled()
    expect(result.current.readOnOpen).toBeNull()
  })

  it('held by Mark unread (back from another tab of the channel), it stays unread', async () => {
    const markRead = vi.spyOn(api.chat, 'markRead').mockResolvedValue()
    useReadHold.getState().hold('c1')
    const { result } = setup(unread())
    await new Promise((r) => setTimeout(r, 20))
    expect(markRead).not.toHaveBeenCalled()
    expect(result.current.readOnOpen).toBeNull()
  })

  it('back from another tab of the channel (the feed mounts again), the New line and the unread count stay where I left off', async () => {
    const markRead = vi.spyOn(api.chat, 'markRead').mockResolvedValue()
    const first = setup(unread())
    await vi.waitFor(() => expect(markRead).toHaveBeenCalledWith('c1', 9))
    expect(first.result.current).toMatchObject({ newAfterSeq: 6, unreadOnOpen: 3 })
    first.unmount()
    // By now the channel reads as read: the marker moved when I opened it.
    const again = setup(unread({ unreadCount: 0, lastReadSeq: 9 }))
    await new Promise((r) => setTimeout(r, 20))
    expect(again.result.current).toMatchObject({ newAfterSeq: 6, unreadOnOpen: 3, readOnOpen: 9 })
    expect(markRead).toHaveBeenCalledOnce()
  })

  it('a U made before going to another tab still places the New line when I come back', async () => {
    vi.spyOn(api.chat, 'markUnread').mockResolvedValue()
    const first = setup()
    await act(() => first.result.current.markUnread(5))
    first.unmount()
    expect(setup(channel('c1')).result.current).toMatchObject({ newAfterSeq: 4, held: true })
  })

  it('another channel starts its own visit', async () => {
    vi.spyOn(api.chat, 'markRead').mockResolvedValue()
    setup(unread()).unmount()
    expect(setup(channel('c2')).result.current).toMatchObject({ newAfterSeq: 9, unreadOnOpen: 0 })
  })

  it('a page opened in the background waits until it is shown', async () => {
    const markRead = vi.spyOn(api.chat, 'markRead').mockResolvedValue()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    setup(unread())
    await new Promise((r) => setTimeout(r, 20))
    expect(markRead).not.toHaveBeenCalled()
    visibility.mockReturnValue('visible')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    await vi.waitFor(() => expect(markRead).toHaveBeenCalledWith('c1', 9))
  })
})

describe('Esc: markOpenChannelRead (spec 10)', () => {
  it('marks an unread channel read', () => {
    const markRead = vi.fn()
    markOpenChannelRead({ ...channel('c1'), unreadCount: 2 }, markRead)
    expect(markRead).toHaveBeenCalledWith('c1')
  })

  it('right after U, before the unread count has caught up, it still marks read and ends the hold', () => {
    const markRead = vi.fn()
    useReadHold.getState().hold('c1')
    markOpenChannelRead(channel('c1'), markRead)
    expect(markRead).toHaveBeenCalledWith('c1')
    expect(useReadHold.getState().channelId).toBeNull()
  })

  it('with nothing unread and nothing held, it sends nothing', () => {
    const markRead = vi.fn()
    markOpenChannelRead(channel('c1'), markRead)
    expect(markRead).not.toHaveBeenCalled()
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

  it('ends the visit when I leave, so coming back reads the marker afresh', async () => {
    vi.spyOn(api.chat, 'markRead').mockResolvedValue()
    const scope = renderHook(({ id }) => useReadHoldScope(id), { initialProps: { id: 'c1' } })
    setup({ ...channel('c1'), unreadCount: 3, lastReadSeq: 6 }).unmount()
    expect(useChannelVisit.getState().visit?.channelId).toBe('c1')
    scope.rerender({ id: 'c2' })
    expect(useChannelVisit.getState().visit).toBeNull()
    expect(setup(channel('c1')).result.current).toMatchObject({ newAfterSeq: 9, unreadOnOpen: 0 })
  })
})
