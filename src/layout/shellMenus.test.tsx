// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MentionItem } from '@/api/types'
import { NotificationsMenu } from '@/layout/NotificationsMenu'
import { UserMenu } from '@/layout/UserMenu'
import { WorkspaceSwitcher } from '@/layout/WorkspaceSwitcher'

const setTheme = vi.fn()
const viewAs = vi.fn()
const markRead = vi.fn()
const navigate = vi.fn()
let mentions: MentionItem[] = []

vi.mock('react-router', async (original) => ({ ...(await original<typeof import('react-router')>()), useNavigate: () => navigate }))
vi.mock('@tanstack/react-query', async (original) => ({ ...(await original<typeof import('@tanstack/react-query')>()), useQueryClient: () => ({ clear: vi.fn() }) }))
vi.mock('@/lib/useTheme', () => ({ useTheme: () => ({ theme: 'light', setTheme }) }))
vi.mock('@/lib/useRole', () => ({ useRole: () => ({ persona: { id: 'u-1', name: 'Youssef Abdelrahman', title: 'Managing Director', role: 'admin' } }) }))
vi.mock('@/api/users', () => ({
  useUsers: () => ({ data: [{ id: 'u-1', name: 'Youssef Abdelrahman', role: 'admin', presence: 'active' }, { id: 'u-2', name: 'Nour El-Sayed', role: 'pm', presence: 'away' }] }),
  useViewAs: () => ({ mutate: viewAs, isPending: false, isError: false }),
}))
vi.mock('@/layout/useCurrentWorkspace', () => ({
  useCurrentWorkspace: () => ({
    workspace: { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' },
    workspaces: [{ id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' }, { id: 'ws-ops', slug: 'ops', name: 'Spark Ops' }],
  }),
}))
vi.mock('@/api/workspaces', () => ({ useWorkspaces: () => ({ data: [{ id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' }] }) }))
vi.mock('@/api/mentions', () => ({
  useMyMentions: () => ({ data: mentions, refetch: vi.fn(), isFetching: false, isError: false }),
  useMarkMentionsRead: () => ({ mutate: markRead }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mentions = []
})
afterEach(cleanup)
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const show = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)
const open = (name: RegExp) => act(async () => fireEvent.click(screen.getByRole('button', { name })))
const LEGACY = /(^|\s)(text-fg|text-fg-\w+|bg-surface(-\w+)?|border-line(-\w+)?|text-accent|bg-accent-soft\S*|rounded-lg|rounded-xl|text-xs|text-sm)(\s|$)/

/** The redesign's menus (spec 3.1): inside the chat tokens, Tabler icons only, none of the Spark CRM classes. */
function expectSf(panel: HTMLElement) {
  expect(panel.closest('.sf')).not.toBeNull()
  for (const el of [panel, ...panel.querySelectorAll<HTMLElement>('*')]) {
    const cls = el.getAttribute('class') ?? ''
    expect(cls, el.outerHTML.slice(0, 120)).not.toMatch(LEGACY)
  }
  for (const svg of panel.querySelectorAll('svg')) expect(svg.getAttribute('class') ?? '').toContain('tabler-icon')
}

describe('UserMenu (spec 5.2: the account menu)', () => {
  it('names me, switches the theme, lists View as, and has Change password and Log out as coming soon', async () => {
    show(<UserMenu />)
    await open(/Youssef Abdelrahman/)
    const menu = screen.getByRole('menu', { name: 'Account' })
    expect(menu.textContent).toContain('Admin · Managing Director')
    expect(screen.getByRole('menuitemradio', { name: /Light/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('menuitemradio', { name: /Nour El-Sayed/ }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('menuitem', { name: /Change password/ }).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('menuitem', { name: /Log out/ }).getAttribute('aria-disabled')).toBe('true')
    expectSf(menu)
    await act(async () => fireEvent.click(screen.getByRole('menuitemradio', { name: /Dark/ })))
    expect(setTheme).toHaveBeenCalledWith('dark')
  })

  it('View as someone else switches to them', async () => {
    show(<UserMenu />)
    await open(/Youssef Abdelrahman/)
    await act(async () => fireEvent.click(screen.getByRole('menuitemradio', { name: /Nour El-Sayed/ })))
    expect(viewAs).toHaveBeenCalledWith('u-2', expect.anything())
  })
})

describe('WorkspaceSwitcher (spec 5.2)', () => {
  it('lists the workspaces with a check on the open one, and opens another', async () => {
    show(<WorkspaceSwitcher />)
    await open(/Workspace: Spark Engineering/)
    const menu = screen.getByRole('menu', { name: 'Workspace' })
    expect(screen.getByRole('menuitemradio', { name: /Spark Engineering/ }).getAttribute('aria-checked')).toBe('true')
    expectSf(menu)
    await act(async () => fireEvent.click(screen.getByRole('menuitemradio', { name: /Spark Ops/ })))
    expect(navigate).toHaveBeenCalledWith('/w/ops')
  })
})

describe('NotificationsMenu (spec 5.2: the bell)', () => {
  const item = (id: string, read: boolean): MentionItem => ({
    id, source: 'message', authorId: 'u-2', authorName: 'Nour El-Sayed', excerpt: `ping ${id}`, createdAt: new Date().toISOString(), read,
    workspaceId: 'ws-eng', channelId: 'c-general', messageId: id, taskKey: null, projectId: null,
  })

  it('lists my mentions, filters to unread, marks all read, and opens one', async () => {
    mentions = [item('m1', false), item('m2', true)]
    show(<NotificationsMenu />)
    await open(/Notifications, 1 unread/)
    const panel = screen.getByRole('dialog', { name: 'Notifications' })
    expectSf(panel)
    expect(panel.textContent).toContain('ping m2')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^Unread/ })))
    expect(panel.textContent).not.toContain('ping m2')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' })))
    expect(markRead).toHaveBeenCalledWith(['m1'])
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Nour El-Sayed mentioned you/ })))
    expect(markRead).toHaveBeenLastCalledWith(['m1'])
    expect(navigate).toHaveBeenCalled()
  })
})
