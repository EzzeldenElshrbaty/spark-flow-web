// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Sidebar, SidebarContent, SidebarHeader } from '@/layout/Sidebar'
import { avatarTone } from '@/components/Avatar'
import { initialUiState, useUiStore } from '@/lib/uiStore'
import { ALL_PERMISSIONS } from '@/lib/permissions'

const workspace = { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' }
const channel = (id: string, name: string) => ({ channel: { id, name, kind: 'channel', isPrivate: false, unreadCount: 0, muted: false, starred: false, notifyLevel: 'mentions', memberIds: [] }, label: name, presence: 'offline', group: false, otherId: '', draft: false })

vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace }) }))
vi.mock('@/lib/useRole', () => ({ useRole: () => ({ grants: ALL_PERMISSIONS, persona: { id: 'u-1', roleIds: ['admin'], grants: ALL_PERMISSIONS } }) }))
let allow = (_action: string) => true
vi.mock('@/lib/usePermission', () => ({ usePermission: () => (action: string) => allow(action) }))
vi.mock('@/layout/NewTaskButton', () => ({ NewTaskButton: () => <button type="button">New task</button> }))
vi.mock('@/layout/useGoToMode', () => ({ useGoToMode: () => () => true }))
const setOrder = vi.fn()
let customOrder = { starred: false, channels: false, projects: false }
let orderError: string | null = null
let dms: unknown[] = []
vi.mock('@/api/sidebar', () => ({ useSaveSidebarOrder: () => ({ save: setOrder, error: orderError }) }))
vi.mock('@/layout/useSidebarGroups', () => ({
  useSidebarGroups: () => ({
    customOrder,
    workspace,
    starred: [],
    channels: [channel('c-general', 'general'), channel('c-backend', 'backend')],
    dms,
    apps: [],
    projects: [{ id: 'p-nex', key: 'NEX', name: 'Nexus Core', managerId: 'u-1' }],
    mentions: { byChannel: new Map() },
    activityUnread: 0,
    threadsUnread: 2,
    savedInProgress: 0,
    draftsAndScheduled: 0,
    chatCount: 2,
    projectNews: 0,
    chatLoading: false,
    projectsLoading: false,
    failed: false,
  }),
}))

beforeEach(() => {
  allow = () => true
  useUiStore.setState(initialUiState)
  customOrder = { starred: false, channels: false, projects: false }
  orderError = null
  dms = []
  setOrder.mockReset()
})
afterEach(cleanup)
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const at = (path: string, ui: React.ReactNode) => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>)
const nav = () => screen.getByRole('navigation', { name: 'Workspace' })

describe('The sidebar shows one side of Flow at a time (spec 5.5)', () => {
  it('on the Projects side: Work, Manage and the projects, no chat rows', () => {
    at('/w/engineering/p/NEX/tasks', <SidebarContent />)
    for (const name of ['My work', 'Projects', 'Teams', 'Dashboard', 'Time & cost', 'Nexus Core']) {
      expect(within(nav()).getByRole('link', { name }), name).toBeTruthy()
    }
    for (const name of ['Activity', 'Saved', 'general']) expect(within(nav()).queryByRole('link', { name }), name).toBeNull()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeTruthy()
  })

  it('the Work group lists Dashboard first, then My work, for a Member (dashboard start; UX Phase 2)', () => {
    allow = () => false
    at('/w/engineering/p/NEX/tasks', <SidebarContent />)
    const list = document.getElementById(screen.getByRole('button', { name: 'Work' }).getAttribute('aria-controls')!)!
    expect(within(list).getAllByRole('link').map((a) => a.textContent)).toEqual(['Dashboard', 'My work', 'Projects', 'Teams'])
    // Manage keeps Time & cost only, for whoever may see it.
    expect(screen.queryByRole('button', { name: 'Manage' })).toBeNull()
    expect(within(nav()).getAllByRole('link', { name: 'Dashboard' })).toHaveLength(1)
  })

  it('on the Chat side: the chat views, channels and DMs, no project rows', () => {
    at('/w/engineering/c/c-general', <SidebarContent />)
    for (const name of ['Activity', 'Drafts & sent', 'Saved', 'general', 'backend']) {
      expect(within(nav()).getByRole('link', { name }), name).toBeTruthy()
    }
    expect(within(nav()).getByRole('button', { name: /Channels/ })).toBeTruthy()
    for (const name of ['My work', 'Dashboard', 'Nexus Core']) expect(within(nav()).queryByRole('link', { name }), name).toBeNull()
    // The switch already says Chat: the quick links need no heading of their own.
    expect(within(nav()).queryByRole('button', { name: /^Chat/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeTruthy()
  })

  it('Threads is for everyone (no flag), bold with how many followed threads have new replies (spec 6.12)', () => {
    at('/w/engineering/c/c-general', <SidebarContent />)
    const row = within(nav()).getByRole('link', { name: 'Threads, 2 with new replies' })
    expect(row.getAttribute('href')).toBe('/w/engineering/threads')
    expect(row.className).toContain('font-semibold')
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

describe('my order of Channels (spec 5.1 drag to reorder)', () => {
  it('rows can be moved: each says how, to a screen reader', () => {
    at('/w/engineering/c/c-general', <SidebarContent />)
    const id = within(nav()).getByRole('link', { name: 'backend' }).getAttribute('aria-describedby')
    expect(id && document.getElementById(id)?.textContent).toMatch(/press Space/)
  })
  it('not in the collapsed rail', () => {
    at('/w/engineering/c/c-general', <SidebarContent collapsed />)
    expect(within(nav()).getByRole('link', { name: 'backend' }).getAttribute('aria-describedby')).toBeNull()
  })
  it('Sort A–Z shows once I have an order, and throws it away', () => {
    at('/w/engineering/c/c-general', <SidebarContent />)
    expect(screen.queryByRole('button', { name: 'Channels options' })).toBeNull()
    cleanup()
    customOrder = { starred: false, channels: true, projects: false }
    at('/w/engineering/c/c-general', <SidebarContent />)
    fireEvent.click(screen.getByRole('button', { name: 'Channels options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sort A–Z' }))
    expect(setOrder).toHaveBeenCalledWith('channels', [])
  })
  it('a refused save says so under its section', () => {
    orderError = 'channels'
    at('/w/engineering/c/c-general', <SidebarContent />)
    expect(screen.getByRole('alert').textContent).toBe('Couldn’t save the order. Try again.')
  })
})

describe('my order of Projects (slice Y+)', () => {
  it('project rows can be moved, not in the collapsed rail', () => {
    at('/w/engineering/p/NEX/tasks', <SidebarContent />)
    const id = within(nav()).getByRole('link', { name: 'Nexus Core' }).getAttribute('aria-describedby')
    expect(id && document.getElementById(id)?.textContent).toMatch(/press Space/)
    cleanup()
    at('/w/engineering/p/NEX/tasks', <SidebarContent collapsed />)
    expect(within(nav()).getByRole('link', { name: 'Nexus Core' }).getAttribute('aria-describedby')).toBeNull()
  })
  it('Reset order shows once I have one, and goes back to the default order', () => {
    at('/w/engineering/p/NEX/tasks', <SidebarContent />)
    expect(screen.queryByRole('button', { name: 'Projects options' })).toBeNull()
    cleanup()
    customOrder = { starred: false, channels: false, projects: true }
    at('/w/engineering/p/NEX/tasks', <SidebarContent />)
    fireEvent.click(screen.getByRole('button', { name: 'Projects options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset order' }))
    expect(setOrder).toHaveBeenCalledWith('projects', [])
  })
  it('a refused save says so under Projects', () => {
    orderError = 'projects'
    at('/w/engineering/p/NEX/tasks', <SidebarContent />)
    expect(screen.getByRole('alert').textContent).toBe('Couldn’t save the order. Try again.')
  })
})

describe('my own notes in Direct messages (UX Phase 3 final review: one person, one avatar)', () => {
  it('the avatar is coloured by my name, not by its "(you)" label', () => {
    dms = [{ channel: { id: 'c-me', kind: 'dm', memberIds: ['u-1'], muted: false }, label: 'Hossam Gaber (you)', presence: 'active', group: false, otherId: 'u-1', otherName: 'Hossam Gaber', draft: false }]
    at('/w/engineering/c/c-general', <SidebarContent />)
    const avatar = document.querySelector('a[href="/w/engineering/c/c-me"] .rounded-full')!
    expect(avatar.className).toContain(avatarTone('Hossam Gaber'))
  })
})
