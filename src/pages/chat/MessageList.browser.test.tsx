import '@/index.css'
import { QueryClient, QueryClientProvider, useInfiniteQuery } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, Page, User } from '@/api/types'
import { MessageList } from '@/pages/chat/MessageList'

// Scrolling needs real layout, so these run in Chromium (the `browser` test project), with the app's CSS.

afterEach(cleanup)

const users: User[] = [
  { id: 'u-1', name: 'Youssef Abdelrahman' },
  { id: 'u-2', name: 'Nour El-Sayed' },
] as User[]

const PAGE = 30
const start = Date.UTC(2026, 9, 28, 8, 0)

/** A channel of `count` messages, alternating authors every 3 so some rows group and some don't. */
function channel(count: number) {
  const messages: ChatMessage[] = []
  const add = (senderId = 'u-2') => {
    const seq = messages.length + 1
    messages.push({
      id: `m${seq}`, channelId: 'c1', seq, senderId, content: `Message ${seq}${seq % 4 === 0 ? ' — a longer one that wraps onto a second line when the list is narrow enough to need it' : ''}`,
      attachments: [], reactions: [], threadCount: 0, lastReplyAt: null, linkedTicketKeys: [], mentions: [], editedAt: null,
      createdAt: new Date(start + seq * 60_000).toISOString(),
    })
  }
  for (let i = 0; i < count; i++) add(Math.floor(i / 3) % 2 ? 'u-1' : 'u-2')
  /** Newest first, older than `before` (a seq). */
  const page = async (before?: string): Promise<Page<ChatMessage>> => {
    await new Promise((r) => setTimeout(r, 200))
    const older = messages.filter((m) => before === undefined || m.seq < Number(before)).sort((a, b) => b.seq - a.seq)
    const items = older.slice(0, PAGE)
    return { items, nextCursor: older.length > PAGE ? String(items[items.length - 1].seq) : null }
  }
  return { messages, add, page }
}

function Harness({ data, newAfterSeq = null, totalUnread = 0 }: { data: ReturnType<typeof channel>; newAfterSeq?: number | null; totalUnread?: number }) {
  const query = useInfiniteQuery({
    queryKey: ['messages'],
    queryFn: ({ pageParam }) => data.page(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  return (
    <div className="flex flex-col" style={{ height: 600, width: 720 }}>
      <MessageList
        query={query}
        title="#general"
        users={users}
        meId="u-1"
        canPost={false}
        newAfterSeq={newAfterSeq}
        totalUnread={totalUnread}
        markedSeq={newAfterSeq ?? 0}
        onMarkRead={vi.fn()}
        onJump={vi.fn()}
        onLatest={vi.fn()}
      />
    </div>
  )
}

function mount(props: Parameters<typeof Harness>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Harness {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return client
}

const list = () => screen.getByRole('log') as HTMLElement
const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms))
const distanceFromEnd = () => list().scrollHeight - list().scrollTop - list().clientHeight
const seqOf = (li: Element) => Number(li.textContent?.match(/Message (\d+)/)?.[1] ?? NaN)
/** Where message `seq`'s row is, from the list's top; null when it isn't drawn. */
function topOf(seq: number): number | null {
  const row = Array.from(list().querySelectorAll('li')).find((li) => seqOf(li) === seq)
  return row ? row.getBoundingClientRect().top - list().getBoundingClientRect().top : null
}
/** The first message whose row's top is on screen. */
function firstOnScreen(): number {
  const rows = Array.from(list().querySelectorAll('li'))
    .map((li) => ({ seq: seqOf(li), top: li.getBoundingClientRect().top - list().getBoundingClientRect().top }))
    .filter(({ seq, top }) => top >= 0 && !Number.isNaN(seq))
    .sort((a, b) => a.top - b.top)
  return rows[0].seq
}

describe('MessageList scrolling (spec 6.2)', () => {
  it('opens at the newest message', async () => {
    mount({ data: channel(80) })
    await vi.waitFor(() => expect(topOf(80)).not.toBeNull())
    await settle()
    expect(distanceFromEnd()).toBeLessThan(32)
  })

  it('keeps the view in place when a page of older messages lands above it', async () => {
    mount({ data: channel(80) })
    await vi.waitFor(() => expect(topOf(80)).not.toBeNull())
    await settle()
    const height = list().scrollHeight
    list().scrollTop = 200
    await settle(50)
    const anchor = firstOnScreen()
    // Messages 21–80 are in (a page shorter than two screens fetches the next one on open); scrolling up asks for
    // 1–20, which land above this row.
    expect(anchor).toBeGreaterThan(20)
    const before = topOf(anchor)!
    // The older page arrives 200ms later and is measured over the next frames.
    await vi.waitFor(() => expect(list().scrollHeight).toBeGreaterThan(height + 500), { timeout: 3000 })
    await settle()
    const after = topOf(anchor)
    expect(after).not.toBeNull()
    expect(Math.abs(after! - before)).toBeLessThanOrEqual(2)
  })

  it('follows a new message while at the end', async () => {
    const data = channel(40)
    const client = mount({ data })
    await vi.waitFor(() => expect(topOf(40)).not.toBeNull())
    await settle()
    data.add()
    await client.invalidateQueries()
    await vi.waitFor(() => expect(topOf(41)).not.toBeNull())
    await settle()
    expect(distanceFromEnd()).toBeLessThan(32)
  })

  it('stays put when scrolled up, and offers Jump to latest with the count', async () => {
    const data = channel(40)
    const client = mount({ data })
    await vi.waitFor(() => expect(topOf(40)).not.toBeNull())
    await settle()
    list().scrollTop = 300
    await settle(100)
    const anchor = firstOnScreen()
    const before = topOf(anchor)!
    data.add()
    await client.invalidateQueries()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Jump to latest · 1 new' })).toBeTruthy())
    const after = topOf(anchor)
    expect(after).not.toBeNull()
    expect(Math.abs(after! - before)).toBeLessThanOrEqual(2)
  })

  it('opens at the New line with the unread bar when the unread messages fill more than a screen', async () => {
    mount({ data: channel(80), newAfterSeq: 30, totalUnread: 50 })
    await vi.waitFor(() => expect(screen.getByText(/50 new messages since/)).toBeTruthy())
    await settle()
    const line = screen.getByRole('separator', { name: 'New messages' })
    const top = line.getBoundingClientRect().top - list().getBoundingClientRect().top
    // Just under the bar (which takes the top 40px), not scrolled away.
    expect(top).toBeGreaterThanOrEqual(24)
    expect(top).toBeLessThan(120)
  })
})
