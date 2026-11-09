// @vitest-environment jsdom
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes, useLocation } from 'react-router'
import { UnsavedChangesBlocker } from '@/layout/UnsavedChangesBlocker'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Me, PersonRow } from '@/api/types'
import { api, ApiError } from '@/lib/api'
import { ALL_PERMISSIONS, BUILT_IN_ROLES } from '@/lib/permissions'
import { UsersPage } from './UsersPage'

window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
const person = (id: string, name: string, over: Partial<PersonRow> = {}): PersonRow => ({
  id, name, email: `${name.split(' ')[0]!.toLowerCase()}@spark-sys.com`, title: 'Engineer', roleIds: ['member'], teamIds: [], presence: 'active', lastActiveAt: hourAgo, ...over,
})

let people: PersonRow[]
let me: Me
beforeEach(() => {
  people = [
    person('u-1', 'Youssef Abdelrahman', { title: 'Managing Director', roleIds: ['admin'] }),
    person('u-3', 'Mariam Fathy', { title: 'Frontend Engineer', teamIds: ['t-frontend', 't-elsewhere'] }),
    person('u-2', 'Nour El-Sayed', { roleIds: ['pm'], teamIds: ['t-backend'], lastActiveAt: null }),
    person('u-6', 'Hossam Gaber', { deactivated: { at: '2026-10-30T09:00:00.000Z', by: 'u-1', reason: 'Left the company' } }),
  ]
  me = { id: 'u-1', name: 'Youssef Abdelrahman', email: 'y@spark-sys.com', title: 'Managing Director', roleIds: ['admin'], presence: 'active', teamIds: [], grants: [...ALL_PERMISSIONS] }
  vi.spyOn(api.users, 'me').mockImplementation(async () => me)
  vi.spyOn(api.users, 'directory').mockImplementation(async () => structuredClone(people))
  vi.spyOn(api.roles, 'list').mockResolvedValue(BUILT_IN_ROLES.map((r) => ({ id: r.id, name: r.name, builtIn: true, grants: [...r.grants], holders: 1 })))
  vi.spyOn(api.workspaces, 'list').mockResolvedValue([{ id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' }])
  vi.spyOn(api.teams, 'list').mockResolvedValue([
    { id: 't-frontend', workspaceId: 'ws-eng', name: 'Frontend', memberIds: ['u-3'] },
    { id: 't-backend', workspaceId: 'ws-eng', name: 'Backend', memberIds: ['u-2'] },
  ])
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

let location = ''
function Where() {
  location = useLocation().search
  return null
}

async function mount(search = '') {
  const client: QueryClient = new QueryClient({ mutationCache: new MutationCache({ onSuccess: () => client.invalidateQueries() }) })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/w/engineering/settings/users${search}`]}>
        <Routes>
          <Route
            path="/w/:ws/settings/users"
            element={
              <>
                <UsersPage />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await screen.findByRole('heading', { name: 'Users', level: 1 })
}
const table = () => screen.findByRole('table', { name: 'People' })
const names = async () => within(await table()).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0]!.textContent)

describe('Settings → Users (Admin and help, slice 3)', () => {
  it('lists everyone, active people first by name, with their roles, teams, last activity and status', async () => {
    await mount()
    expect(await names()).toEqual(['MFMariam FathyFrontend Engineer', 'NENour El-SayedEngineer', 'YAYoussef AbdelrahmanManaging Director', 'HGHossam GaberEngineer'])
    const rows = within(await table()).getAllByRole('row').slice(1)
    expect(within(rows[0]!).getAllByRole('cell').map((c) => c.textContent).slice(1, 6)).toEqual(['mariam@spark-sys.com', 'Member', 'Frontend', '1h ago', 'Active'])
    expect(within(rows[1]!).getAllByRole('cell')[4]!.textContent).toBe('Never')
    expect(within(rows[3]!).getAllByRole('cell')[5]!.textContent).toBe('Deactivated')
    expect(screen.getByText('3 active · 1 deactivated')).toBeTruthy()
  })

  it('search waits for a pause; role, team and status narrow the list, all in the address', async () => {
    await mount()
    await table()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search people' }), { target: { value: 'nour@' } })
    expect(await names()).toHaveLength(4)
    await waitFor(async () => expect(await names()).toEqual(['NENour El-SayedEngineer']))
    expect(location).toBe('?q=nour%40')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search people' }), { target: { value: '' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'deactivated' } })
    await waitFor(async () => expect(await names()).toEqual(['HGHossam GaberEngineer']))
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: '' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Team' }), { target: { value: 't-frontend' } })
    expect(await names()).toEqual(['MFMariam FathyFrontend Engineer'])
    fireEvent.change(screen.getByRole('combobox', { name: 'Role' }), { target: { value: 'admin' } })
    expect(await screen.findByText('Nobody matches.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Clear search and filters/ }))
    expect(await names()).toHaveLength(4)
  })

  it('Add person checks what’s missing, shows a refusal under its field, and sends the person once it’s right', async () => {
    const create = vi
      .spyOn(api.users, 'create')
      .mockRejectedValueOnce(new ApiError({ title: 'Bad request', status: 400, detail: 'Mariam Fathy has that email already.' }))
      .mockImplementation(async (input) => ({ ...input, id: 'u-new', presence: 'offline' }))
    await mount()
    await table()
    fireEvent.click(screen.getByRole('button', { name: 'Add person' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add person' })
    expect(location).toBe('?person=new')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add person' }))
    expect(within(sheet).getByText('Give their name.')).toBeTruthy()
    expect(within(sheet).getByText('Give them at least one role.')).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
    fireEvent.change(within(sheet).getByRole('textbox', { name: /Name/ }), { target: { value: 'Laila Hamdy' } })
    // UX Phase 4, 4.4: each error leaves as soon as its field is fixed, before the next Save.
    expect(within(sheet).queryByText('Give their name.')).toBeNull()
    fireEvent.change(within(sheet).getByRole('textbox', { name: /Email/ }), { target: { value: 'mariam@spark-sys.com' } })
    fireEvent.click(within(sheet).getByRole('checkbox', { name: 'Member' }))
    expect(within(sheet).queryByText('Give them at least one role.')).toBeNull()
    fireEvent.click(within(sheet).getByRole('checkbox', { name: 'Backend' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add person' }))
    expect(await within(sheet).findByText('Mariam Fathy has that email already.')).toBeTruthy()
    expect(within(sheet).getByRole('textbox', { name: /Email/ }).getAttribute('aria-invalid')).toBe('true')
    fireEvent.change(within(sheet).getByRole('textbox', { name: /Email/ }), { target: { value: 'laila@spark-sys.com' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add person' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(create).toHaveBeenLastCalledWith({ name: 'Laila Hamdy', email: 'laila@spark-sys.com', title: '', roleIds: ['member'], teamIds: ['t-backend'] })
    expect(location).toBe('')
  })

  it('a row opens Edit with what’s saved; a team in another workspace stays when this one’s change', async () => {
    const update = vi.spyOn(api.users, 'update').mockImplementation(async (id, patch) => ({ ...people.find((p) => p.id === id)!, ...patch }))
    await mount()
    fireEvent.click(within(await table()).getAllByRole('row')[1]!)
    const sheet = await screen.findByRole('dialog', { name: 'Edit Mariam Fathy' })
    expect((within(sheet).getByRole('textbox', { name: /Title/ }) as HTMLInputElement).value).toBe('Frontend Engineer')
    expect((within(sheet).getByRole('checkbox', { name: 'Frontend' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(within(sheet).getByRole('checkbox', { name: 'Frontend' }))
    fireEvent.click(within(sheet).getByRole('checkbox', { name: 'Backend' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0]).toEqual(['u-3', { name: 'Mariam Fathy', email: 'mariam@spark-sys.com', title: 'Frontend Engineer', roleIds: ['member'], teamIds: ['t-elsewhere', 't-backend'] }])
  })

  it('Edit opened by a link waits for the teams, so a team still loading isn’t saved as one they’re off', async () => {
    let release = () => {}
    vi.mocked(api.teams.list).mockImplementation(
      () => new Promise((resolve) => (release = () => resolve([{ id: 't-frontend', workspaceId: 'ws-eng', name: 'Frontend', memberIds: ['u-3'] }]))),
    )
    const update = vi.spyOn(api.users, 'update').mockImplementation(async (id, patch) => ({ ...people.find((p) => p.id === id)!, ...patch }))
    await mount('?person=u-3')
    await table()
    expect(screen.queryByRole('dialog')).toBeNull()
    release()
    const sheet = await screen.findByRole('dialog', { name: 'Edit Mariam Fathy' })
    fireEvent.change(within(sheet).getByRole('textbox', { name: /Title/ }), { target: { value: 'Lead' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0]![1].teamIds).toEqual(['t-elsewhere', 't-frontend'])
  })

  it('a deactivated person’s Edit says when, by whom and why', async () => {
    await mount('?person=u-6')
    const sheet = await screen.findByRole('dialog', { name: 'Edit Hossam Gaber' })
    expect(within(sheet).getByText('Deactivated 30 Oct 2026 by Youssef Abdelrahman · Left the company')).toBeTruthy()
  })

  it('Edit holds Deactivate (not for me) with an optional reason, and Reactivate for someone deactivated', async () => {
    const deactivate = vi.spyOn(api.users, 'deactivate').mockImplementation(async (id) => people.find((p) => p.id === id)!)
    const reactivate = vi.spyOn(api.users, 'reactivate').mockImplementation(async (id) => people.find((p) => p.id === id)!)
    await mount('?person=u-1')
    const mine = await screen.findByRole('dialog', { name: 'Edit Youssef Abdelrahman' })
    expect(within(mine).queryByRole('button', { name: /Deactivate/ })).toBeNull()
    expect(within(mine).getByRole('link', { name: /Hourly cost/ }).getAttribute('href')).toBe('/w/engineering/settings/rates')
    fireEvent.click(within(mine).getByRole('button', { name: 'Cancel' }))
    fireEvent.click((await screen.findAllByRole('button', { name: /^Mariam Fathy/ }))[0]!)
    const edit = await screen.findByRole('dialog', { name: 'Edit Mariam Fathy' })
    fireEvent.click(within(edit).getByRole('button', { name: /Deactivate/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Deactivate Mariam Fathy?' })
    expect(location).toBe('')
    expect(within(sheet).getByText(/A timer they have running stops/)).toBeTruthy()
    fireEvent.change(within(sheet).getByRole('textbox', { name: /Reason/ }), { target: { value: 'Moved to the CRM team' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(deactivate).toHaveBeenCalledWith('u-3', 'Moved to the CRM team')
    fireEvent.click(screen.getAllByRole('button', { name: /^Hossam Gaber/ })[0]!)
    const off = await screen.findByRole('dialog', { name: 'Edit Hossam Gaber' })
    fireEvent.click(within(off).getByRole('button', { name: /Reactivate/ }))
    await waitFor(() => expect(reactivate).toHaveBeenCalledWith('u-6'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('without "Change settings, users and roles" it says so and asks for nothing', async () => {
    me = { ...me, roleIds: ['member'], grants: ['checkins.managed'] }
    await mount('?person=u-3')
    expect(await screen.findByText(/You don’t have access to users\./)).toBeTruthy()
    expect(api.users.directory).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Add person asks before Back throws it away (UX Phase 1, 1.2)', () => {
  async function mountRouted() {
    const client: QueryClient = new QueryClient({ mutationCache: new MutationCache({ onSuccess: () => client.invalidateQueries() }) })
    const router = createMemoryRouter(
      [
        {
          path: '/w/:ws/settings/users',
          element: (
            <>
              <UnsavedChangesBlocker />
              <UsersPage />
            </>
          ),
        },
      ],
      { initialEntries: ['/w/engineering/settings/users', '/w/engineering/settings/users?person=new'], initialIndex: 1 },
    )
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    await screen.findByRole('dialog', { name: 'Add person' })
    return router
  }

  it('Back with a typed name asks "Discard this new person?" and keeps the sheet', async () => {
    const router = await mountRouted()
    fireEvent.change(screen.getByRole('textbox', { name: /^Name/ }), { target: { value: 'Laila Adel' } })
    await act(() => router.navigate(-1))
    expect(await screen.findByText('Discard this new person?')).toBeTruthy()
    expect(router.state.location.search).toBe('?person=new')
  })

  it('a saved person closes the sheet with no question', async () => {
    vi.spyOn(api.users, 'create').mockImplementation(async (input) => ({ ...people[0]!, ...input, id: 'u-new' }))
    const router = await mountRouted()
    fireEvent.change(screen.getByRole('textbox', { name: /^Name/ }), { target: { value: 'Laila Adel' } })
    fireEvent.change(screen.getByRole('textbox', { name: /^Email/ }), { target: { value: 'laila@spark-sys.com' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Member/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Add person' })).getByRole('button', { name: 'Add person' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add person' })).toBeNull())
    expect(screen.queryByText('Discard this new person?')).toBeNull()
    expect(router.state.location.search).toBe('')
  })
})
