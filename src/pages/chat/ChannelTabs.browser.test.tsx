import '@/index.css'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import type { Bookmark } from '@/api/types'
import { ChannelTabs } from '@/pages/chat/ChannelTabs'

// A channel's bookmarks on phones (follow-up to UX Phase 6): below 768 px they get their own row under the tabs, only
// when there are some, and + moves into Channel actions. Real layout, so Chromium.

afterEach(async () => {
  cleanup()
  await page.viewport(1280, 800)
})

const bookmark = (n: number, title = `Bookmark ${n}`): Bookmark => ({ id: `b${n}`, channelId: 'c-backend', title, url: `https://wiki.spark-sys.com/${n}`, createdBy: 'u-1', createdAt: '' })
const two = [bookmark(1, 'Runbook'), bookmark(2, 'API dashboard')]

function mount(bookmarks: Bookmark[]) {
  render(
    <div className="sf">
      <ChannelTabs channel={{ kind: 'channel' }} tab="messages" onChange={() => {}} panelId="p" pinCount={2} bookmarks={bookmarks} onAddBookmark={async () => {}} />
      <div id="p" role="tabpanel" aria-label="Messages" />
    </div>,
  )
}

const rect = (el: Element) => el.getBoundingClientRect()
const strip = () => screen.getByRole('list', { name: 'Bookmarks' }).parentElement!

describe('the bookmarks row on phones', () => {
  it('on a phone the bookmarks get their own row under the tabs', async () => {
    await page.viewport(390, 844)
    mount(two)
    const tabs = screen.getByRole('tablist', { name: 'Channel views' })
    const list = screen.getByRole('list', { name: 'Bookmarks' })
    await waitFor(() => expect(rect(list).top).toBeGreaterThanOrEqual(rect(tabs).bottom))
    const first = rect(screen.getByRole('link', { name: 'Runbook' }))
    expect(first.left).toBeGreaterThanOrEqual(0)
    expect(first.right).toBeLessThanOrEqual(Math.min(390, rect(strip()).right))
    expect(screen.queryByRole('button', { name: 'Add a bookmark' })).toBeNull()
  })

  it('on a phone with no bookmarks there is no row', async () => {
    await page.viewport(390, 844)
    mount([])
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Add a bookmark' })).toBeNull())
    expect(screen.queryByRole('list', { name: 'Bookmarks' })).toBeNull()
    const tabs = screen.getByRole('tablist', { name: 'Channel views' })
    expect(rect(tabs.parentElement!.parentElement!).height).toBe(rect(tabs).height)
    expect(rect(tabs).height).toBe(44)
  })

  it('from 768 px the bookmarks stay after the tabs, with +', async () => {
    await page.viewport(1280, 800)
    mount(two)
    const tabs = screen.getByRole('tablist', { name: 'Channel views' })
    expect(rect(screen.getByRole('list', { name: 'Bookmarks' })).top).toBeLessThan(rect(tabs).bottom)
    expect(screen.getByRole('button', { name: 'Add a bookmark' })).toBeTruthy()
  })

  it('a long title or many bookmarks scroll inside the row, never the page', async () => {
    await page.viewport(390, 844)
    mount([bookmark(1, 'x'.repeat(80)), ...Array.from({ length: 7 }, (_, i) => bookmark(i + 2))])
    await waitFor(() => expect(strip().scrollWidth).toBeGreaterThan(strip().clientWidth))
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390)
  })

  it('shrinking to a phone keeps an open Add a bookmark', async () => {
    await page.viewport(1280, 800)
    mount(two)
    await userEvent.click(screen.getByRole('button', { name: 'Add a bookmark' }))
    const dialog = screen.getByRole('dialog', { name: 'Add a bookmark' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Address' }), 'wiki.spark-sys.com')
    await page.viewport(390, 844)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Add a bookmark' })).toBeNull())
    expect((within(screen.getByRole('dialog', { name: 'Add a bookmark' })).getByRole('textbox', { name: 'Address' }) as HTMLInputElement).value).toBe('wiki.spark-sys.com')
  })
})
