// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Channel } from '@/api/types'
import { ALL_PERMISSIONS, BUILT_IN_ROLES } from '@/lib/permissions'
import { ArchivedChannelLine } from './ChannelActions'

// UX Phase 1, 1.6: Restore channel is offered only to those the server lets restore it (Admins); a member who manages
// the channel reads why instead of meeting a 403.

let persona = { id: 'u-1', roleIds: ['admin'], grants: [...ALL_PERMISSIONS] }
vi.mock('@/lib/useRole', () => ({ useRole: () => ({ persona }) }))
vi.mock('@/api/projects', () => ({ useProjectSummaries: () => ({ data: [] }), useArchivedProjects: () => ({ data: [] }) }))
vi.mock('@/api/chat', () => ({ useRestoreChannel: () => ({ mutate: vi.fn(), isPending: false, error: null }), useArchiveChannel: () => ({ mutate: vi.fn(), isPending: false, error: null, reset: vi.fn() }) }))

afterEach(cleanup)

const channel = { id: 'c-frontend', workspaceId: 'ws-eng', kind: 'channel', name: 'frontend-dev', isPrivate: false, memberIds: ['u-1', 'u-3'], whoCanPost: 'everyone', archivedAt: '2026-11-01T10:00:00.000Z' } as Channel

describe('ArchivedChannelLine', () => {
  it('an Admin gets Restore channel', () => {
    render(<ArchivedChannelLine channel={channel} />)
    expect(screen.getByRole('button', { name: 'Restore channel' })).toBeTruthy()
  })

  it('a member who manages the channel reads that only Admins can restore it, and gets no button', () => {
    persona = { id: 'u-3', roleIds: ['member'], grants: [...BUILT_IN_ROLES.find((r) => r.id === 'member')!.grants] }
    render(<ArchivedChannelLine channel={channel} />)
    expect(screen.queryByRole('button', { name: 'Restore channel' })).toBeNull()
    expect(screen.getByText('Only Admins can restore channels.')).toBeTruthy()
  })
})
