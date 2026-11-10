import '@/index.css'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import type { Attachment, ProjectFileRow, ProjectSummary, User } from '@/api/types'
import { answersTouch } from '@/test/touch'
import { FilesTab } from './FilesTab'

// Final review (UX Phase 5B, 5.4): on a phone a file's "From" link answers a 44px touch, and the file above it keeps
// its own taps.
const file = (id: string, name: string) => ({ id, name, title: name, mimeType: 'application/pdf', size: 1_258_291, uploadedBy: 'u-2', createdAt: '2026-11-03T10:00:00.000Z', scanStatus: 'clean' }) as Attachment
const rows: ProjectFileRow[] = [{ file: file('a1', 'flow.pdf'), source: { kind: 'task', taskKey: 'NEX-108' } }]
const query = { data: { pages: [{ items: rows, nextCursor: null }] }, isError: false, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn() }
vi.mock('@/api/projects', async (original) => ({ ...(await original<typeof import('@/api/projects')>()), useAllProjectFiles: () => query, openFile: vi.fn() }))

afterEach(async () => {
  cleanup()
  await page.viewport(414, 896)
})

describe('Files on a phone (final review)', () => {
  it('From answers up and down from its centre; the file’s button keeps its own taps', async () => {
    await page.viewport(390, 844)
    render(
      <MemoryRouter>
        <FilesTab ws="eng" project={{ id: 'p-nex', key: 'NEX', name: 'Nexus Core' } as ProjectSummary} users={[{ id: 'u-2', name: 'Nour El-Sayed' }] as User[]} />
      </MemoryRouter>,
    )
    const link = screen.getAllByRole('link', { name: 'NEX-108 · Attachment' }).find((l) => l.getClientRects().length > 0)!
    expect(answersTouch(link).slice(0, 2)).toEqual([true, true])
    const button = screen.getAllByRole('button', { name: /flow\.pdf/ }).find((b) => b.getClientRects().length > 0)!
    const b = button.getBoundingClientRect()
    expect(button.contains(document.elementFromPoint(b.left + b.width / 2, b.bottom - 3))).toBe(true)
  })
})
