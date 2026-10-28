// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Channel } from '@/api/types'
import { api } from '@/lib/api'
import { MarkAllReadModal } from '@/pages/chat/ChannelShortcuts'
import { useReadHold } from '@/pages/chat/readState'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useReadHold.setState({ channelId: null })
})

const channel = (id: string, unreadCount: number): Channel => ({
  id, workspaceId: 'ws-eng', kind: 'channel', name: id, topic: '', memberIds: ['u-1'], isPrivate: false, lastMessageAt: null,
  unreadCount, lastSeq: 5, lastReadSeq: 5 - unreadCount, starred: false, muted: false, notifyLevel: 'all',
})

function show(channels: Channel[] | null) {
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <MarkAllReadModal channels={channels} onClose={onClose} />
    </QueryClientProvider>,
  )
  return onClose
}

describe('Shift+Esc: Mark everything read (spec 10)', () => {
  it('asks first, saying how many; then marks each one read and closes', async () => {
    const markRead = vi.spyOn(api.chat, 'markRead').mockResolvedValue()
    useReadHold.getState().hold('a')
    const onClose = show([channel('a', 2), channel('d', 1)])
    const dialog = screen.getByRole('dialog', { name: 'Mark everything read?' })
    expect(dialog.textContent).toContain('2 channels and direct messages have unread messages.')
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(markRead.mock.calls).toEqual([['a'], ['d']])
    // Marked unread (U) a moment ago, read now: the hold ends with it.
    expect(useReadHold.getState().channelId).toBeNull()
  })

  it('one channel says so in the singular', () => {
    show([channel('a', 2)])
    expect(screen.getByRole('dialog').textContent).toContain('1 channel or direct message has unread messages.')
  })

  it('Cancel marks nothing', () => {
    const markRead = vi.spyOn(api.chat, 'markRead').mockResolvedValue()
    const onClose = show([channel('a', 2)])
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(markRead).not.toHaveBeenCalled()
  })

  it('when some fail it says how many, and stays open to try again', async () => {
    vi.spyOn(api.chat, 'markRead').mockImplementation(async (id) => (id === 'd' ? Promise.reject(new Error('no')) : undefined))
    const onClose = show([channel('a', 2), channel('d', 1)])
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    expect(await screen.findByText("Couldn't mark 1 of them read. Try again.")).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('is closed with nothing to ask about', () => {
    show(null)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
