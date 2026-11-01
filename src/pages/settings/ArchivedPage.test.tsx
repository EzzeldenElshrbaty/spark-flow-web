// @vitest-environment jsdom
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArchivedRecord, Me } from '@/api/types'
import { api, ApiError } from '@/lib/api'
import { ALL_PERMISSIONS } from '@/lib/permissions'
import { ArchivedPage } from './ArchivedPage'

window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const none = { tasks: 0, files: 0, comments: 0, phases: 0, deliverables: 0 }
const items: ArchivedRecord[] = [
  { type: 'project', id: 'p-sel', name: 'Sela booking', ref: 'SEL', projectId: 'p-sel', archivedAt: '2025-09-01T10:00:00.000Z', archivedBy: 'u-1', reason: 'Client paused', deletableFrom: '2026-09-01T10:00:00.000Z', keptBecause: null, includes: { tasks: 12, files: 3, comments: 0, phases: 5, deliverables: 1 }, restoreBlocked: null },
  { type: 'task', id: 'NEX-101', name: 'Refresh tokens', ref: 'NEX-101', projectId: 'p-nex', archivedAt: '2026-10-20T10:00:00.000Z', archivedBy: 'u-2', reason: null, deletableFrom: null, keptBecause: 'time', includes: none, restoreBlocked: null },
  { type: 'channel', id: 'c-release', name: '#release-v2', ref: 'release-v2', projectId: null, archivedAt: '2026-10-10T10:00:00.000Z', archivedBy: null, reason: 'Shipped', deletableFrom: null, keptBecause: 'channel', includes: none, restoreBlocked: null },
]

let me: Me
beforeEach(() => {
  me = { id: 'u-1', name: 'Youssef Abdelrahman', email: 'y@spark-sys.com', title: 'Managing Director', roleIds: ['admin'], presence: 'active', teamIds: [], grants: [...ALL_PERMISSIONS] }
  vi.spyOn(api.users, 'me').mockImplementation(async () => me)
  vi.spyOn(api.workspaces, 'list').mockResolvedValue([{ id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' }])
  vi.spyOn(api.users, 'list').mockResolvedValue([
    { id: 'u-1', name: 'Youssef Abdelrahman', email: '', title: '', roleIds: ['admin'], teamIds: [], presence: 'active' },
    { id: 'u-2', name: 'Nour El-Sayed', email: '', title: '', roleIds: ['pm'], teamIds: [], presence: 'active' },
  ])
  vi.spyOn(api.archive, 'list').mockResolvedValue({ items: structuredClone(items), retentionDays: 365 })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function mount(search = '') {
  const client: QueryClient = new QueryClient({ mutationCache: new MutationCache({ onSuccess: () => client.invalidateQueries() }) })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/w/engineering/settings/archived${search}`]}>
        <Routes>
          <Route path="/w/:ws/settings/archived" element={<ArchivedPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await screen.findByRole('heading', { name: 'Archived records', level: 1 })
}
const table = () => screen.findByRole('table', { name: 'Archived records' })
const rows = async () => within(await table()).getAllByRole('row').slice(1)

describe('Settings → Archived records (Admin and help, slice 4)', () => {
  it('lists each record with its type, when and by whom, why, and whether it can be deleted', async () => {
    await mount()
    const [project, task, channel] = await rows()
    expect(within(project!).getAllByRole('cell').map((c) => c.textContent).slice(0, 5)).toEqual(['Sela bookingSEL', 'Project', '1 Sept 2025Youssef Abdelrahman', 'Client paused', 'Now'])
    expect(within(task!).getAllByRole('cell')[4]!.textContent).toBe('Always kept · time logged')
    expect(within(channel!).getAllByRole('cell').map((c) => c.textContent).slice(2, 5)).toEqual(['10 Oct 2026—', 'Shipped', 'Restore only'])
    expect(within(task!).getByRole('link', { name: /Refresh tokens/ }).getAttribute('href')).toBe('/w/engineering/p/NEX/tasks?ticket=NEX-101')
    // Delete is offered only where it can happen now.
    expect(within(project!).getByRole('button', { name: 'Delete Sela booking for good' })).toBeTruthy()
    expect(within(task!).queryByRole('button', { name: /for good/ })).toBeNull()
    expect(screen.getByText('365 days')).toBeTruthy()
  })

  it('the kinds count and narrow; search finds a reason', async () => {
    await mount()
    await table()
    const kinds = screen.getByRole('group', { name: 'Kind of record' })
    expect(within(kinds).getAllByRole('button').map((b) => b.textContent)).toEqual(['All3', 'Projects1', 'Tasks1', 'Channels1'])
    fireEvent.click(within(kinds).getByRole('button', { name: /Channels/ }))
    expect((await rows()).map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual(['#release-v2'])
    fireEvent.click(within(kinds).getByRole('button', { name: /All/ }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search archived records' }), { target: { value: 'paused' } })
    await waitFor(async () => expect((await rows()).map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual(['Sela bookingSEL']))
  })

  it('Restore uses the type’s own call; a refusal is said beside it', async () => {
    const restore = vi.spyOn(api.chat, 'restoreChannel').mockRejectedValue(new ApiError({ title: 'Forbidden', status: 403, detail: 'Only admins can archive channels.' }))
    await mount()
    fireEvent.click((await screen.findAllByRole('button', { name: 'Restore #release-v2' }))[0]!)
    expect(await screen.findByText('Only admins can archive channels.')).toBeTruthy()
    expect(restore).toHaveBeenCalledWith('c-release')
  })

  it('a record the viewer can’t restore says why instead of offering Restore', async () => {
    vi.mocked(api.archive.list).mockResolvedValue({ items: items.map((r) => (r.type === 'task' ? { ...r, restoreBlocked: 'Restore its project first.' } : r)), retentionDays: 365 })
    await mount()
    const [project, task] = await rows()
    expect(within(task!).queryByRole('button', { name: /Restore/ })).toBeNull()
    expect(within(task!).getByText('Restore its project first.')).toBeTruthy()
    expect(within(project!).getByRole('button', { name: 'Restore Sela booking' })).toBeTruthy()
  })

  it('Delete for good names what goes with it and asks first', async () => {
    const remove = vi.spyOn(api.archive, 'deleteForGood').mockResolvedValue()
    await mount()
    fireEvent.click((await screen.findAllByRole('button', { name: 'Delete Sela booking for good' }))[0]!)
    const sheet = await screen.findByRole('dialog', { name: 'Delete Sela booking for good?' })
    expect(within(sheet).getByText(/It goes with its 12 tasks, 3 files, 5 phases and 1 deliverable\. This can't be undone\./)).toBeTruthy()
    expect(within(sheet).getByText(/Its channel stays, archived/)).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Delete for good' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(remove).toHaveBeenCalledWith('project', 'p-sel')
  })

  it('Change sets how many days they’re kept; a refusal shows under the field', async () => {
    const set = vi.spyOn(api.archive, 'setRetention').mockRejectedValueOnce(new ApiError({ title: 'Bad request', status: 400, detail: 'Keep them between 30 and 3650 days.' })).mockResolvedValue(90)
    await mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))
    const sheet = await screen.findByRole('dialog', { name: 'Keep archived records' })
    const days = within(sheet).getByRole('textbox', { name: /Days/ })
    fireEvent.change(days, { target: { value: '10' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    expect(await within(sheet).findByText('Keep them between 30 and 3650 days.')).toBeTruthy()
    fireEvent.change(days, { target: { value: '90' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(set).toHaveBeenLastCalledWith(90)
  })

  it('without "Manage archived records" it says so and asks for nothing', async () => {
    me = { ...me, roleIds: ['member'], grants: ['checkins.managed'] }
    await mount()
    expect(await screen.findByText(/You don't have access to archived records\./)).toBeTruthy()
    expect(api.archive.list).not.toHaveBeenCalled()
  })
})
