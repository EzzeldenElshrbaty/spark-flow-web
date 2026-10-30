// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGoToMode } from '@/layout/useGoToMode'
import { initialUiState, useUiStore } from '@/lib/uiStore'

const navigate = vi.fn()
let channels: { id: string; kind: string; name: string }[] | undefined
vi.mock('react-router', async (original) => ({ ...(await original<typeof import('react-router')>()), useNavigate: () => navigate }))
vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' } }) }))
vi.mock('@/api/chat', () => ({ useChannels: () => ({ data: channels }) }))
vi.mock('@/api/tickets', () => ({ useProjects: () => ({ data: [{ id: 'p-nex', key: 'NEX', workspaceId: 'ws-eng' }] }) }))

beforeEach(() => {
  vi.clearAllMocks()
  useUiStore.setState(initialUiState)
  channels = [{ id: 'c-general', kind: 'channel', name: 'general' }, { id: 'c-backend', kind: 'channel', name: 'backend' }]
})

const goTo = () => renderHook(() => useGoToMode(), { wrapper: ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter> }).result.current

describe('useGoToMode (spec 5.5)', () => {
  it('opens the last place on that side, else its start', () => {
    useUiStore.getState().visit('engineering', '/w/engineering/c/c-backend')
    expect(goTo()('chat')).toBe(true)
    expect(navigate).toHaveBeenLastCalledWith('/w/engineering/c/c-backend')
    expect(goTo()('projects')).toBe(true)
    expect(navigate).toHaveBeenLastCalledWith('/w/engineering')
  })

  it('waits, and says so, while the channel list is still loading', () => {
    channels = undefined
    expect(goTo()('chat')).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })
})
