// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Channel, ProjectSummary } from '@/api/types'
import { useChannelProject, useChannelRights } from '@/pages/chat/ChannelActions'
import { ALL_PERMISSIONS } from '@/lib/permissions'

let active: ProjectSummary[] | undefined = []
let archived: ProjectSummary[] | undefined = []
vi.mock('@/api/projects', () => ({
  useProjectSummaries: () => ({ data: active }),
  useArchivedProjects: (_: string, enabled: boolean) => ({ data: enabled ? archived : undefined }),
}))
vi.mock('@/lib/useRole', () => ({ useRole: () => ({ persona: { id: 'u-1', roleIds: ['admin'], grants: ALL_PERMISSIONS } }) }))

const channel = { id: 'c-nex', workspaceId: 'ws-eng', kind: 'channel', name: 'nexus-core', isPrivate: false, memberIds: ['u-1'], whoCanPost: 'everyone' } as Channel
const nexus = { id: 'p-nex', key: 'NEX', name: 'Nexus Core', channelId: 'c-nex' } as ProjectSummary

describe('useChannelProject: the project a channel follows (review)', () => {
  it('finds it among the active projects', () => {
    active = [nexus]
    expect(renderHook(() => useChannelProject(channel)).result.current).toEqual({ known: true, project: nexus })
  })

  it('an archived project’s channel finds it among the archived ones, once they’re in', () => {
    active = []
    archived = undefined
    const gone = { ...channel, archivedAt: '2026-10-28T10:00:00.000Z' }
    expect(renderHook(() => useChannelProject(gone)).result.current).toEqual({ known: false, project: undefined })
    archived = [nexus]
    expect(renderHook(() => useChannelProject(gone)).result.current).toEqual({ known: true, project: nexus })
    expect(renderHook(() => useChannelRights(gone)).result.current).toEqual({ manage: false, leave: false, archive: false })
  })

  it('a channel no project names has none', () => {
    active = [nexus]
    expect(renderHook(() => useChannelProject({ ...channel, id: 'c-backend' })).result.current).toEqual({ known: true, project: undefined })
  })
})
