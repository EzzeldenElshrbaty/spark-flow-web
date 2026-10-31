// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ALL_PERMISSIONS, can, type Action, type Permission, type ProjectScoped } from '@/lib/permissions'
import { SettingsPage } from './SettingsPage'

let grants: readonly Permission[] = ALL_PERMISSIONS
vi.mock('@/lib/usePermission', () => ({ usePermission: () => (action: Exclude<Action, ProjectScoped>) => can(action, { userId: 'u-1', grants }) }))
vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' } }) }))
vi.mock('@/api/users', () => ({ useUsers: () => ({ data: Array.from({ length: 9 }, (_, i) => ({ id: `u-${i}` })) }) }))
vi.mock('@/api/roles', () => ({ useRoles: () => ({ data: [{ id: 'admin' }, { id: 'sales' }, { id: 'pm' }, { id: 'member' }] }) }))
vi.mock('@/api/projects', () => ({ useTeams: () => ({ data: [{ id: 't-1' }, { id: 't-2' }, { id: 't-3' }, { id: 't-4' }] }) }))

beforeEach(() => {
  grants = ALL_PERMISSIONS
})
afterEach(cleanup)

const show = () =>
  render(
    <MemoryRouter initialEntries={['/w/engineering/settings']}>
      <Routes>
        <Route path="/w/:ws/settings" element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('Settings home (slice 1, as the CRM’s)', () => {
  it('counts people, roles and teams, then groups what can be changed, each card opening its page', () => {
    show()
    expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeTruthy()
    const counts = screen.getByRole('list', { name: 'At a glance' })
    expect(within(counts).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['People9', 'Roles4', 'Teams4'])
    const access = screen.getByRole('region', { name: 'People and access' })
    const roles = within(access).getByRole('link', { name: /Roles and permissions/ })
    expect(roles.getAttribute('href')).toBe('/w/engineering/settings/roles')
    expect(roles.textContent).toContain('4 roles')
    const data = screen.getByRole('region', { name: 'Data' })
    expect(within(data).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/w/engineering/settings/rates', '/w/engineering/settings/database'])
  })

  it('shows only what the person may change', () => {
    grants = ['rates.manage']
    show()
    expect(screen.queryByRole('region', { name: 'People and access' })).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Data' })).getAllByRole('link').map((a) => a.textContent)).toEqual([expect.stringContaining('Hourly cost')])
  })
})
