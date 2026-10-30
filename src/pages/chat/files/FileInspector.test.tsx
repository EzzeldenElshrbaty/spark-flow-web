// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Attachment, Channel, FileDetails } from '@/api/types'
import { ApiError } from '@/lib/apiError'
import { FileInspector } from '@/pages/chat/files/FileInspector'

afterEach(cleanup)
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const file: Attachment = {
  id: 'a1', name: 'scope.pdf', title: 'Release scope', description: 'What ships in 2.4.', mimeType: 'application/pdf', size: 188_416, createdAt: '2026-10-28T09:00:00.000Z',
  uploadedBy: 'u-2', scanStatus: 'clean', thumbUrl: null, previewUrl: null, deletedAt: null, snippet: null, folderId: null,
}
const details: FileDetails = {
  file,
  sharedIn: [
    { channelId: 'c-backend', messageId: 'm1', replyId: null, at: '2026-10-28T09:00:00.000Z' },
    { channelId: 'c-release', messageId: 'm2', replyId: 'r1', at: '2026-10-28T10:00:00.000Z' },
  ],
  taskKeys: ['NEX-105'],
  projectIds: ['p-nex'],
}
let state: { data?: FileDetails; error: Error | null } = { data: details, error: null }
let me = { id: 'u-2', role: 'pm' }
const channels = [
  { id: 'c-backend', kind: 'channel', name: 'backend', isPrivate: false, memberIds: ['u-2'] },
  { id: 'c-release', kind: 'channel', name: 'release-v2', isPrivate: true, memberIds: ['u-2'] },
  { id: 'c-p-nex', kind: 'channel', name: 'nexus-core', isPrivate: false, memberIds: ['u-2'] },
] as Channel[]
// The file actions read my Saved (spec 6.9 Save for later).
vi.mock('@/api/saved', () => ({ useSaved: () => ({ data: [] }), useSave: () => ({ mutate: () => {} }), useRemoveSaved: () => ({ mutate: () => {} }) }))
vi.mock('@/api/files', () => ({
  useFileDetails: () => ({ data: state.data, error: state.error, isError: state.error !== null, isPending: !state.data && !state.error, refetch: vi.fn() }),
  useUpdateFile: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteFile: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useShareFile: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/api/chat', () => ({ useChannels: () => ({ data: channels }) }))
vi.mock('@/api/folders', () => ({ useFolders: () => ({ data: [{ id: 'fold-1', workspaceId: 'ws-eng', name: 'Releases', createdBy: 'u-1', createdAt: '' }] }), useCreateFolder: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/api/users', () => ({ useUsers: () => ({ data: [{ id: 'u-2', name: 'Nour El-Sayed' }, { id: 'u-3', name: 'Mariam Fathy' }] }) }))
vi.mock('@/api/projects', () => ({ useProjectSummaries: () => ({ data: [{ id: 'p-nex', name: 'Nexus Core', key: 'NEX', channelId: 'c-p-nex' }] }) }))
vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering' } }) }))
vi.mock('@/lib/useRole', () => ({ useRole: () => ({ persona: me }) }))
vi.mock('@/components/AttachmentView', () => ({ useFileUrl: () => ({ url: 'blob:http://localhost/a1', failed: false }) }))

const show = () =>
  render(
    <MemoryRouter initialEntries={['/w/engineering/c/c-backend?file=a1']}>
      <FileInspector fileId="a1" onClose={vi.fn()} closeTo="/w/engineering/c/c-backend" />
    </MemoryRouter>,
  )
const value = (term: string) => screen.getByText(term, { selector: 'dt' }).nextElementSibling as HTMLElement

describe('File details panel (spec 6.9)', () => {
  it('names the file, its type and size, who uploaded it and when, where it is shared, who can see it, and its description', () => {
    show()
    expect(screen.getByRole('heading', { name: 'Release scope' })).toBeTruthy()
    expect(screen.getByText('PDF · 184 KB')).toBeTruthy()
    expect(value('Uploaded by').textContent).toBe('Nour El-Sayed')
    expect(value('Uploaded').textContent).toBe('28 Oct 2026')
    const shared = within(value('Shared in'))
    expect(shared.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['#backend', '/w/engineering/c/c-backend?message=m1'],
      ['#release-v2, in a thread', '/w/engineering/c/c-release?thread=m2'],
      ['NEX-105', '/w/engineering/c/c-backend?ticket=NEX-105'],
      ['Nexus Core', '/w/engineering/p/NEX/overview'],
    ])
    expect([...value('Access').querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Everyone in the workspace, through #backend', 'Members of #release-v2', 'People on Nexus Core'])
    expect(value('Description').textContent).toBe('What ships in 2.4.')
  })

  it('offers Download and Open; Share and Edit file details only to whoever uploaded it or an Admin', () => {
    show()
    expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit file details' }))
    expect(screen.getByRole('dialog', { name: 'Edit file details' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy()
    cleanup()
    me = { id: 'u-3', role: 'member' }
    show()
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit file details' })).toBeNull()
    me = { id: 'u-2', role: 'pm' }
  })

  it('a file that’s gone, or that I can’t see, says so with a way back', () => {
    state = { data: undefined, error: new ApiError({ title: 'Not Found', status: 404, detail: "File a1 doesn't exist." }) }
    show()
    expect(screen.getByText("This file doesn't exist or was removed.")).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Close the details' })).toBeTruthy()
    state = { data: details, error: null }
  })
})

describe('File details Access after the slice 6 review', () => {
  it('a project’s channel is open to the workspace, so a file there is too; a task’s file in it says the same', () => {
    state = { data: { ...details, sharedIn: [{ channelId: 'c-p-nex', messageId: 'm3', replyId: null, at: '2026-10-28T11:00:00.000Z' }], taskKeys: ['NEX-105'], projectIds: [] }, error: null }
    show()
    expect([...value('Access').querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Everyone in the workspace, through #nexus-core'])
    state = { data: details, error: null }
  })
})

describe('File details panel focus (slice 6 review)', () => {
  it('opening it puts focus on its heading, so the keyboard carries on there', () => {
    show()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Release scope' }))
  })
})

describe('File details: Folder (spec 6.9)', () => {
  it('says which folder the file is in, or — when it is in none', () => {
    state.data = { ...state.data!, file: { ...state.data!.file, folderId: 'fold-1' } }
    show()
    expect(value('Folder').textContent).toBe('Releases')
    cleanup()
    state.data = { ...state.data!, file: { ...state.data!.file, folderId: null } }
    show()
    expect(value('Folder').textContent).toBe('—')
  })
})
