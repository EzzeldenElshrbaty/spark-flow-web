// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@/api/types'
import { ApiError } from '@/lib/apiError'
import { ThreadInspector } from '@/pages/chat/ThreadInspector'

afterEach(() => {
  cleanup()
  channelError = null
  channelData = undefined
})

const root = { id: 'm1', channelId: 'c-release', seq: 1, senderId: 'u-1', content: 'Ship it', body: [], attachments: [], reactions: [], threadCount: 2, mentions: [], createdAt: '2026-10-28T09:00:00.000Z' } as unknown as ChatMessage
let channelError: Error | null = null
let channelData: unknown = undefined
// The file actions read my Saved (spec 6.9 Save for later).
vi.mock('@/api/saved', () => ({ useSaved: () => ({ data: [] }), useSave: () => ({ mutate: () => {} }), useRemoveSaved: () => ({ mutate: () => {} }) }))
vi.mock('@/api/chat', () => ({
  useMessage: () => ({ data: root, error: null, isError: false, isPending: false }),
  useChannel: () => ({ data: channelData, error: channelError, isError: channelError !== null, isLoading: false, refetch: vi.fn() }),
  useThread: () => ({ data: [], isError: false, isPending: false }),
  useReply: () => ({ error: null }),
  useSetFollowing: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/api/users', () => ({ useUsers: () => ({ data: [], isLoading: false }) }))
vi.mock('@/api/projects', () => ({ useProjectSummaries: () => ({ data: [] }) }))
vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering' } }) }))
vi.mock('@/lib/useRole', () => ({ useRole: () => ({ persona: { id: 'u-2', role: 'member' } }) }))
vi.mock('@/pages/chat/useCanPost', () => ({ useCanPost: () => null, useCanWrite: () => null, useReadOnlyLine: () => '' }))
vi.mock('@/pages/chat/useBodyContext', () => ({ useBodyContext: () => ({ users: [], tasks: new Map(), projectKeys: new Set(), ws: 'engineering', workspaceId: 'ws-eng' }), useProjectKeys: () => new Set() }))
vi.mock('@/pages/chat/useReplyFocus', () => ({ useReplyFocus: () => undefined }))
// The message rows have their own tests; here only the panel around them.
vi.mock('@/pages/chat/ChannelMessage', () => ({ ChannelMessage: () => null }))

describe('ThreadInspector when I’m taken off the channel (review)', () => {
  it('a channel that answers 403 says I’m not in it, with no Retry that can’t work', () => {
    channelError = new ApiError({ title: 'Forbidden', status: 403, detail: "You're not in this channel." })
    render(<MemoryRouter><ThreadInspector messageId="m1" onClose={() => {}} closeTo="/w/engineering" /></MemoryRouter>)
    expect(screen.getByText("You're not in this channel.")).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Retry|Try again/ })).toBeNull()
  })
})

describe('ThreadInspector panel (spec 6.7, .sf-panel)', () => {
  it('heads the panel "Thread" with "#channel" as a muted subline, in a 52px sf header', () => {
    channelData = { id: 'c-release', workspaceId: 'ws-eng', kind: 'channel', name: 'release', memberIds: ['u-2'], archivedAt: null }
    render(<MemoryRouter><ThreadInspector messageId="m1" onClose={() => {}} closeTo="/w/engineering" /></MemoryRouter>)
    const panel = screen.getByRole('complementary', { name: 'Thread' })
    expect(panel.className.split(' ')).toContain('sf')
    const title = screen.getByRole('heading', { level: 2 })
    expect(title.textContent).toBe('Thread')
    const head = title.closest('header')!
    expect(head.className.split(' ')).toEqual(expect.arrayContaining(['h-sf-header', 'border-sf-line']))
    expect(head.textContent).toContain('#release')
    expect(screen.getByText('#release').className).toContain('text-sf-text-muted')
    expect(screen.getByRole('button', { name: 'Close thread' })).toBeTruthy()
  })

  it('the "N replies" divider uses the chat tokens', () => {
    channelData = { id: 'c-release', workspaceId: 'ws-eng', kind: 'channel', name: 'release', memberIds: ['u-2'], archivedAt: null }
    render(<MemoryRouter><ThreadInspector messageId="m1" onClose={() => {}} closeTo="/w/engineering" /></MemoryRouter>)
    const count = screen.getByText('2 replies')
    expect(count.parentElement!.className).toContain('text-sf-text-muted')
    expect(count.nextElementSibling!.className).toContain('bg-sf-line')
  })
})
