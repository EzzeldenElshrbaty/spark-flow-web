// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Channel } from '@/api/types'
import { ALL_PERMISSIONS, type Permission } from '@/lib/permissions'
import { FLOWBOT_ID } from '@/lib/flowbot'
import { useCanWrite } from '@/pages/chat/useCanPost'

let grants: readonly Permission[] = []
vi.mock('@/api/projects', () => ({ useProjectSummaries: () => ({ data: [], isPending: false, isError: false }) }))
vi.mock('@/api/users', () => ({ useMe: () => ({ data: { id: 'u-2', teamIds: [] } }) }))
vi.mock('@/lib/useRole', () => ({ useRole: () => ({ persona: { id: 'u-2', grants } }) }))

const channel = { id: 'c-backend', workspaceId: 'ws-eng', kind: 'channel', name: 'backend', isPrivate: false, memberIds: ['u-2'], whoCanPost: 'everyone' } as Channel

describe('useCanWrite: the composer, by who can post (spec §9)', () => {
  it('at Everyone whoever may post writes; at Only admins only an Admin', () => {
    grants = []
    expect(renderHook(() => useCanWrite(channel)).result.current).toBe(true)
    expect(renderHook(() => useCanWrite({ ...channel, whoCanPost: 'admins' })).result.current).toBe(false)
    grants = ALL_PERMISSIONS
    expect(renderHook(() => useCanWrite({ ...channel, whoCanPost: 'admins' })).result.current).toBe(true)
  })

  it('someone who can’t post at all can’t write either, and unknown stays unknown', () => {
    grants = []
    expect(renderHook(() => useCanWrite({ ...channel, isPrivate: true, memberIds: ['u-1'] })).result.current).toBe(false)
    expect(renderHook(() => useCanWrite(undefined)).result.current).toBe(null)
  })

  it('nobody writes in Flowbot’s DM', () => {
    grants = ALL_PERMISSIONS
    const dm = { ...channel, kind: 'dm', name: null, isPrivate: true, memberIds: ['u-2', FLOWBOT_ID] } as Channel
    expect(renderHook(() => useCanWrite(dm)).result.current).toBe(false)
  })
})
