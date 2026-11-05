import { describe, expect, it } from 'vitest'
import type { Channel, TaskView } from '@/api/types'
import { opensSearch, peopleShortcuts, shortcutsFor, taskShortcuts, workspaceShortcuts } from '@/layout/searchShortcuts'
import { seed } from '@/mocks/seed'
import { BUILT_IN_ROLES } from '@/lib/permissions'

const data = seed(new Date('2026-10-26T09:00:00Z')).data
const ws = data.workspaces.find((w) => w.slug === 'engineering')!
const chans: Channel[] = data.channels.filter((c) => c.workspaceId === ws.id).map((c) => ({ ...c, unreadCount: 0, lastSeq: 0, lastReadSeq: 0, starred: false, muted: false, notifyLevel: 'all' as const, notifyLevelOwn: false }))
const projects = data.projects.filter((p) => p.workspaceId === ws.id)
const nour = data.users.find((u) => u.id === 'u-2')!

describe('workspaceShortcuts', () => {
  const shortcuts = workspaceShortcuts(ws, chans, projects, data.users, 'u-1')

  it('offers channels, DMs and project boards of the workspace', () => {
    expect(shortcuts.map((s) => s.title)).toEqual(expect.arrayContaining(['#general', nour.name, 'Nexus Core · Board']))
  })

  it('links with the route helpers', () => {
    expect(shortcuts.find((s) => s.title === '#general')!.link).toBe('/w/engineering/c/c-general')
    expect(shortcuts.find((s) => s.title === nour.name)!.link).toBe('/w/engineering/c/c-dm-1')
    expect(shortcuts.find((s) => s.title === 'Nexus Core · Board')!.link).toBe('/w/engineering/p/NEX/tasks?view=board')
  })

  it('leaves out channels of other workspaces', () => {
    expect(shortcuts.map((s) => s.title)).not.toContain('#design')
  })

  it('gives each shortcut a unique id', () => {
    const ids = shortcuts.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('pages, tasks and people', () => {
  const grants = (role: string) => BUILT_IN_ROLES.find((r) => r.id === role)!.grants
  const titles = (role: string) => shortcutsFor(grants(role), 'engineering').pages.map((p) => p.title)

  it('a member finds Dashboard, Home, Projects, My tasks, Teams and Attendance; an admin also Time & cost and the rest of Settings', () => {
    expect(titles('member')).toEqual(['Dashboard', 'Home', 'Projects', 'My tasks', 'Teams', 'Settings', 'Attendance'])
    expect(titles('admin')).toEqual(['Dashboard', 'Home', 'Projects', 'My tasks', 'Teams', 'Time & cost', 'Settings', 'Users', 'Roles and permissions', 'Audit log', 'Attendance', 'Archived records', 'Rates', 'Database'])
    expect(shortcutsFor(grants('member'), 'engineering').pages[0]!.link).toBe('/w/engineering/dashboard')
  })

  it('everyone finds the Dashboard, whatever their roles (dashboard slice)', () => {
    for (const role of ['admin', 'sales', 'pm', 'member']) expect(shortcutsFor(grants(role), 'engineering').pages.map((p) => p.title), role).toContain('Dashboard')
    expect(shortcutsFor([], 'engineering').pages.map((p) => p.title)).toContain('Dashboard')
  })

  it('NEX-1 finds NEX-1 then NEX-10 in key order; a title word finds tasks; at most 5', () => {
    const task = (key: string, title: string) => ({ key, title, projectId: 'p-nex' }) as TaskView
    const tasks = [task('NEX-10', 'Rate limit'), task('NEX-2', 'Login page'), task('NEX-1', 'Refresh tokens'), task('NEX-11', 'Docs'), task('NEX-12', 'a'), task('NEX-13', 'b'), task('NEX-14', 'c')]
    const hits = taskShortcuts('engineering', tasks, projects, 'NEX-1')
    expect(hits.map((h) => h.title.split(' ·')[0])).toEqual(['NEX-1', 'NEX-10', 'NEX-11', 'NEX-12', 'NEX-13'])
    expect(hits[0]!.link).toBe('/w/engineering/p/NEX/tasks?ticket=NEX-1')
    expect(taskShortcuts('engineering', tasks, projects, 'login').map((h) => h.title)).toEqual(['NEX-2 · Login page'])
  })

  it('people match by name or title, never me, at most 5', () => {
    const found = peopleShortcuts(data.users, 'u-1', 'engineer')
    expect(found.length).toBeGreaterThan(0)
    expect(found.length).toBeLessThanOrEqual(5)
    expect(found.some((p) => p.userId === 'u-1')).toBe(false)
    expect(peopleShortcuts(data.users, 'u-1', 'nour').map((p) => p.userId)).toEqual(['u-2'])
    expect(peopleShortcuts(data.users, 'u-1', 'nour')[0]!.link).toBe('dm:u-2')
  })
})

describe('opensSearch (spec 10: ⌘/Ctrl+K)', () => {
  const key = (init: { key: string; metaKey?: boolean; ctrlKey?: boolean }, target: EventTarget | null = null, handled = false) =>
    ({ metaKey: false, ctrlKey: false, ...init, target, defaultPrevented: handled }) as unknown as KeyboardEvent

  it('opens on ⌘K and Ctrl+K, and on / when not typing', () => {
    expect(opensSearch(key({ key: 'k', metaKey: true }))).toBe(true)
    expect(opensSearch(key({ key: 'k', ctrlKey: true }))).toBe(true)
    expect(opensSearch(key({ key: '/' }))).toBe(true)
    expect(opensSearch(key({ key: 'k' }))).toBe(false)
  })

  it('leaves a key that a control already took, like ⌘K for Link in the composer (spec 6.8)', () => {
    expect(opensSearch(key({ key: 'k', metaKey: true }, null, true))).toBe(false)
  })
})

describe('searchPlaceholder (spec 5.5)', () => {
  it('leads with what each side looks for; both still search everything', async () => {
    const { searchPlaceholder } = await import('@/layout/searchShortcuts')
    expect(searchPlaceholder('projects')).toBe('Search projects, tasks, people…')
    expect(searchPlaceholder('chat')).toBe('Search channels, people, tasks…')
  })
})
