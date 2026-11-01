// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileBottomBar, MobileDrawer } from '@/layout/MobileNav'
import { initialUiState, useUiStore } from '@/lib/uiStore'

const workspace = { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' }
vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace }) }))
vi.mock('@/api/chat', () => ({ useChannels: () => ({ data: [{ id: 'c-general', kind: 'channel', name: 'general' }, { id: 'c-backend', kind: 'channel', name: 'backend' }] }) }))
vi.mock('@/api/tickets', () => ({ useProjects: () => ({ data: [{ id: 'p-nex', key: 'NEX', workspaceId: 'ws-eng' }] }) }))
vi.mock('@/layout/Sidebar', () => ({ Logo: () => <span>Logo</span>, SidebarContent: () => <nav aria-label="Workspace" /> }))
vi.mock('@/layout/ModeSwitch', () => ({ WorkspaceModeSwitch: ({ size }: { size: string }) => <div role="tablist" aria-label="Workspace" data-size={size} /> }))

beforeEach(() => useUiStore.setState(initialUiState))
afterEach(cleanup)

const bar = (path: string) => render(<MemoryRouter initialEntries={[path]}><MobileBottomBar onOpenMore={() => {}} /></MemoryRouter>)
const tab = (name: string) => within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name })

describe('Phone navigation (spec 5.5, 6.16)', () => {
  it('Chat and Projects reopen the last place on their side', () => {
    useUiStore.getState().visit('engineering', '/w/engineering/c/c-backend')
    useUiStore.getState().visit('engineering', '/w/engineering/dashboard')
    bar('/w/engineering/settings')
    expect(tab('Chat').getAttribute('href')).toBe('/w/engineering/c/c-backend')
    expect(tab('Projects').getAttribute('href')).toBe('/w/engineering/dashboard')
  })

  it('a side with no saved place opens on #general, or the project list (Home has its own tab)', () => {
    bar('/w/engineering/settings')
    expect(tab('Chat').getAttribute('href')).toBe('/w/engineering/c/c-general')
    // Home has its own tab here, so Projects starts on the project list.
    expect(tab('Projects').getAttribute('href')).toBe('/w/engineering/projects')
  })

  it('lights Chat on every chat page and Projects on the project pages, Home on its own', () => {
    bar('/w/engineering/saved')
    expect(tab('Chat').className).toContain('text-sf-accent')
    cleanup()
    bar('/w/engineering/teams')
    expect(tab('Projects').className).toContain('text-sf-accent')
    cleanup()
    bar('/w/engineering')
    expect(tab('Home').className).toContain('text-sf-accent')
    expect(tab('Projects').className).not.toContain('text-sf-accent')
  })

  it('the menu drawer has the switch, 48px for touch, above the side’s rows', () => {
    render(<MemoryRouter initialEntries={['/w/engineering/c/c-general']}><MobileDrawer open onClose={() => {}} /></MemoryRouter>)
    const dialog = screen.getByRole('dialog', { name: 'Menu' })
    const switcher = within(dialog).getByRole('tablist', { name: 'Workspace' })
    expect(switcher.getAttribute('data-size')).toBe('phone')
    expect(switcher.compareDocumentPosition(within(dialog).getByRole('navigation', { name: 'Workspace' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
