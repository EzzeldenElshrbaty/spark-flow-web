// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Bookmark } from '@/api/types'
import { ChannelTabs } from '@/pages/chat/ChannelTabs'

afterEach(cleanup)
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const bookmarks: Bookmark[] = [{ id: 'b1', channelId: 'c-backend', title: 'Runbook', url: 'https://wiki.spark-sys.com/runbook', createdBy: 'u-1', createdAt: '' }]
const show = (props: Partial<Parameters<typeof ChannelTabs>[0]> = {}) => {
  const onAddBookmark = vi.fn(async (_b: { title: string; url: string }) => {})
  render(<ChannelTabs channel={{ kind: 'channel' }} tab="messages" onChange={vi.fn()} panelId="p" bookmarks={bookmarks} onAddBookmark={onAddBookmark} {...props} />)
  return onAddBookmark
}

describe('the tabs row’s bookmarks (spec 6.1: a separator, then bookmarks, then +)', () => {
  it('shows each bookmark as a link that opens in a new tab without handing over the page', () => {
    show()
    const link = screen.getByRole('link', { name: 'Runbook' })
    expect(link.getAttribute('href')).toBe('https://wiki.spark-sys.com/runbook')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('+ adds a bookmark: an address and an optional name', async () => {
    const onAdd = show()
    fireEvent.click(screen.getByRole('button', { name: 'Add a bookmark' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Add a bookmark' }))
    fireEvent.change(dialog.getByRole('textbox', { name: 'Address' }), { target: { value: 'grafana.spark-sys.com/d/api' } })
    fireEvent.change(dialog.getByRole('textbox', { name: 'Name (optional)' }), { target: { value: 'API dashboard' } })
    await act(async () => {
      fireEvent.click(dialog.getByRole('button', { name: 'Add' }))
    })
    expect(onAdd).toHaveBeenCalledWith({ title: 'API dashboard', url: 'grafana.spark-sys.com/d/api' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a refused address keeps the dialog and says why; no + where I can’t post', async () => {
    show({ onAddBookmark: vi.fn(async () => Promise.reject(new Error('Use a web address (https://…).'))) })
    fireEvent.click(screen.getByRole('button', { name: 'Add a bookmark' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Add a bookmark' }))
    fireEvent.change(dialog.getByRole('textbox', { name: 'Address' }), { target: { value: 'javascript:alert(1)' } })
    await act(async () => {
      fireEvent.click(dialog.getByRole('button', { name: 'Add' }))
    })
    expect(dialog.getByText('Use a web address (https://…).')).toBeTruthy()
    cleanup()
    show({ onAddBookmark: undefined })
    expect(screen.queryByRole('button', { name: 'Add a bookmark' })).toBeNull()
  })
})

describe('hidden tabs (UX Phase 2, 2.5)', () => {
  it('leaves out the tabs it is told to: a project’s chat has no second Files list', () => {
    show({ hidden: ['files'] })
    expect(screen.getAllByRole('tab').map((t) => t.textContent?.trim())).toEqual(['Messages', 'Pins', 'Page'])
  })
})
