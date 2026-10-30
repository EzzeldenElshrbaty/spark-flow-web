import '@/index.css'
import { cleanup, render, screen } from '@testing-library/react'
import { page } from 'vitest/browser'
import { afterEach, describe, expect, it } from 'vitest'
import type { Attachment, ChannelFile, User } from '@/api/types'
import { FilesTab } from '@/pages/chat/files/FilesTab'

afterEach(cleanup)

const people = [{ id: 'u-2', name: 'Nour El-Sayed' }] as User[]
const items: ChannelFile[] = Array.from({ length: 500 }, (_, i) => ({
  file: {
    id: `a${i}`, name: `a-very-long-file-name-for-the-release-${i}-final-v2-approved.pdf`, title: `a-very-long-file-name-for-the-release-${i}-final-v2-approved.pdf`, description: '',
    mimeType: 'application/pdf', size: 188_416, createdAt: '2026-10-28T09:00:00.000Z', uploadedBy: 'u-2', scanStatus: 'clean', thumbUrl: null, previewUrl: null, deletedAt: null, snippet: null,
  } as Attachment,
  senderId: 'u-2', at: '2026-10-28T09:00:00.000Z', messageId: `m${i}`, replyId: null,
}))

describe('Files tab on a 390px phone (spec 6.16)', () => {
  it('500 files and the filters fit: no page scroll, 44px filter chips', async () => {
    await page.viewport(390, 844)
    try {
      render(
        <div className="sf flex h-[700px] flex-col" style={{ width: 390 }}>
          <FilesTab items={items} people={people} filter={{}} hasMore loadingMore={false} onFilter={() => {}} onMore={() => {}} onOpen={() => {}} />
        </div>,
      )
      expect(screen.getAllByRole('listitem')).toHaveLength(500)
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390)
      for (const name of ['Type: Any type', 'Person: Anyone', 'Date: Any time']) {
        const chip = screen.getByRole('button', { name }).getBoundingClientRect()
        expect(chip.height).toBeGreaterThanOrEqual(44)
        expect(chip.right).toBeLessThanOrEqual(390)
      }
    } finally {
      await page.viewport(1280, 800)
    }
  })
})
