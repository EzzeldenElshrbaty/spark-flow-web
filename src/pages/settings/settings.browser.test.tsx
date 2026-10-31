import '@/index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import type { Role } from '@/api/types'
import { api } from '@/lib/api'
import { ALL_PERMISSIONS, BUILT_IN_ROLES } from '@/lib/permissions'
import { RolesPage } from './RolesPage'
import { SettingsPage } from './SettingsPage'

// Spec 10 and CLAUDE.md: Settings and Roles and permissions read well in light and dark (axe, contrast included) and
// fit a 390px phone.

const roles: Role[] = [
  ...BUILT_IN_ROLES.map((r) => ({ id: r.id, name: r.name, builtIn: true, grants: [...r.grants], holders: r.id === 'member' ? 5 : 1 })),
  { id: 'role-qa', name: 'QA lead', builtIn: false, grants: [], holders: 0 },
]

beforeEach(() => {
  vi.spyOn(api.users, 'me').mockResolvedValue({ id: 'u-1', name: 'Youssef Abdelrahman', email: 'y@spark-sys.com', title: 'Managing Director', roleIds: ['admin'], presence: 'active', teamIds: [], grants: [...ALL_PERMISSIONS] })
  vi.spyOn(api.roles, 'list').mockResolvedValue(roles)
  vi.spyOn(api.workspaces, 'list').mockResolvedValue([{ id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' }])
  vi.spyOn(api.users, 'list').mockResolvedValue([])
  vi.spyOn(api.teams, 'list').mockResolvedValue([])
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  document.documentElement.classList.remove('dark')
  await page.viewport(414, 896)
})

function mount(path: string, element: ReactNode, dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <main className="bg-canvas p-4">
          <Routes>
            <Route path="/w/:ws/settings" element={element} />
            <Route path="/w/:ws/settings/roles" element={element} />
          </Routes>
        </main>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Axe over the whole page; `region` is left out: menus open in a portal outside the page's landmarks. */
async function violations() {
  const result = await axe.run(document, { rules: { region: { enabled: false } } })
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((node) => node.target.join(' ')).join(', ')}`)
}

describe.each([
  ['light', false],
  ['dark', true],
])('Settings in %s (slice 1, spec 10)', (_theme, dark) => {
  it('the Settings home has no axe violations', async () => {
    mount('/w/engineering/settings', <SettingsPage />, dark)
    await screen.findByText('5 roles')
    expect(await violations()).toEqual([])
  })

  it('Roles and permissions, with a change waiting and a role’s menu open, has no axe violations', async () => {
    await page.viewport(1280, 900)
    mount('/w/engineering/settings/roles', <RolesPage />, dark)
    await screen.findByRole('table', { name: 'Permissions by role' })
    await userEvent.click(screen.getByRole('checkbox', { name: 'Member: Create projects' }))
    expect(screen.getByText('1 change not saved')).toBeTruthy()
    await userEvent.click(screen.getAllByRole('button', { name: 'QA lead actions' })[0])
    expect(await violations()).toEqual([])
  })
})

describe('Settings on a 390px phone', () => {
  it('the home and the roles page fit without sideways scrolling; the roles page shows one role at a time', async () => {
    await page.viewport(390, 844)
    mount('/w/engineering/settings', <SettingsPage />, false)
    await screen.findByText('5 roles')
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390)
    cleanup()
    mount('/w/engineering/settings/roles', <RolesPage />, false)
    const group = await screen.findByRole('group', { name: 'One role’s permissions' })
    expect(group.getBoundingClientRect().width).toBeGreaterThan(300)
    // The matrix is hidden; its scroller can't push the page sideways.
    expect(screen.queryByRole('table', { name: 'Permissions by role' })).toBeNull()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390)
    // Each permission row is a 44px touch target.
    const row = screen.getByRole('checkbox', { name: 'Create projects' }).closest('label')!
    expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    expect(await violations()).toEqual([])
  })
})
