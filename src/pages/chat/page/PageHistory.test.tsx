// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PageVersionSummary, PageView, TaskRef, User } from '@/api/types'
import { announce, Announcer } from '@/components/sf/Announcer'
import { api, ApiError } from '@/lib/api'
import type { PageBody } from '@/lib/pageBody'
import type { BodyScope } from '@/pages/chat/useBodyContext'
import { PageHistory } from './PageHistory'

window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const users = [
  { id: 'u-1', name: 'Youssef Abdelrahman' },
  { id: 'u-2', name: 'Nour El-Sayed' },
] as User[]
const scope: BodyScope = { users, projectKeys: new Set(['NEX']), ws: 'engineering', workspaceId: 'ws-eng' }
const text = (t: string): PageBody => [{ type: 'p', children: [{ type: 'text', text: t }] }]
const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3_600_000).toISOString()
const versions: PageVersionSummary[] = [
  { id: 'v3', version: 3, savedAt: new Date().toISOString(), savedBy: 'u-2' },
  { id: 'v1', version: 1, savedAt: twoDaysAgo, savedBy: 'u-1' },
]
const restored: PageView = { channelId: 'c-general', body: text('Oldest'), version: 4, updatedAt: null, updatedBy: 'u-1', editors: ['u-1', 'u-2'], editing: null }

let onClose: () => void
beforeEach(() => {
  announce('')
  onClose = vi.fn()
  vi.spyOn(api.pages, 'history').mockResolvedValue(structuredClone(versions))
  vi.spyOn(api.pages, 'version').mockImplementation(async (_channelId, id) => ({ ...versions.find((v) => v.id === id)!, body: text(id === 'v3' ? 'Newest' : 'Oldest') }))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function mount(mayEdit = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Announcer />
        <PageHistory channelId="c-general" scope={scope} people={users} mayEdit={mayEdit} currentVersion={3} onClose={onClose} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return screen.getByRole('dialog', { name: 'Page history' })
}

const rows = async (dialog: HTMLElement) => within(await within(dialog).findByRole('list', { name: 'Versions' })).getAllByRole('button')

describe('PageHistory (chat spec 6.14 §6.5)', () => {
  it('lists versions newest first and marks the current one', async () => {
    const dialog = mount()
    const [newest, oldest] = await rows(dialog)
    expect(newest!.textContent).toMatch(/^Today .+ · Nour El-Sayed.*Current$/)
    expect(oldest!.textContent).toMatch(/· Youssef Abdelrahman$/)
    expect(newest!.getAttribute('aria-current')).toBe('true')
    expect(await within(dialog).findByText('Newest')).toBeTruthy()
  })

  it('shows a version read-only; readers see no Restore', async () => {
    const dialog = mount(false)
    fireEvent.click((await rows(dialog))[1]!)
    expect(await within(dialog).findByText('Oldest')).toBeTruthy()
    expect(within(dialog).queryByRole('textbox')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Restore this version' })).toBeNull()
  })

  it('a task named only in an older version shows as its chip (polish pass)', async () => {
    vi.mocked(api.pages.version).mockImplementation(async (_channelId, id) => ({
      ...versions.find((v) => v.id === id)!,
      body: id === 'v1' ? [{ type: 'p', children: [{ type: 'text', text: 'See ' }, { type: 'task', key: 'NEX-12' }] }] : text('Newest'),
    }))
    const task = { key: 'NEX-12', title: 'Ship it', statusLabel: 'To do', category: 'todo', projectKey: 'NEX', projectName: 'Nexus Core', assigneeId: null } as TaskRef
    const resolve = vi.spyOn(api.tickets, 'resolve').mockResolvedValue([task])
    const dialog = mount()
    const [, oldest] = await rows(dialog)
    fireEvent.click(oldest!)
    expect(await within(dialog).findByRole('link', { name: /NEX-12/ })).toBeTruthy()
    expect(resolve).toHaveBeenCalledWith(['NEX-12'])
  })

  it('offers Restore only on an older version', async () => {
    const dialog = mount()
    await within(dialog).findByText('Newest')
    expect(within(dialog).queryByRole('button', { name: 'Restore this version' })).toBeNull()
    fireEvent.click((await rows(dialog))[1]!)
    expect(await within(dialog).findByRole('button', { name: 'Restore this version' })).toBeTruthy()
  })

  it('restore saves it as a new version and closes', async () => {
    const restore = vi.spyOn(api.pages, 'restore').mockResolvedValue(restored)
    const dialog = mount()
    fireEvent.click((await rows(dialog))[1]!)
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Restore this version' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(restore).toHaveBeenCalledWith('c-general', { versionId: 'v1', baseVersion: 3 })
    expect(screen.getByRole('status').textContent).toBe('Version restored.')
  })

  it('a 409 while restoring stays in the dialog with its sentence', async () => {
    vi.spyOn(api.pages, 'restore').mockRejectedValue(new ApiError({ title: 'Conflict', status: 409, detail: 'Nour El-Sayed is editing. Try again when they’re done.' }))
    const dialog = mount()
    fireEvent.click((await rows(dialog))[1]!)
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Restore this version' }))
    expect(await within(dialog).findByText('Nour El-Sayed is editing. Try again when they’re done.')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    // An error is read out, once (chat spec 6.14 §6.3).
    expect(screen.getByRole('status').textContent).toBe('Nour El-Sayed is editing. Try again when they’re done.')
    expect(within(dialog).getByRole('button', { name: 'Restore this version' })).toBeTruthy()
  })
})
