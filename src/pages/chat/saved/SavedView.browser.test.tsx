import '@/index.css'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import type { SavedView as Saved } from '@/api/types'
import { SavedView } from '@/pages/chat/saved/SavedView'

// Spec 6.16 (slice AA): on a phone, a Saved row's buttons are 44px touch targets.

afterEach(async () => {
  cleanup()
  await page.viewport(414, 896)
})

const item: Saved = {
  id: 's1', userId: 'u-1', workspaceId: 'ws-eng', target: { kind: 'message', id: 'm1' }, status: 'inProgress', remindAt: null, firedAt: null,
  savedAt: new Date().toISOString(), channelId: 'c-backend', rootId: null, authorId: 'u-2', authorName: 'Nour El-Sayed', text: 'Rotate the refresh tokens', createdAt: new Date().toISOString(), gone: null,
}

describe('Saved on a 390px phone', () => {
  it('each row’s buttons are 44px and the page doesn’t scroll sideways', async () => {
    await page.viewport(390, 844)
    render(
      <MemoryRouter>
        <div className="sf">
          <SavedView items={[item]} ws="engineering" placeOf={() => '#backend'} error={false} retrying={false} onUpdate={vi.fn()} onRemove={vi.fn()} onRetry={vi.fn()} />
        </div>
      </MemoryRouter>,
    )
    const row = screen.getAllByRole('article')[0]!
    for (const name of ['Set reminder', 'Archive', 'More actions']) {
      const box = within(row).getByRole('button', { name }).getBoundingClientRect()
      expect([name, box.height >= 44 && box.width >= 44]).toEqual([name, true])
    }
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390)
  })
})
