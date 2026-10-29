import '@/index.css'
import { QueryClient, QueryClientProvider, useInfiniteQuery } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '@/components/sf/Toast'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import type { ChatMessage, Page, User } from '@/api/types'
import type { PendingMessage } from '@/lib/sendQueue'
import { parseBody } from '@/lib/messageBody'
import { MessageList } from '@/pages/chat/MessageList'
import { useEditing } from '@/pages/chat/editingStore'

// Scrolling needs real layout, so these run in Chromium (the `browser` test project), with the app's CSS.

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

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
    const content = `Message ${seq}${seq % 4 === 0 ? ' — a longer one that wraps onto a second line when the list is narrow enough to need it' : ''}`
    messages.push({
      id: `m${seq}`, channelId: 'c1', seq, senderId, content,
      attachments: [], reactions: [], threadCount: 0, lastReplyAt: null, linkedTicketKeys: [], mentions: [], body: parseBody(content), editedAt: null,
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

const scope = { projectKeys: new Set<string>(), ws: 'engineering', workspaceId: 'ws-eng' }

function Harness({
  data,
  newAfterSeq = null,
  totalUnread = 0,
  onMarkRead = vi.fn(),
  focusSeq = null,
  jumped = false,
  pending = [],
  onLatest = vi.fn(),
  holdRead = false,
  onMarkUnread,
}: {
  data: ReturnType<typeof channel>
  newAfterSeq?: number | null
  totalUnread?: number
  onMarkRead?: (seq?: number) => void
  focusSeq?: number | null
  /** A jump's window: newer messages are said to be still unloaded below. */
  jumped?: boolean
  pending?: PendingMessage[]
  onLatest?: () => void
  holdRead?: boolean
  onMarkUnread?: (message: ChatMessage) => Promise<unknown>
}) {
  const query = useInfiniteQuery({
    queryKey: ['messages'],
    queryFn: ({ pageParam }) => (pageParam === 'newer' ? Promise.resolve({ items: [], nextCursor: null }) : data.page(pageParam)),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    getPreviousPageParam: (first) => (jumped && first.items.length > 0 ? 'newer' : undefined),
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
        onMarkRead={onMarkRead}
        holdRead={holdRead}
        onMarkUnread={onMarkUnread}
        focusSeq={focusSeq}
        onJump={vi.fn()}
        onLatest={onLatest}
        scope={scope}
        pending={pending}
      />
    </div>
  )
}

function mount(props: Parameters<typeof Harness>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const tree = (p: Parameters<typeof Harness>[0]) => (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <Harness {...p} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
  const { rerender } = render(tree(props))
  return Object.assign(client, { update: (more: Partial<Parameters<typeof Harness>[0]>) => rerender(tree({ ...props, ...more })) })
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

describe('MessageList announcements (spec 10)', () => {
  const announcer = () => document.querySelector('p[aria-live="polite"]')!

  it('the log itself is silent (rows mounting as I scroll are not news); one announcer reads new messages', async () => {
    // The last of 43 is Nour's, so opening could read it out.
    const data = channel(43)
    const client = mount({ data })
    await vi.waitFor(() => expect(topOf(43)).not.toBeNull())
    await settle()
    expect(list().getAttribute('aria-live')).toBe('off')
    // Opening the channel reads nothing out.
    expect(announcer().textContent).toBe('')
    data.add()
    await client.invalidateQueries()
    await vi.waitFor(() => expect(announcer().textContent).toBe('Nour El-Sayed: Message 44 — a longer one that wraps onto a second line when the list is narrow enough to need it'))
  })
})

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

  it('an edit started in the thread panel doesn’t move the channel; one started here brings its message into view', async () => {
    mount({ data: channel(60) })
    await vi.waitFor(() => expect(topOf(60)).not.toBeNull())
    await settle()
    const before = list().scrollTop
    try {
      // Message 35 is loaded (the newest 30 are) but off screen, above.
      act(() => useEditing.getState().start('m35', 'thread'))
      await settle(200)
      expect(list().scrollTop).toBe(before)
      act(() => useEditing.getState().start('m35', 'channel'))
      await vi.waitFor(() => expect(list().scrollTop).toBeLessThan(before))
    } finally {
      act(() => useEditing.getState().stop())
    }
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

  it('on desktop the New line is inset 24px, like the rows (.sf-newdiv)', async () => {
    await page.viewport(1280, 800)
    try {
      mount({ data: channel(80), newAfterSeq: 30, totalUnread: 50 })
      await vi.waitFor(() => expect(screen.getByRole('separator', { name: 'New messages' })).toBeTruthy())
      const line = screen.getByRole('separator', { name: 'New messages' })
      expect(getComputedStyle(line).paddingLeft).toBe('24px')
      expect(getComputedStyle(line).paddingRight).toBe('24px')
    } finally {
      await page.viewport(414, 896)
    }
  })

  it('my own new message brings me down to it, even when scrolled up', async () => {
    const data = channel(42)
    const client = mount({ data })
    await vi.waitFor(() => expect(topOf(42)).not.toBeNull())
    await settle()
    list().scrollTop = 200
    await settle(100)
    data.add('u-1')
    await client.invalidateQueries()
    await vi.waitFor(() => expect(topOf(43)).not.toBeNull())
    await settle()
    expect(distanceFromEnd()).toBeLessThan(32)
  })

  it('sending while a jump is open goes back to the live end, where the message shows', async () => {
    const onLatest = vi.fn()
    const view = mount({ data: channel(40), focusSeq: 15, jumped: true, onLatest })
    await vi.waitFor(() => expect(topOf(15)).not.toBeNull())
    await settle()
    const sending: PendingMessage = { clientId: 'k1', channelId: 'c1', content: 'hi', body: [], createdAt: new Date().toISOString(), status: 'sending' }
    view.update({ pending: [sending] })
    await vi.waitFor(() => expect(onLatest).toHaveBeenCalledOnce())
    // Retrying or deleting one already on its way isn't a new send.
    view.update({ pending: [{ ...sending, status: 'failed' }] })
    view.update({ pending: [] })
    await settle(50)
    expect(onLatest).toHaveBeenCalledOnce()
  })

  it('a jump lands on its message even when the newest message is mine', async () => {
    const data = channel(40)
    expect(data.messages.at(-1)!.senderId).toBe('u-1')
    mount({ data, focusSeq: 15 })
    await vi.waitFor(() => expect(topOf(15)).not.toBeNull())
    await settle()
    expect(topOf(15)).toBeGreaterThanOrEqual(0)
    expect(topOf(15)).toBeLessThan(120)
  })

  it('the unread bar offers Mark as unread (opening the channel marked it read, spec 6.2): it puts back the first new message', async () => {
    const onMarkUnread = vi.fn(async (_message: ChatMessage) => {})
    mount({ data: channel(80), newAfterSeq: 30, totalUnread: 50, onMarkUnread })
    await vi.waitFor(() => expect(screen.getByText(/50 new messages since/)).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Mark as read' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Mark as unread' }))
    expect(onMarkUnread).toHaveBeenCalledOnce()
    expect(onMarkUnread.mock.calls[0][0]).toMatchObject({ seq: 31 })
    expect(screen.queryByText(/50 new messages since/)).toBeNull()
  })

  it('opening at the New line, the list itself marks nothing read (opening the channel did)', async () => {
    // A focused, visible window: the only thing that keeps them unread is not being at the end.
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    const onMarkRead = vi.fn()
    mount({ data: channel(80), newAfterSeq: 30, totalUnread: 50, onMarkRead })
    await vi.waitFor(() => expect(screen.getByText(/50 new messages since/)).toBeTruthy())
    await settle()
    expect(onMarkRead).not.toHaveBeenCalled()
    // Nothing has come in since I opened it.
    expect(screen.getByRole('button', { name: 'Jump to latest' })).toBeTruthy()
  })

  it('opening at the newest message marks it read', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    const onMarkRead = vi.fn()
    mount({ data: channel(40), newAfterSeq: 38, totalUnread: 2, onMarkRead })
    await vi.waitFor(() => expect(onMarkRead).toHaveBeenCalledWith(40))
  })

  it('while the read is held (after U), being at the end marks nothing read; once the hold ends it does', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    const onMarkRead = vi.fn()
    const view = mount({ data: channel(40), newAfterSeq: 36, totalUnread: 3, onMarkRead, holdRead: true })
    await vi.waitFor(() => expect(screen.getByText(/^Message 40/)).toBeTruthy())
    await settle()
    expect(onMarkRead).not.toHaveBeenCalled()
    view.update({ holdRead: false })
    await vi.waitFor(() => expect(onMarkRead).toHaveBeenCalledWith(40))
  })
})
