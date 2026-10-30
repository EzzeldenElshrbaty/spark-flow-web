// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Sidebar, SidebarContent, SidebarHeader } from '@/layout/Sidebar'
import { initialUiState, useUiStore } from '@/lib/uiStore'

const workspace = { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' }
const channel = (id: string, name: string) => ({ channel: { id, name, kind: 'channel', isPrivate: false, unreadCount: 0, muted: false, starred: false, notifyLevel: 'mentions', memberIds: [] }, label: name, presence: 'offline', group: false, otherId: '', draft: false })

vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace }) }))
vi.mock('@/lib/useRole', () => ({ useRole: () => ({ role: 'admin', persona: { id: 'u-1', role: 'admin' } }) }))
vi.mock('@/lib/usePermission', () => ({ usePermission: () => () => true }))
vi.mock('@/layout/NewTaskButton', () => ({ NewTaskButton: () => <button type="button">New task</button> }))
vi.mock('@/layout/useGoToMode', () => ({ useGoToMode: () => () => true }))
vi.mock('@/layout/useSidebarGroups', () => ({
  useSidebarGroups: () => ({
    workspace,
    starred: [],
    channels: [channel('c-general', 'general'), channel('c-backend', 'backend')],
    dms: [],
    apps: [],
    projects: [{ id: 'p-nex', key: 'NEX', name: 'Nexus Core', managerId: 'u-1' }],
    mentions: { byChannel: new Map() },
    activityUnread: 0,
    savedInProgress: 0,
    draftsAndScheduled: 0,
    chatCount: 2,
    projectNews: 0,
    chatLoading: false,
    projectsLoading: false,
    failed: false,
  }),
}))

beforeEach(() => useUiStore.setState(initialUiState))
afterEach(cleanup)
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const at = (path: string, ui: React.ReactNode) => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>)
const nav = () => screen.getByRole('navigation', { name: 'Workspace' })

describe('The sidebar shows one side of Flow at a time (spec 5.5)', () => {
  it('on the Projects side: Work, Manage and the projects, no chat rows', () => {
    at('/w/engineering/p/NEX/tasks', <SidebarContent />)
    for (const name of ['Home', 'Projects', 'My tasks', 'Teams', 'Dashboard', 'Time & cost', 'Nexus Core']) {
      expect(within(nav()).getByRole('link', { name }), name).toBeTruthy()
    }
    for (const name of ['Activity', 'Saved', 'general']) expect(within(nav()).queryByRole('link', { name }), name).toBeNull()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeTruthy()
  })

  it('on the Chat side: the chat views, channels and DMs, no project rows', () => {
    at('/w/engineering/c/c-general', <SidebarContent />)
    for (const name of ['Activity', 'Drafts & sent', 'Saved', 'general', 'backend']) {
      expect(within(nav()).getByRole('link', { name }), name).toBeTruthy()
    }
    expect(within(nav()).getByRole('button', { name: /Channels/ })).toBeTruthy()
    for (const name of ['Home', 'My tasks', 'Dashboard', 'Nexus Core']) expect(within(nav()).queryByRole('link', { name }), name).toBeNull()
    // The switch already says Chat: the quick links need no heading of their own.
    expect(within(nav()).queryByRole('button', { name: /^Chat/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeTruthy()
  })

  it('on a page both sides share, the side last opened stays', () => {
    useUiStore.getState().visit('engineering', '/w/engineering/dashboard')
    at('/w/engineering/settings', <SidebarContent />)
    expect(within(nav()).getByRole('link', { name: 'Dashboard' })).toBeTruthy()
  })

  it('the button by the logo follows the side: New message on Chat, New task on Projects', () => {
    at('/w/engineering/c/c-general', <SidebarHeader />)
    expect(screen.getByRole('button', { name: 'New message' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'New task' })).toBeNull()
    cleanup()
    at('/w/engineering/projects', <SidebarHeader />)
    expect(screen.getByRole('button', { name: 'New task' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'New message' })).toBeNull()
  })

  it('the desktop sidebar has the switch under the logo, upright when collapsed', () => {
    at('/w/engineering/c/c-general', <Sidebar collapsed={false} />)
    expect(screen.getByRole('tablist', { name: 'Workspace' }).getAttribute('aria-orientation')).toBe('horizontal')
    expect(screen.getByRole('tab', { name: 'Chat' }).getAttribute('aria-selected')).toBe('true')
    cleanup()
    at('/w/engineering/c/c-general', <Sidebar collapsed />)
    expect(screen.getByRole('tablist', { name: 'Workspace' }).getAttribute('aria-orientation')).toBe('vertical')
  })
})
