import '@/index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import type { Channel, ChatMessage, ThreadCard, ThreadReply, ThreadsPage as Page, User } from '@/api/types'
import { ToastProvider } from '@/components/sf/Toast'
import { api } from '@/lib/api'
import { parseBody } from '@/lib/messageBody'
import { ThreadsPage } from './ThreadsPage'

// The view with its cards, read on screen, Unfollow and Show more; the server is faked with spies.

const users = [
  { id: 'u-1', name: 'Youssef Abdelrahman', title: 'Managing Director', email: 'y@spark-sys.com', presence: 'active', role: 'admin', teamIds: [] },
  { id: 'u-2', name: 'Nour El-Sayed', title: 'Backend lead', email: 'n@spark-sys.com', presence: 'away', role: 'pm', teamIds: [] },
] as unknown as User[]
const backend: Channel = {
  id: 'c-backend', workspaceId: 'ws-eng', kind: 'channel', name: 'backend', topic: '', memberIds: ['u-1', 'u-2'], isPrivate: false, lastMessageAt: null, description: '', whoCanPost: 'everyone', isDefault: false,
  unreadCount: 0, lastSeq: 9, lastReadSeq: 9, starred: false, muted: false, notifyLevel: 'all',
}
const root = (id: string, text: string): ChatMessage => ({
  id, channelId: 'c-backend', seq: 1, senderId: 'u-1', content: text, body: parseBody(text), attachments: [], reactions: [], threadCount: 3, lastReplyAt: null,
  linkedTicketKeys: [], mentions: [], editedAt: null, createdAt: '2026-10-30T08:00:00.000Z', following: true,
})
const reply = (id: string, messageId: string, text: string, minute: number): ThreadReply => ({
  id, messageId, channelId: 'c-backend', senderId: 'u-2', content: text, body: parseBody(text), attachments: [], reactions: [], mentions: [], createdAt: `2026-10-30T09:${String(minute).padStart(2, '0')}:00.000Z`,
})
const card = (id: string, unreadCount: number, minute: number, extra: Partial<ThreadCard> = {}): ThreadCard => ({
  root: root(id, `Parent ${id}`), channelId: 'c-backend', replies: [reply(`${id}-r1`, id, `Reply one of ${id}`, minute - 1), reply(`${id}-r2`, id, `Reply two of ${id}`, minute)],
  totalReplies: 2, unreadCount, participantIds: ['u-2', 'u-1'], lastReplyAt: `2026-10-30T09:${String(minute).padStart(2, '0')}:00.000Z`, ...extra,
})

let server: ThreadCard[]
beforeEach(() => {
  server = [card('a', 2, 30), card('b', 0, 40)]
  vi.spyOn(api.users, 'me').mockResolvedValue(users[0])
  vi.spyOn(api.users, 'list').mockResolvedValue(users)
  vi.spyOn(api.workspaces, 'list').mockResolvedValue([{ id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' }])
  vi.spyOn(api.chat, 'channels').mockResolvedValue([backend])
  vi.spyOn(api.projects, 'list').mockResolvedValue([])
  vi.spyOn(api.chat, 'drafts').mockResolvedValue([])
  vi.spyOn(api.threads, 'list').mockImplementation(async (): Promise<Page> => ({ items: structuredClone(server), nextCursor: null, unreadThreads: server.filter((c) => c.unreadCount > 0).length }))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function mount(width = 900) {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/w/engineering/threads']}>
          <Routes>
            <Route
              path="/w/:ws/threads"
              element={
                <main style={{ width, height: 700, display: 'flex' }}>
                  <ThreadsPage />
                </main>
              }
            />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
  return client
}
const cards = () => screen.getAllByRole('article').filter((a) => a.getAttribute('aria-labelledby') && within(a).queryByRole('heading'))
const parents = () => cards().map((c) => (c.textContent!.match(/Parent (\w)/) ?? [])[1])

describe('the Threads view (spec 6.12)', () => {
  it('lists unread threads first with how many are new, then the rest, then You’re caught up', async () => {
    mount()
    await screen.findByText('Parent a', undefined, { timeout: 3000 })
    expect(parents()).toEqual(['a', 'b'])
    expect(cards()[0].textContent).toContain('2 new')
    expect(cards()[1].textContent).not.toContain('new')
    expect(within(cards()[0]).getByRole('separator', { name: 'New replies' })).toBeTruthy()
    expect(screen.getByText('You’re caught up.')).toBeTruthy()
  })

  it('asks for the list once on open', async () => {
    mount()
    await screen.findByText('Parent a', undefined, { timeout: 3000 })
    await new Promise((r) => setTimeout(r, 300))
    expect(api.threads.list).toHaveBeenCalledTimes(1)
  })

  it('says so when I follow no threads', async () => {
    server = []
    mount()
    expect(await screen.findByText(/No threads yet/, undefined, { timeout: 3000 })).toBeTruthy()
  })

  it('a card on screen for a second is read; it keeps its place and its New marks until I leave', async () => {
    const markRead = vi.spyOn(api.threads, 'markRead').mockImplementation(async (_ws, ids) => {
      server = server.map((c) => (ids.includes(c.root.id) ? { ...c, unreadCount: 0 } : c))
    })
    const client = mount()
    await screen.findByText('Parent a', undefined, { timeout: 3000 })
    await vi.waitFor(() => expect(markRead).toHaveBeenCalledWith('ws-eng', ['a']), { timeout: 3000 })
    expect(markRead).not.toHaveBeenCalledWith('ws-eng', ['b'])
    await client.invalidateQueries()
    await vi.waitFor(() => expect(vi.mocked(api.threads.list).mock.calls.length).toBeGreaterThanOrEqual(2))
    await new Promise((r) => setTimeout(r, 100))
    expect(parents()).toEqual(['a', 'b'])
    expect(cards()[0].textContent).toContain('2 new')
  })

  it('a new reply moves its thread up', async () => {
    const client = mount()
    await screen.findByText('Parent a', undefined, { timeout: 3000 })
    server = [card('a', 2, 30), card('b', 1, 50)]
    await client.invalidateQueries()
    await vi.waitFor(() => expect(parents()).toEqual(['b', 'a']))
  })

  it('Unfollow folds the card where it is; Follow again brings it back', async () => {
    const setFollowing = vi.spyOn(api.chat, 'setFollowing').mockImplementation(async (id, following) => {
      server = following ? [card('a', 0, 30), card('b', 0, 40)] : server.filter((c) => c.root.id !== id)
    })
    vi.spyOn(api.threads, 'markRead').mockResolvedValue()
    mount()
    await screen.findByText('Parent b', undefined, { timeout: 3000 })
    await userEvent.click(within(cards()[1]).getByRole('button', { name: 'Unfollow' }))
    expect(setFollowing).toHaveBeenCalledWith('b', false)
    await vi.waitFor(() => expect(cards()[1].textContent).toContain('You won’t be told about new replies.'))
    expect(cards()).toHaveLength(2)
    await userEvent.click(within(cards()[1]).getByRole('button', { name: 'Follow again' }))
    expect(setFollowing).toHaveBeenLastCalledWith('b', true)
    await vi.waitFor(() => expect(cards()[1].textContent).toContain('Parent b'))
  })

  it('Show N more replies loads the whole thread into the card', async () => {
    server = [card('a', 0, 30, { totalReplies: 5 })]
    const replies = vi.spyOn(api.chat, 'replies').mockResolvedValue([1, 2, 3, 4, 5].map((n) => reply(`a-x${n}`, 'a', `Reply ${n} of 5`, n)))
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Show 3 more replies' }, { timeout: 3000 }))
    expect(replies).toHaveBeenCalledWith('a')
    expect(await screen.findByText('Reply 1 of 5')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /more repl/ })).toBeNull()
  })

  it('a card stays while I’m here even when the server stops listing it (read past the loaded pages, or left)', async () => {
    const client = mount()
    await screen.findByText('Parent b', undefined, { timeout: 3000 })
    server = [card('a', 0, 30)]
    await client.invalidateQueries()
    await vi.waitFor(() => expect(vi.mocked(api.threads.list).mock.calls.length).toBeGreaterThanOrEqual(2))
    await new Promise((r) => setTimeout(r, 100))
    expect(parents()).toEqual(['a', 'b'])
  })

  it('Follow again never takes the card away while the list catches up', async () => {
    let follows = 0
    vi.spyOn(api.chat, 'setFollowing').mockImplementation(async (_id, following) => {
      if (following) follows++
      server = following ? server : server.filter((c) => c.root.id !== 'b')
    })
    vi.spyOn(api.threads, 'markRead').mockResolvedValue()
    mount()
    await screen.findByText('Parent b', undefined, { timeout: 3000 })
    await userEvent.click(within(cards()[1]).getByRole('button', { name: 'Unfollow' }))
    const again = await screen.findByRole('button', { name: 'Follow again' })
    await userEvent.click(again)
    for (let i = 0; i < 10; i++) {
      expect(cards()).toHaveLength(2)
      await new Promise((r) => setTimeout(r, 20))
    }
    expect(follows).toBe(1)
  })

  it('the reply box opens on Reply…, with the caret in it; a thread with a draft shows its box at once', async () => {
    vi.spyOn(api.chat, 'drafts').mockResolvedValue([{ channelId: 'c-backend', rootId: 'b', body: parseBody('half written'), updatedAt: '2026-10-30T10:00:00.000Z' }])
    mount()
    await screen.findByText('Parent a', undefined, { timeout: 3000 })
    await vi.waitFor(() => expect(within(cards()[1]).getByRole('textbox', { name: 'Reply in the thread' })).toBeTruthy())
    expect(within(cards()[0]).queryByRole('textbox')).toBeNull()
    await userEvent.click(within(cards()[0]).getByRole('button', { name: 'Reply…' }))
    const box = await within(cards()[0]).findByRole('textbox', { name: 'Reply in the thread' })
    await vi.waitFor(() => expect(document.activeElement).toBe(box))
  })

  it('says so when the channels or people don’t load', async () => {
    vi.spyOn(api.chat, 'channels').mockRejectedValue(new Error('down'))
    mount()
    expect(await screen.findByText('Threads didn’t load.', undefined, { timeout: 5000 })).toBeTruthy()
  })

  it('fits a 390px phone', async () => {
    await page.viewport(390, 844)
    try {
      mount(390)
      await screen.findByText('Parent a', undefined, { timeout: 3000 })
      for (const c of cards()) expect(c.getBoundingClientRect().right).toBeLessThanOrEqual(390)
      const list = screen.getByRole('list', { name: 'Threads' }).parentElement!
      expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth)
    } finally {
      await page.viewport(414, 896)
    }
  })
})
