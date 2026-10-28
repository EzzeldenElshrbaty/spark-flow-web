// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@/api/types'
import { ApiError } from '@/lib/apiError'
import { ThreadInspector } from '@/pages/chat/ThreadInspector'

afterEach(cleanup)

const root = { id: 'm1', channelId: 'c-release', seq: 1, senderId: 'u-1', content: 'Ship it', body: [], attachments: [], reactions: [], threadCount: 2, mentions: [], createdAt: '2026-10-28T09:00:00.000Z' } as unknown as ChatMessage
let channelError: Error | null = null
vi.mock('@/api/chat', () => ({
  useMessage: () => ({ data: root, error: null, isError: false, isPending: false }),
  useChannel: () => ({ data: undefined, error: channelError, isError: channelError !== null, isLoading: false, refetch: vi.fn() }),
  useThread: () => ({ data: [], isError: false, isPending: false }),
  useReply: () => ({ error: null }),
}))
vi.mock('@/api/users', () => ({ useUsers: () => ({ data: [], isLoading: false }) }))
vi.mock('@/api/projects', () => ({ useProjectSummaries: () => ({ data: [] }) }))
vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering' } }) }))
vi.mock('@/lib/useRole', () => ({ useRole: () => ({ persona: { id: 'u-2', role: 'member' } }) }))
vi.mock('@/pages/chat/useCanPost', () => ({ useCanPost: () => null, useCanWrite: () => null, useReadOnlyLine: () => '' }))
vi.mock('@/pages/chat/useBodyContext', () => ({ useBodyContext: () => ({}), useProjectKeys: () => new Set() }))
vi.mock('@/pages/chat/useReplyFocus', () => ({ useReplyFocus: () => undefined }))

describe('ThreadInspector when I’m taken off the channel (review)', () => {
  it('a channel that answers 403 says I’m not in it, with no Retry that can’t work', () => {
    channelError = new ApiError({ title: 'Forbidden', status: 403, detail: "You're not in this channel." })
    render(<MemoryRouter><ThreadInspector messageId="m1" onClose={() => {}} closeTo="/w/engineering" /></MemoryRouter>)
    expect(screen.getByText("You're not in this channel.")).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Retry|Try again/ })).toBeNull()
  })
})
