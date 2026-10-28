// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Channel, Role } from '@/api/types'
import { useCanWrite } from '@/pages/chat/useCanPost'

let role: Role = 'member'
vi.mock('@/api/projects', () => ({ useProjectSummaries: () => ({ data: [], isPending: false, isError: false }) }))
vi.mock('@/api/users', () => ({ useMe: () => ({ data: { id: 'u-2', teamIds: [] } }) }))
vi.mock('@/lib/useRole', () => ({ useRole: () => ({ persona: { id: 'u-2', role } }) }))

const channel = { id: 'c-backend', workspaceId: 'ws-eng', kind: 'channel', name: 'backend', isPrivate: false, memberIds: ['u-2'], whoCanPost: 'everyone' } as Channel

describe('useCanWrite: the composer, by who can post (spec §9)', () => {
  it('at Everyone whoever may post writes; at Only admins only an Admin', () => {
    role = 'member'
    expect(renderHook(() => useCanWrite(channel)).result.current).toBe(true)
    expect(renderHook(() => useCanWrite({ ...channel, whoCanPost: 'admins' })).result.current).toBe(false)
    role = 'admin'
    expect(renderHook(() => useCanWrite({ ...channel, whoCanPost: 'admins' })).result.current).toBe(true)
  })

  it('someone who can’t post at all can’t write either, and unknown stays unknown', () => {
    role = 'member'
    expect(renderHook(() => useCanWrite({ ...channel, isPrivate: true, memberIds: ['u-1'] })).result.current).toBe(false)
    expect(renderHook(() => useCanWrite(undefined)).result.current).toBe(null)
  })
})
