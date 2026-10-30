// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Attachment, ChannelFile, User } from '@/api/types'
import { FilesTab, type FilesFilter } from '@/pages/chat/files/FilesTab'

afterEach(cleanup)
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const people = [
  { id: 'u-1', name: 'Youssef Abdelrahman' },
  { id: 'u-2', name: 'Nour El-Sayed' },
] as User[]
const file = (id: string, name: string, over: Partial<Attachment> = {}): Attachment => ({
  id, name, title: name, description: '', mimeType: 'application/pdf', size: 188_416, createdAt: '2026-10-28T09:00:00.000Z', uploadedBy: 'u-2',
  scanStatus: 'clean', thumbUrl: null, previewUrl: null, deletedAt: null, snippet: null, ...over,
})
const items: ChannelFile[] = [
  { file: file('a1', 'scope.pdf'), senderId: 'u-2', at: '2026-10-28T09:00:00.000Z', messageId: 'm1', replyId: null },
  { file: file('a2', 'q.txt', { title: 'explain-query', mimeType: 'text/plain', size: 900, snippet: { language: 'sql' } }), senderId: 'u-1', at: '2026-10-27T09:00:00.000Z', messageId: 'm2', replyId: null },
]

const show = (props: Partial<Parameters<typeof FilesTab>[0]> = {}) => {
  const handlers = { onFilter: vi.fn((_f: FilesFilter) => {}), onMore: vi.fn(), onOpen: vi.fn((_f: Attachment) => {}) }
  render(<FilesTab items={items} people={people} filter={{}} hasMore={false} loadingMore={false} {...handlers} {...props} />)
  return handlers
}

describe('Files tab (spec 6.1: every file in the channel, filterable by type, person and date)', () => {
  it('lists each file with its type, size, who shared it and when; opening one opens its details', () => {
    const { onOpen } = show()
    const rows = within(screen.getByRole('list', { name: 'Files' })).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('scope.pdf')
    expect(rows[0].textContent).toContain('Nour El-Sayed')
    expect(rows[1].textContent).toContain('explain-query')
    expect(rows[1].textContent).toContain('SQL snippet')
    fireEvent.click(within(rows[0]).getByRole('button', { name: /^Open scope\.pdf/ }))
    expect(onOpen).toHaveBeenCalledWith(items[0].file)
  })

  it('the Type, Person and Date filters each pick one and say what is picked', () => {
    const { onFilter } = show({ filter: { type: 'pdf' } })
    expect(screen.getByRole('button', { name: 'Type: PDFs' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Person: Anyone' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Nour El-Sayed' }))
    expect(onFilter).toHaveBeenLastCalledWith({ type: 'pdf', from: 'u-2' })
    fireEvent.click(screen.getByRole('button', { name: 'Date: Any time' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Last 7 days' }))
    expect(onFilter).toHaveBeenLastCalledWith({ type: 'pdf', date: 'week' })
  })

  it('Load more while there are more; an empty list says why and offers to clear filters', () => {
    const { onMore, onFilter } = show({ hasMore: true })
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(onMore).toHaveBeenCalled()
    cleanup()
    const second = show({ items: [], filter: { type: 'video' } })
    expect(screen.getByText('No files match these filters.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(second.onFilter).toHaveBeenLastCalledWith({})
    expect(onFilter).not.toHaveBeenCalled()
    cleanup()
    show({ items: [] })
    expect(screen.getByText('No files have been shared in this channel yet.')).toBeTruthy()
  })
})
