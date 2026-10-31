import '@/index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import type { AuditEvent, Role } from '@/api/types'
import { api } from '@/lib/api'
import { chainEvent, GENESIS } from '@/lib/auditChain'
import { ALL_PERMISSIONS, BUILT_IN_ROLES } from '@/lib/permissions'
import { AuditLogPage } from './AuditLogPage'
import { RolesPage } from './RolesPage'
import { SettingsPage } from './SettingsPage'

// Spec 10 and CLAUDE.md: Settings and Roles and permissions read well in light and dark (axe, contrast included) and
// fit a 390px phone.

const roles: Role[] = [
  ...BUILT_IN_ROLES.map((r) => ({ id: r.id, name: r.name, builtIn: true, grants: [...r.grants], holders: r.id === 'member' ? 5 : 1 })),
  { id: 'role-qa', name: 'QA lead', builtIn: false, grants: [], holders: 0 },
]

/** A few entries of every kind, chained, newest last; one with a long record name and many changes. */
function auditEvents(): AuditEvent[] {
  const out: AuditEvent[] = []
  const kinds = [
    { action: 'signedIn', group: 'access', record: { type: 'user', id: 'u-1', name: 'Youssef Abdelrahman' }, changes: [], result: 'done', detail: 'Password' },
    { action: 'changed', group: 'data', record: { type: 'project', id: 'p-nex', name: 'Nexus Core' }, changes: [{ field: 'Due date', from: '28 Nov 2026', to: '5 Dec 2026' }, { field: 'Manager', from: 'Nour El-Sayed', to: 'Ahmed Shawky' }], result: 'done', detail: null },
    { action: 'signInFailed', group: 'access', record: null, changes: [], result: 'failed', detail: 'Wrong password' },
    { action: 'archived', group: 'status', record: { type: 'task', id: 'NEX-104', name: 'NEX-104 · Invoice export drops the last row when the month has thirty-one days' }, changes: [], result: 'done', detail: null },
    { action: 'denied', group: 'access', record: { type: 'request', id: 'rates.list', name: 'rates.list' }, changes: [], result: 'refused', detail: "You don't have access to hourly costs." },
    { action: 'exported', group: 'exports', record: { type: 'data', id: 'all', name: 'All demo data' }, changes: [], result: 'done', detail: null },
  ] as const
  kinds.forEach((k, i) =>
    out.push(
      chainEvent(
        { seq: i + 1, at: new Date(Date.now() - (10 - i) * 60_000).toISOString(), actorId: 'u-1', actorName: 'Youssef Abdelrahman', actorRoles: 'Admin', ip: '156.199.4.21', device: 'Chrome 130 · macOS', requestId: `req-${i + 1}`, ...k, record: k.record, changes: [...k.changes] },
        out.at(-1)?.hash ?? GENESIS,
      ),
    ),
  )
  return out
}

beforeEach(() => {
  const events = auditEvents()
  vi.spyOn(api.audit, 'list').mockResolvedValue({ items: [...events].reverse(), nextCursor: '1', counts: { all: 6, data: 1, status: 1, access: 3, settings: 0, exports: 1 } })
  vi.spyOn(api.audit, 'summary').mockResolvedValue({
    today: { events: 6, data: 1, signIns: 1, failedSignIns: 1, denied: 1 },
    needsALook: [
      { tone: 'red', text: '3 failed sign-ins for k.hasan@spark-sys.com from 105.196.66.3 in 4 minutes', at: events[2]!.at, seq: 3 },
      { tone: 'amber', text: 'Youssef Abdelrahman exported all the demo data', at: events[5]!.at, seq: 6 },
    ],
    chain: { intact: false, checked: 6, brokenAt: 2, reason: 'edited' },
    people: [{ id: 'u-1', name: 'Youssef Abdelrahman' }],
    recordTypes: [{ id: 'project', label: 'Projects' }, { id: 'task', label: 'Tasks' }],
  })
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
            <Route path="/w/:ws/settings/audit" element={element} />
          </Routes>
        </main>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Axe over the whole page; `region` is left out: menus open in a portal outside the page's landmarks. */
async function violations() {
  // Fades and pop-ins end first (not the endless pulses): axe reads a half-faded row as low contrast.
  const finite = document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
  await Promise.all(finite.map((a) => a.finished.catch(() => undefined)))
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

describe.each([
  ['light', false],
  ['dark', true],
])('the audit log in %s (slice 2, spec 10)', (_theme, dark) => {
  it('the page, with a broken chain and an entry open, has no axe violations', async () => {
    await page.viewport(1280, 900)
    mount('/w/engineering/settings/audit', <AuditLogPage />, dark)
    await screen.findByRole('table', { name: 'Audit log' })
    await screen.findByText('Broken')
    expect(await violations()).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: 'Open entry 2' }))
    await screen.findByRole('dialog', { name: '#2 · Changed' })
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

  it('the audit log fits: a list instead of the table, the kinds scroll inside their strip, rows and alerts are 44px', async () => {
    await page.viewport(390, 844)
    mount('/w/engineering/settings/audit', <AuditLogPage />, false)
    const list = await screen.findByRole('list', { name: 'Audit log' })
    expect(screen.queryByRole('table', { name: 'Audit log' })).toBeNull()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390)
    for (const button of [...list.querySelectorAll('button'), ...screen.getByRole('region', { name: 'Needs a look' }).querySelectorAll('button')]) {
      expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    }
    // Export keeps its name for screen readers when only its icon shows.
    expect(screen.getByRole('button', { name: 'Export CSV' }).getBoundingClientRect().width).toBeLessThan(80)
    await userEvent.click(list.querySelectorAll('button')[0]!)
    const sheet = await screen.findByRole('dialog', { name: '#6 · Exported' })
    expect(sheet.getBoundingClientRect().width).toBeLessThanOrEqual(390)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390)
    expect(await violations()).toEqual([])
  })
})
