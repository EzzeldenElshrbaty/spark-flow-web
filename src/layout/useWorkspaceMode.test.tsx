// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceMode } from '@/layout/useWorkspaceMode'
import { initialUiState, useUiStore } from '@/lib/uiStore'

vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' } }) }))

beforeEach(() => useUiStore.setState(initialUiState))

const modeAt = (path: string) =>
  renderHook(() => useWorkspaceMode(), { wrapper: ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter> }).result.current

describe('useWorkspaceMode (spec 5.5)', () => {
  it('reads the side from the address', () => {
    expect(modeAt('/w/engineering/c/c-backend')).toBe('chat')
    expect(modeAt('/w/engineering/p/NEX/tasks')).toBe('projects')
    expect(modeAt('/w/engineering')).toBe('projects')
  })

  it('keeps the side last opened in this workspace on a page both sides share', () => {
    useUiStore.getState().visit('engineering', '/w/engineering/dashboard')
    expect(modeAt('/w/engineering/search')).toBe('projects')
    useUiStore.getState().visit('engineering', '/w/engineering/activity')
    expect(modeAt('/w/engineering/search')).toBe('chat')
  })

  it('opens on Chat when nothing says otherwise', () => {
    expect(modeAt('/w/engineering/search')).toBe('chat')
  })

  it('Settings stays on the Projects side after a channel (UX Phase 2, 2.2)', () => {
    useUiStore.getState().visit('engineering', '/w/engineering/activity')
    expect(modeAt('/w/engineering/settings/users')).toBe('projects')
  })
})
