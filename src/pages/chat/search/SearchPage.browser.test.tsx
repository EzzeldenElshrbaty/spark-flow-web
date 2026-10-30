import '@/index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import type { Channel, SearchRequest, SearchResults, User } from '@/api/types'
import { ToastProvider } from '@/components/sf/Toast'
import { api } from '@/lib/api'
import { SearchPage } from './SearchPage'

const users = [
  { id: 'u-1', name: 'Youssef Abdelrahman', email: 'youssef.abdelrahman@spark-sys.com', title: 'Managing Director', presence: 'active', role: 'admin', teamIds: [] },
  { id: 'u-2', name: 'Nour El-Sayed', email: 'nour.elsayed@spark-sys.com', title: 'Backend lead', presence: 'away', role: 'pm', teamIds: [] },
] as unknown as User[]
const channel = (id: string, name: string | null, kind: 'channel' | 'dm' = 'channel', memberIds = ['u-1', 'u-2']): Channel => ({
  id, workspaceId: 'ws-eng', kind, name, topic: 'APIs', memberIds, isPrivate: kind === 'dm', lastMessageAt: null, description: '', whoCanPost: 'everyone', isDefault: false,
  unreadCount: 0, lastSeq: 0, lastReadSeq: 0, starred: false, muted: false, notifyLevel: 'all',
})
const results = (n = 2): SearchResults => ({
  counts: { messages: n, files: 1, tasks: 0, channels: 1, people: 0 },
  items: Array.from({ length: n }, (_, i) => ({
    kind: 'message' as const, target: { kind: 'message' as const, id: `m${i}` }, channelId: 'c-backend', rootId: null, senderId: 'u-2',
    text: `Deploy number ${i} goes out`, createdAt: '2026-10-28T09:00:00.000Z',
  })),
  nextCursor: null,
})

let run: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.spyOn(api.users, 'me').mockResolvedValue(users[0])
  vi.spyOn(api.users, 'list').mockResolvedValue(users)
  vi.spyOn(api.workspaces, 'list').mockResolvedValue([{ id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' }])
  vi.spyOn(api.chat, 'channels').mockResolvedValue([channel('c-backend', 'backend'), channel('c-dm-1', null, 'dm')])
  vi.spyOn(api.projects, 'list').mockResolvedValue([])
  run = vi.fn(async (_ws: string, r: SearchRequest) => (r.q.includes('nothing') ? { ...results(0), counts: { messages: 0, files: 0, tasks: 0, channels: 0, people: 0 } } : results()))
  vi.spyOn(api.search, 'run').mockImplementation(run as unknown as typeof api.search.run)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Where() {
  const { search } = useLocation()
  return <div data-testid="where">{decodeURIComponent(search.replace(/\+/g, ' '))}</div>
}
function mount(at: string, width = 900) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={[at]}>
          <Routes>
            <Route
              path="/w/:ws/search"
              element={
                <main style={{ width, height: 700, display: 'flex', flexDirection: 'column' }}>
                  <SearchPage />
                  <Where />
                </main>
              }
            />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}
const where = () => screen.getByTestId('where').textContent
const lastRequest = () => run.mock.calls.at(-1)![1] as SearchRequest

describe('the Search view (spec 6.12)', () => {
  it('without a query, says where to type', async () => {
    mount('/w/engineering/search')
    expect(await screen.findByText(/Type in the search box/, undefined, { timeout: 3000 })).toBeTruthy()
    expect(run).not.toHaveBeenCalled()
  })

  it('shows Results for, the tabs with counts, and the cards with the matches marked', async () => {
    mount('/w/engineering/search?q=deploy')
    expect(await screen.findByRole('heading', { name: 'Results for “deploy”' }, { timeout: 3000 })).toBeTruthy()
    await screen.findAllByRole('article')
    expect(screen.getByRole('tab', { name: 'Messages 2' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Files 1' })).toBeTruthy()
    expect(screen.getAllByRole('article')[0].querySelector('mark')?.textContent).toBe('Deploy')
    expect(lastRequest()).toMatchObject({ q: 'deploy', tab: 'messages', sort: 'relevant', from: [], in: null })
  })

  it('a chip writes its filter into the query; set, it is inverted and × takes it off', async () => {
    mount('/w/engineering/search?q=deploy')
    await userEvent.click(await screen.findByRole('button', { name: 'From' }, { timeout: 3000 }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Nour El-Sayed' }))
    await vi.waitFor(() => expect(where()).toContain('q=deploy from:@nour.elsayed'))
    await vi.waitFor(() => expect(lastRequest().from).toEqual(['u-2']))
    expect(screen.getByRole('button', { name: 'From: Nour El-Sayed' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Remove From filter' }))
    await vi.waitFor(() => expect(where()).toBe('?q=deploy'))
  })

  it('Only threads, In a DM, the Sort and the tabs go into the address and the request', async () => {
    mount('/w/engineering/search?q=deploy')
    await userEvent.click(await screen.findByRole('button', { name: 'Only threads' }, { timeout: 3000 }))
    await vi.waitFor(() => expect(lastRequest().thread).toBe(true))
    await userEvent.click(screen.getByRole('button', { name: 'In' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Nour El-Sayed' }))
    await vi.waitFor(() => expect(lastRequest().in).toBe('c-dm-1'))
    await userEvent.click(screen.getByRole('button', { name: 'Sort: Most relevant' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Newest' }))
    await vi.waitFor(() => expect(lastRequest().sort).toBe('newest'))
    await userEvent.click(screen.getByRole('tab', { name: /^Files/ }))
    await vi.waitFor(() => expect(lastRequest().tab).toBe('files'))
    expect(where()).toContain('tab=files')
  })

  it('a filter that names no one says so and asks nothing', async () => {
    mount('/w/engineering/search?q=deploy from:@zed')
    expect((await screen.findByRole('status', undefined, { timeout: 3000 })).textContent).toBe('No one matches @zed.')
    expect(run).not.toHaveBeenCalled()
  })

  it('nothing found: says so, and Clear filters keeps only the words', async () => {
    mount(`/w/engineering/search?q=${encodeURIComponent('nothing in:#backend')}`)
    expect(await screen.findByText('Nothing matches “nothing in:#backend”.', undefined, { timeout: 3000 })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await vi.waitFor(() => expect(where()).toBe('?q=nothing'))
  })

  it('fits a 390px phone, with View in channel showing', async () => {
    await page.viewport(390, 844)
    try {
      mount('/w/engineering/search?q=deploy', 390)
      const [card] = await screen.findAllByRole('article', undefined, { timeout: 3000 })
      expect(card.getBoundingClientRect().right).toBeLessThanOrEqual(390)
      const view = within(card).getByRole('link', { name: /View in channel/ })
      expect(getComputedStyle(view).opacity).toBe('1')
      expect(view.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
      const panel = screen.getByRole('tabpanel')
      expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth)
    } finally {
      await page.viewport(414, 896)
    }
  })
})
