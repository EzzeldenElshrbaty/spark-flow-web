// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Attachment, ProjectFileRow, ProjectSummary, User } from '@/api/types'
import { FilesTab } from './FilesTab'

type Query = { data?: { pages: { items: ProjectFileRow[]; nextCursor: string | null }[] }; isError: boolean; hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => void; refetch: () => void }
let query: Query
const asked: unknown[] = []
const openFile = vi.fn<(id: string) => Promise<string>>()
const noteDownload = vi.fn()

vi.mock('@/api/projects', () => ({ useAllProjectFiles: (_id: string, filter: unknown) => (asked.push(filter), query), openFile: (id: string) => openFile(id) }))
vi.mock('@/api/audit', () => ({ noteDownload: (id: string) => noteDownload(id) }))
vi.mock('@/components/ui/FileViewer', () => ({
  FileViewer: ({ files, onDownload }: { files: { name: string }[]; onDownload: () => void }) => (
    <div role="dialog" aria-label={files[0]!.name}>
      <button type="button" onClick={onDownload}>
        Download
      </button>
    </div>
  ),
}))

window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const file = (id: string, name: string, over: Partial<Attachment> = {}) =>
  ({ id, name, title: name, mimeType: 'application/pdf', size: 1_258_291, uploadedBy: 'u-2', createdAt: '2026-11-03T10:00:00.000Z', scanStatus: 'clean', ...over }) as Attachment
const rows: ProjectFileRow[] = [
  { file: file('a1', 'flow.pdf'), source: { kind: 'task', taskKey: 'NEX-108' } },
  { file: file('a2', 'log.txt', { mimeType: 'text/plain' }), source: { kind: 'chat', messageId: 'm-9', replyId: null } },
  { file: file('a3', 'scope.pdf'), source: { kind: 'overview' } },
  { file: file('a4', 'wait.pdf', { scanStatus: 'pending' }), source: { kind: 'comment', taskKey: 'NEX-105', commentId: 'c1', bug: true } },
]
const page = (items: ProjectFileRow[], nextCursor: string | null = null): Query => ({
  data: { pages: [{ items, nextCursor }] }, isError: false, hasNextPage: nextCursor !== null, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(),
})
const project = { id: 'p-nex', key: 'NEX', name: 'Nexus Core' } as ProjectSummary
const users = [{ id: 'u-2', name: 'Nour El-Sayed' }] as User[]

let location = ''
function Where() {
  const l = useLocation()
  location = `${l.pathname}${l.search}`
  return null
}
const show = (at = '/w/eng/p/NEX/files') =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <FilesTab ws="eng" project={project} users={users} />
      <Where />
    </MemoryRouter>,
  )

beforeEach(() => {
  query = page(rows)
  asked.length = 0
  openFile.mockReset()
  noteDownload.mockReset()
})
afterEach(cleanup)

const table = () => screen.getByRole('table', { name: 'Project files' })

describe('FilesTab (spec 5.3)', () => {
  it('a filter change keeps the old rows, dimmed, until the new ones come (UX Phase 4, 4.5)', () => {
    query = { ...query, isPlaceholderData: true } as Query
    show()
    const table = screen.getByRole('table', { name: 'Project files' })
    expect(table.closest('.opacity-60')).toBeTruthy()
  })

  it('a refresh that fails keeps the rows and says they may be out of date, with Try again (UX Phase 6, deferred minor #23)', () => {
    query = { ...query, isError: true }
    show()
    expect(screen.getByRole('table', { name: 'Project files' })).toBeTruthy()
    expect(screen.getByText('These files may be out of date.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(query.refetch).toHaveBeenCalled()
  })

  it('lists every file with its type, size, uploader, date and where it came from', () => {
    show()
    const headers = within(table()).getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(expect.arrayContaining(['Name', 'Type', 'Size', 'Uploaded by', 'Uploaded', 'From']))
    const first = within(table()).getAllByRole('row')[1]!
    expect(first.textContent).toContain('flow.pdf')
    expect(first.textContent).toContain('PDF')
    expect(first.textContent).toContain('1.2 MB')
    expect(first.textContent).toContain('Nour El-Sayed')
    expect(first.textContent).toContain('3 Nov 2026')
    expect(within(table()).getByText('Being checked')).toBeTruthy()
  })

  it('the chips and the type write the address; All and Any type clear it', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Chat' }))
    expect(location).toBe('/w/eng/p/NEX/files?from=chat')
    fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), { target: { value: 'pdf' } })
    expect(location).toBe('/w/eng/p/NEX/files?from=chat&type=pdf')
    expect(asked.at(-1)).toEqual({ from: 'chat', type: 'pdf' })
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), { target: { value: '' } })
    expect(location).toBe('/w/eng/p/NEX/files')
  })

  it('From goes to the task panel, the message in Chat, or Overview', () => {
    show()
    expect(within(table()).getByRole('link', { name: 'NEX-108 · Attachment' }).getAttribute('href')).toBe('/w/eng/p/NEX/files?ticket=NEX-108')
    expect(within(table()).getByRole('link', { name: 'Chat' }).getAttribute('href')).toBe('/w/eng/p/NEX/chat?message=m-9')
    expect(within(table()).getByRole('link', { name: 'Overview' }).getAttribute('href')).toBe('/w/eng/p/NEX/overview')
  })

  it('a row opens the file in the viewer, and Download is noted; a file being checked doesn’t open', async () => {
    openFile.mockResolvedValue('blob:http://localhost/a1')
    show()
    await act(async () => fireEvent.click(within(table()).getByText('flow.pdf')))
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(noteDownload).toHaveBeenCalledWith('a1')
    openFile.mockClear()
    await act(async () => fireEvent.click(within(table()).getByText('wait.pdf')))
    expect(openFile).not.toHaveBeenCalled()
  })

  it('a file’s name in the table is a button that opens it, so the keyboard can (UX Phase 5A, 5.6)', async () => {
    openFile.mockResolvedValue('blob:http://localhost/a1')
    show()
    await act(async () => fireEvent.click(within(table()).getByRole('button', { name: /^flow\.pdf/ })))
    expect(screen.getByRole('dialog', { name: 'flow.pdf' })).toBeTruthy()
  })

  it('a file that fails to open says so', async () => {
    openFile.mockRejectedValue(new Error('x'))
    show()
    await act(async () => fireEvent.click(within(table()).getByText('scope.pdf')))
    expect(screen.getByText("scope.pdf couldn’t be opened. Try again.")).toBeTruthy()
  })

  it('Load more fetches the next page', () => {
    query = page(rows, '50')
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(query.fetchNextPage).toHaveBeenCalled()
  })

  it('says when there are no files, or none match, with Clear filters', () => {
    query = page([])
    show()
    expect(screen.getByText('No files yet. Files added to tasks, comments, chat and Overview show here.')).toBeTruthy()
    cleanup()
    show('/w/eng/p/NEX/files?from=chat')
    expect(screen.getByText('No files match these filters.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(location).toBe('/w/eng/p/NEX/files')
  })

  it('a list that fails says so, with Try again', () => {
    query = { ...page([]), data: undefined, isError: true }
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(query.refetch).toHaveBeenCalled()
  })
})
