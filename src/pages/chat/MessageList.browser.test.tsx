import '@/index.css'
import { QueryClient, QueryClientProvider, useInfiniteQuery } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
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
function channel(count: number, apartMs = 60_000) {
  const messages: ChatMessage[] = []
  const add = (senderId = 'u-2') => {
    const seq = messages.length + 1
    const content = `Message ${seq}${seq % 4 === 0 ? ' — a longer one that wraps onto a second line when the list is narrow enough to need it' : ''}`
    messages.push({
      id: `m${seq}`, channelId: 'c1', seq, senderId, content,
      attachments: [], reactions: [], threadCount: 0, lastReplyAt: null, linkedTicketKeys: [], mentions: [], body: parseBody(content), editedAt: null,
      createdAt: new Date(start + seq * apartMs).toISOString(),
    })
  }
  for (let i = 0; i < count; i++) add(Math.floor(i / 3) % 2 ? 'u-1' : 'u-2')
  /** Pages wait for this while it is set: a test can look at the list with a page on its way. */
  let held: Promise<void> | null = null
  /** Holds pages back until the returned function lets them land. */
  const hold = () => {
    let land = () => {}
    held = new Promise((r) => (land = r))
    return () => {
      held = null
      land()
    }
  }
  /** Newest first, older than `before` (a seq). */
  const page = async (before?: string): Promise<Page<ChatMessage>> => {
    await new Promise((r) => setTimeout(r, 200))
    await held
    const older = messages.filter((m) => before === undefined || m.seq < Number(before)).sort((a, b) => b.seq - a.seq)
    const items = older.slice(0, PAGE)
    return { items, nextCursor: older.length > PAGE ? String(items[items.length - 1].seq) : null }
  }
  return { messages, add, hold, page }
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
  intro,
}: {
  data: ReturnType<typeof channel>
  newAfterSeq?: number | null
  totalUnread?: number
  onMarkRead?: (seq?: number) => void
  focusSeq?: number | null
  /** A jump's window: newer messages are said to be still unloaded below, however many newer pages load. */
  jumped?: boolean
  pending?: PendingMessage[]
  onLatest?: () => void
  holdRead?: boolean
  onMarkUnread?: (message: ChatMessage) => Promise<unknown>
  intro?: ReactNode
}) {
  const query = useInfiniteQuery({
    queryKey: ['messages'],
    queryFn: ({ pageParam }) => (pageParam === 'newer' ? Promise.resolve({ items: [], nextCursor: null }) : data.page(pageParam)),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    // Not "until an empty page": whether the list comes near enough to the end to ask for one depends on how tall
    // the rows are, and the jump must not end on that.
    getPreviousPageParam: () => (jumped ? 'newer' : undefined),
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
        intro={intro}
      />
    </div>
  )
}

/** The query client of the list mounted last. */
let current: QueryClient

function mount(props: Parameters<typeof Harness>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  current = client
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
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
/**
 * Waits until the list is still: drawn, its fonts in, nothing loading (with `loading`, a page may be on its way) and
 * the same scroll place and height three frames running. Opening takes a page or two (200ms each here), then frames
 * of measuring and scrolling there; in a full run, with the unit tests busy beside it, a fixed pause can end first.
 */
async function still({ loading = false } = {}) {
  const until = performance.now() + 10_000
  for (let last = '', same = 0; same < 3; ) {
    if (performance.now() > until) throw new Error(`The list kept moving (${last || 'not drawn, loading or fonts on their way'})`)
    await frame()
    const el = document.querySelector<HTMLElement>('[role="log"]')
    const ready = el && document.fonts.status === 'loaded' && (loading || current.isFetching() === 0)
    const now = ready ? `${el.scrollTop} ${el.scrollHeight}` : ''
    same = now !== '' && now === last ? same + 1 : 0
    last = now
  }
}
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
    await still()
    expect(topOf(43)).not.toBeNull()
    expect(list().getAttribute('aria-live')).toBe('off')
    // Opening the channel reads nothing out.
    expect(announcer().textContent).toBe('')
    data.add()
    await client.invalidateQueries()
    await still()
    expect(announcer().textContent).toBe('Nour El-Sayed: Message 44 — a longer one that wraps onto a second line when the list is narrow enough to need it')
  })
})

describe('MessageList scrolling (spec 6.2)', () => {
  it('opens at the newest message', async () => {
    mount({ data: channel(80) })
    await still()
    expect(topOf(80)).not.toBeNull()
    expect(distanceFromEnd()).toBeLessThan(32)
  })

  it('keeps the view in place when a page of older messages lands above it', async () => {
    const data = channel(80)
    mount({ data })
    // Messages 21–80 are in (a page shorter than two screens fetches the next one on open).
    await still()
    const height = list().scrollHeight
    // Scrolling up asks for 1–20, held back until the view is measured.
    const land = data.hold()
    list().scrollTop = 200
    await still({ loading: true })
    expect(current.isFetching({ queryKey: ['messages'] })).toBe(1)
    const anchor = firstOnScreen()
    expect(anchor).toBeGreaterThan(20)
    const before = topOf(anchor)!
    // 1–20 land above this row and are measured over the next frames.
    land()
    await still()
    expect(list().scrollHeight).toBeGreaterThan(height + 500)
    const after = topOf(anchor)
    expect(after).not.toBeNull()
    expect(Math.abs(after! - before)).toBeLessThanOrEqual(2)
  })

  it('follows a new message while at the end', async () => {
    const data = channel(40)
    const client = mount({ data })
    await still()
    data.add()
    await client.invalidateQueries()
    await still()
    expect(topOf(41)).not.toBeNull()
    expect(distanceFromEnd()).toBeLessThan(32)
  })

  it('stays put when scrolled up, and offers Jump to latest with the count', async () => {
    const data = channel(40)
    const client = mount({ data })
    await still()
    // The top: more than a screen from the end however tall the rows are, so Jump to latest shows. The older page
    // that asks for lands above.
    list().scrollTop = 0
    await still()
    const anchor = firstOnScreen()
    const before = topOf(anchor)!
    data.add()
    await client.invalidateQueries()
    await still()
    expect(screen.getByRole('button', { name: 'Jump to latest · 1 new' })).toBeTruthy()
    const after = topOf(anchor)
    expect(after).not.toBeNull()
    expect(Math.abs(after! - before)).toBeLessThanOrEqual(2)
  })

  it('an edit started in the thread panel doesn’t move the channel; one started here brings its message into view', async () => {
    mount({ data: channel(60) })
    await still()
    const before = list().scrollTop
    try {
      // Message 35 is loaded (the newest 30 are) but off screen, above.
      act(() => useEditing.getState().start('m35', 'thread'))
      await still()
      expect(list().scrollTop).toBe(before)
      act(() => useEditing.getState().start('m35', 'channel'))
      await vi.waitFor(() => expect(list().scrollTop).toBeLessThan(before))
    } finally {
      act(() => useEditing.getState().stop())
    }
  })

  it('opens at the New line with the unread bar when the unread messages fill more than a screen', async () => {
    mount({ data: channel(80), newAfterSeq: 30, totalUnread: 50 })
    await still()
    expect(screen.getByText(/50 new messages since/)).toBeTruthy()
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
      await still()
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
    await still()
    list().scrollTop = 200
    await still()
    data.add('u-1')
    await client.invalidateQueries()
    await still()
    expect(topOf(43)).not.toBeNull()
    expect(distanceFromEnd()).toBeLessThan(32)
  })

  it('at the end, a shorter list stays at the end: a row above it or a taller composer doesn’t hide the newest', async () => {
    mount({ data: channel(42) })
    await still()
    const end = distanceFromEnd()
    expect(end).toBeLessThan(32)
    const box = list().closest<HTMLElement>('div[style]')!
    box.style.height = '556px'
    await still()
    expect(distanceFromEnd()).toBeLessThanOrEqual(end + 1)
  })

  it('scrolled up, a shorter list keeps its place', async () => {
    mount({ data: channel(42) })
    await still()
    list().scrollTop = 200
    await still()
    const place = list().scrollTop
    const box = list().closest<HTMLElement>('div[style]')!
    box.style.height = '556px'
    await still()
    expect(list().scrollTop).toBe(place)
  })

  it('sending while a jump is open goes back to the live end, where the message shows', async () => {
    const onLatest = vi.fn()
    const view = mount({ data: channel(40), focusSeq: 15, jumped: true, onLatest })
    await still()
    expect(topOf(15)).not.toBeNull()
    const sending: PendingMessage = { clientId: 'k1', channelId: 'c1', content: 'hi', body: [], createdAt: new Date().toISOString(), status: 'sending' }
    view.update({ pending: [sending] })
    await vi.waitFor(() => expect(onLatest).toHaveBeenCalledOnce())
    // Retrying or deleting one already on its way isn't a new send.
    view.update({ pending: [{ ...sending, status: 'failed' }] })
    view.update({ pending: [] })
    await still()
    expect(onLatest).toHaveBeenCalledOnce()
  })

  it('a jump lands on its message even when the newest message is mine', async () => {
    const data = channel(40)
    expect(data.messages.at(-1)!.senderId).toBe('u-1')
    mount({ data, focusSeq: 15 })
    await still()
    expect(topOf(15)).toBeGreaterThanOrEqual(0)
    expect(topOf(15)).toBeLessThan(120)
  })

  it('the unread bar offers Mark as unread (opening the channel marked it read, spec 6.2): it puts back the first new message', async () => {
    const onMarkUnread = vi.fn(async (_message: ChatMessage) => {})
    mount({ data: channel(80), newAfterSeq: 30, totalUnread: 50, onMarkUnread })
    await still()
    expect(screen.getByText(/50 new messages since/)).toBeTruthy()
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
    await still()
    expect(screen.getByText(/50 new messages since/)).toBeTruthy()
    expect(onMarkRead).not.toHaveBeenCalled()
    // Nothing has come in since I opened it.
    // A way back, not an action: a secondary pill, not a red one (UX Phase 3, 3.3).
    const jump = screen.getByRole('button', { name: 'Jump to latest' })
    expect(jump.className).not.toContain('bg-sf-accent-fill')
    expect(jump.className).toContain('bg-sf-surface-raised')
  })

  it('opening at the newest message marks it read', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    const onMarkRead = vi.fn()
    mount({ data: channel(40), newAfterSeq: 38, totalUnread: 2, onMarkRead })
    await still()
    expect(onMarkRead).toHaveBeenCalledWith(40)
  })

  it('while the read is held (after U), being at the end marks nothing read; once the hold ends it does', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    const onMarkRead = vi.fn()
    const view = mount({ data: channel(40), newAfterSeq: 36, totalUnread: 3, onMarkRead, holdRead: true })
    await still()
    expect(screen.getByText(/^Message 40/)).toBeTruthy()
    expect(onMarkRead).not.toHaveBeenCalled()
    view.update({ holdRead: false })
    await vi.waitFor(() => expect(onMarkRead).toHaveBeenCalledWith(40))
  })
})

describe('MessageList sticky date (spec 6.2)', () => {
  const shown = (el: Element) => {
    for (let e: Element | null = el; e; e = e.parentElement) if (getComputedStyle(e).opacity === '0' || getComputedStyle(e).visibility === 'hidden') return false
    return true
  }
  /** The date pills that can be seen in the top `band` px of the list, with their labels and boxes. */
  function topPills(band: number) {
    const box = list().getBoundingClientRect()
    return Array.from(list().parentElement!.querySelectorAll('button'))
      .filter((b) => b.className.includes('shadow-sf-toolbar') && shown(b))
      .map((b) => ({ label: b.textContent, r: b.getBoundingClientRect() }))
      .filter(({ r }) => r.bottom > box.top && r.top < box.top + band)
  }
  /** Scrolls up 6px at a time, from `from` (the end by default) to the top. */
  /** A scan one frame per 6px: in a full run frames come slower, so these tests get a longer budget (slice AA). */
  const SCAN = 60_000
  async function scrollThrough(check: (at: number) => void, from?: number) {
    const el = list()
    for (let y = from ?? el.scrollHeight; y >= 0; y -= 6) {
      el.scrollTop = y
      await frame()
      check(el.scrollTop)
    }
  }
  const overlapping = (a: DOMRect, b: DOMRect) => a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5

  it('shows each day once at the top while scrolling across days, and the next day pushes it out instead of covering it', async () => {
    // Four days of messages, every 3 hours, in one page.
    mount({ data: channel(28, 3 * 3_600_000) })
    await still()
    expect(topOf(28)).not.toBeNull()
    let pinned = 0
    await scrollThrough((at) => {
      const pills = topPills(80)
      expect(new Set(pills.map((p) => p.label)).size, `same day twice at ${at}`).toBe(pills.length)
      for (let i = 1; i < pills.length; i++) expect(overlapping(pills[0].r, pills[i].r), `pills overlap at ${at}`).toBe(false)
      if (pills.some((p) => p.r.top - list().getBoundingClientRect().top <= 10)) pinned++
    })
    // A date sits at the top through the scroll, not only now and then.
    expect(pinned).toBeGreaterThan(50)
  }, SCAN)

  it('with the unread bar open, the date sits under the bar and still shows each day once', async () => {
    mount({ data: channel(28, 3 * 3_600_000), newAfterSeq: 14, totalUnread: 14 })
    await still()
    expect(screen.getByText(/14 new messages since/)).toBeTruthy()
    // Hit-testing needs the bar on screen: earlier tests may have left the page scrolled.
    window.scrollTo(0, 0)
    let underBar = 0
    await scrollThrough((at) => {
      const pills = topPills(120)
      expect(new Set(pills.map((p) => p.label)).size, `same day twice at ${at}`).toBe(pills.length)
      for (let i = 1; i < pills.length; i++) expect(overlapping(pills[0].r, pills[i].r), `pills overlap at ${at}`).toBe(false)
      // While the bar shows (it goes once the New line is reached), no date pill covers it.
      const bar = screen.queryByText(/14 new messages since/)?.parentElement
      if (!bar) return
      const r = bar.getBoundingClientRect()
      for (let x = r.left + 4; x < Math.min(r.right, innerWidth) - 4; x += 16) {
        for (const y of [r.top + 2, r.top + r.height / 2, r.bottom - 2]) expect(bar.contains(document.elementFromPoint(x, y)), `the bar is covered at ${at}`).toBe(true)
      }
      underBar++
      // Up from where it opened (at the New line): the bar stays until the end is reached.
    }, list().scrollTop)
    expect(underBar).toBeGreaterThan(0)
  }, SCAN)
})

describe('the intro row (chat spec 6.14)', () => {
  it('an empty channel shows the intro, not "No messages here yet."', async () => {
    mount({ data: channel(0), intro: <p>Intro</p> })
    expect(await screen.findByText('Intro')).toBeTruthy()
    expect(screen.queryByText('No messages here yet.')).toBeNull()
  })

  it('the intro sits above the first day divider', async () => {
    mount({ data: channel(5), intro: <p>Intro</p> })
    await still()
    list().scrollTop = 0
    await still()
    const intro = (await screen.findByText('Intro')).getBoundingClientRect()
    const day = list().querySelector('[role="separator"], [aria-haspopup="menu"]')!.getBoundingClientRect()
    expect(intro.bottom).toBeLessThanOrEqual(day.top)
  })
})
