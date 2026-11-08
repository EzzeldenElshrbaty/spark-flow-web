// @vitest-environment jsdom
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router'
import { UnsavedChangesBlocker } from '@/layout/UnsavedChangesBlocker'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Me, Role, RoleChange } from '@/api/types'
import { api, ApiError } from '@/lib/api'
import { ALL_PERMISSIONS, BUILT_IN_ROLES } from '@/lib/permissions'
import { RolesPage } from './RolesPage'

window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

let roles: Role[]
/** The server's side of Save changes: additions and removals onto the role as it is now. */
const apply = (c: RoleChange) => {
  const role = roles.find((r) => r.id === c.roleId)!
  role.grants = ALL_PERMISSIONS.filter((p) => !c.remove.includes(p) && (c.add.includes(p) || role.grants.includes(p)))
}
let me: Me
let saveGrants: ReturnType<typeof vi.fn>
beforeEach(() => {
  roles = BUILT_IN_ROLES.map((r) => ({ id: r.id, name: r.name, builtIn: true, grants: [...r.grants], holders: r.id === 'member' ? 5 : 1 }))
  roles.push({ id: 'role-qa', name: 'QA lead', builtIn: false, grants: [], holders: 0 })
  me = { id: 'u-1', name: 'Youssef Abdelrahman', email: 'y@spark-sys.com', title: 'Managing Director', roleIds: ['admin'], presence: 'active', teamIds: [], grants: [...ALL_PERMISSIONS] }
  vi.spyOn(api.users, 'me').mockImplementation(async () => me)
  vi.spyOn(api.roles, 'list').mockImplementation(async () => structuredClone(roles))
  saveGrants = vi.fn(async (changes: RoleChange[]) => {
    for (const c of changes) apply(c)
    return roles
  })
  vi.spyOn(api.roles, 'saveGrants').mockImplementation(saveGrants as unknown as typeof api.roles.saveGrants)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function mount(ready = true) {
  const client: QueryClient = new QueryClient({ mutationCache: new MutationCache({ onSuccess: () => client.invalidateQueries() }) })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/w/engineering/settings/roles']}>
        <Routes>
          <Route path="/w/:ws/settings/roles" element={<RolesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await screen.findByRole('heading', { name: 'Roles and permissions', level: 1 })
  if (ready) await screen.findByRole('table', { name: 'Permissions by role' })
}
const matrix = () => screen.getByRole('table', { name: 'Permissions by role' })
const cell = (permission: string, role: string) => within(matrix()).getByRole('checkbox', { name: `${role}: ${permission}` }) as HTMLInputElement
const save = () => screen.getByRole('button', { name: /Save changes/ }) as HTMLButtonElement

describe('Roles and permissions (slice 1)', () => {
  it('shows every permission by group, and each role with how many hold it, ticked by what it grants', async () => {
    await mount()
    const heads = within(matrix()).getAllByRole('columnheader').map((th) => th.textContent)
    expect(heads).toEqual(['Permission', 'Admin1 person', 'Sales1 person', 'Project manager1 person', 'Member5 people', 'QA leadNobody'])
    expect(within(matrix()).getAllByRole('rowheader').filter((th) => th.getAttribute('colspan')).map((th) => th.textContent)).toEqual(['General', 'Projects and tasks', 'Time and cost', 'Chat', 'Settings and data'])
    expect(cell('Create projects', 'Sales').checked).toBe(true)
    expect(cell('Create projects', 'Member').checked).toBe(false)
    expect(cell('Change settings, users and roles', 'Admin').checked).toBe(true)
    expect(screen.getByText(/whoever manages a project can run it/)).toBeTruthy()
  })

  it('changes wait for Save changes, which sends only the roles that changed; Discard puts them back', async () => {
    await mount()
    expect(save().disabled).toBe(true)
    fireEvent.click(cell('Create projects', 'Member'))
    fireEvent.click(cell('See everyone’s timers and app use', 'Member'))
    fireEvent.click(cell('See everyone’s timers and app use', 'Member'))
    expect(screen.getByText('1 change not saved')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(cell('Create projects', 'Member').checked).toBe(false)
    fireEvent.click(cell('Create projects', 'Member'))
    fireEvent.click(cell('Log time on any project', 'Sales'))
    expect(screen.getByText('2 changes not saved')).toBeTruthy()
    await act(async () => fireEvent.click(save()))
    expect(saveGrants).toHaveBeenCalledWith([
      { roleId: 'sales', add: ['time.logAll'], remove: [] },
      { roleId: 'member', add: ['projects.create'], remove: [] },
    ])
    expect(await screen.findByText('Saved.')).toBeTruthy()
    expect(cell('Create projects', 'Member').checked).toBe(true)
  })

  it('a changed tick says it isn’t saved yet, to screen readers too, and the phone’s role picker marks its role', async () => {
    await mount()
    fireEvent.click(cell('Create projects', 'Member'))
    const box = cell('Create projects', 'Member')
    expect(document.getElementById(box.getAttribute('aria-describedby')!)?.textContent).toBe('Not saved yet')
    expect(cell('Create projects', 'Sales').getAttribute('aria-describedby')).toBeNull()
    const phone = screen.getByRole('group', { name: 'One role’s permissions' })
    expect(within(phone).getByRole('option', { name: /Member/ }).textContent).toBe('Member · 5 people · not saved')
  })

  it('while saving, nothing can be ticked; another Admin’s change to a role I changed elsewhere is kept', async () => {
    let finish = () => {}
    saveGrants.mockImplementationOnce(
      (changes: RoleChange[]) =>
        new Promise((resolve) => {
          finish = () => {
            changes.forEach(apply)
            resolve(roles)
          }
        }),
    )
    await mount()
    // Someone else gives Members "Log time on any project" after my page loaded.
    roles.find((r) => r.id === 'member')!.grants.push('time.logAll')
    fireEvent.click(cell('Create projects', 'Member'))
    await act(async () => fireEvent.click(save()))
    await vi.waitFor(() => expect(cell('Archive or restore projects', 'Member').disabled).toBe(true))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy()
    await act(async () => finish())
    expect(cell('Archive or restore projects', 'Member').disabled).toBe(false)
    expect(saveGrants).toHaveBeenLastCalledWith([{ roleId: 'member', add: ['projects.create'], remove: [] }])
    expect(roles.find((r) => r.id === 'member')!.grants).toEqual(['checkins.managed', 'projects.create', 'time.logAll'])
    expect(await screen.findByText('Saved.')).toBeTruthy()
    expect(cell('Log time on any project', 'Member').checked).toBe(true)
  })

  it('a refusal is said beside Save changes, and the changes stay to fix', async () => {
    saveGrants.mockRejectedValueOnce(new ApiError({ status: 400, title: 'Bad request', detail: 'At least one person must be able to change settings, users and roles.' }))
    await mount()
    fireEvent.click(cell('Change settings, users and roles', 'Admin'))
    await act(async () => fireEvent.click(save()))
    expect((await screen.findByRole('alert')).textContent).toBe('At least one person must be able to change settings, users and roles.')
    expect(cell('Change settings, users and roles', 'Admin').checked).toBe(false)
  })

  it('Add role names it and can copy another role’s permissions', async () => {
    const create = vi.spyOn(api.roles, 'create').mockImplementation(async ({ name }) => ({ id: 'role-new', name, builtIn: false, grants: [], holders: 0 }))
    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Add role' }))
    const sheet = screen.getByRole('dialog', { name: 'Add role' })
    fireEvent.change(within(sheet).getByLabelText(/Name/), { target: { value: 'Sales lead' } })
    fireEvent.change(within(sheet).getByLabelText('Start from'), { target: { value: 'sales' } })
    await act(async () => fireEvent.click(within(sheet).getByRole('button', { name: 'Add role' })))
    expect(create).toHaveBeenCalledWith({ name: 'Sales lead', copyFrom: 'sales' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('every role can be renamed; only a role of our own that nobody holds can be deleted', async () => {
    const rename = vi.spyOn(api.roles, 'rename').mockImplementation(async (id, name) => ({ ...roles.find((r) => r.id === id)!, name }))
    const remove = vi.spyOn(api.roles, 'remove').mockResolvedValue()
    await mount()
    const menu = (role: string) => within(matrix()).getByRole('button', { name: `${role} actions` })
    fireEvent.click(menu('Member'))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent?.trim())).toEqual(['Rename'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const sheet = screen.getByRole('dialog', { name: 'Rename Member' })
    fireEvent.change(within(sheet).getByLabelText(/Name/), { target: { value: 'Engineer' } })
    await act(async () => fireEvent.click(within(sheet).getByRole('button', { name: 'Rename' })))
    expect(rename).toHaveBeenCalledWith('member', 'Engineer')
    fireEvent.click(menu('QA lead'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await act(async () => fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete QA lead?' })).getByRole('button', { name: 'Delete role' })))
    expect(remove).toHaveBeenCalledWith('role-qa')
  })

  it('on a phone: pick one role and its permissions show as a list', async () => {
    await mount()
    const phone = screen.getByRole('group', { name: 'One role’s permissions' })
    expect((within(phone).getByLabelText('Role') as HTMLSelectElement).value).toBe('admin')
    fireEvent.change(within(phone).getByLabelText('Role'), { target: { value: 'sales' } })
    const box = within(phone).getByRole('checkbox', { name: 'Create projects' }) as HTMLInputElement
    expect(box.checked).toBe(true)
    fireEvent.click(box)
    expect(cell('Create projects', 'Sales').checked).toBe(false)
    expect(screen.getByText('1 change not saved')).toBeTruthy()
  })

  it('without the right to change roles, it says so and shows nothing to change', async () => {
    me = { ...me, roleIds: ['member'], grants: ['checkins.managed'] }
    await mount(false)
    expect(await screen.findByText(/You don't have access to roles and permissions/)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('leaving with unsaved role changes (UX Phase 1, 1.2)', () => {
  it('asks "Leave without saving?" before another page; Stay keeps the changes', async () => {
    const client: QueryClient = new QueryClient()
    const router = createMemoryRouter(
      [
        {
          path: '/w/:ws/settings/roles',
          element: (
            <>
              <UnsavedChangesBlocker />
              <RolesPage />
            </>
          ),
        },
        { path: '/w/:ws/settings', element: <p>Settings home</p> },
      ],
      { initialEntries: ['/w/engineering/settings/roles'] },
    )
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    await screen.findByRole('table', { name: 'Permissions by role' })
    const box = within(matrix()).getAllByRole('checkbox')[0]!
    fireEvent.click(box)
    await act(() => router.navigate('/w/engineering/settings'))
    expect(await screen.findByRole('dialog', { name: 'Leave without saving?' })).toBeTruthy()
    expect(screen.getByText('1 change to roles isn’t saved.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }))
    expect(router.state.location.pathname).toBe('/w/engineering/settings/roles')
    expect(screen.getByText('1 change not saved')).toBeTruthy()
  })
})
