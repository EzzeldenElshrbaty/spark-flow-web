import { IconArrowDown, IconChevronDown } from '@tabler/icons-react'
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ChatMessage, Page, User } from '@/api/types'
import type { PendingMessage } from '@/lib/sendQueue'
import { Icon } from '@/components/sf/Icon'
import { Menu, MenuItem } from '@/components/sf/Menu'
import { QueryError } from '@/components/ui/QueryError'
import { formatTime } from '@/lib/format'
import { readUpTo } from '@/pages/chat/markRead'
import { buildRows, unreadSummary, type JumpChoice, type MessageListRow } from '@/pages/chat/messageRows'
import { parseInspector } from '@/lib/inspector'
import { ChannelMessage, type Selection } from '@/pages/chat/ChannelMessage'
import { useEditing } from '@/pages/chat/editingStore'
import { useBodyContext, type BodyScope } from '@/pages/chat/useBodyContext'
import { MessageSkeleton } from '@/pages/chat/MessageSkeleton'
import { useSearchParams } from 'react-router'

/** How close to the end still counts as "at the newest message". */
const BOTTOM_SLACK = 32
/** Pages loaded on open to reach my first unread message (30 each); past that the list opens without the New line. */
const CATCH_UP_PAGES = 10
/** Room above the New line for the unread bar when the list opens there. */
const BAR_ROOM = 48
/** How long a message a jump landed on stays selected before it fades (spec 6.3). */
const SELECTED_MS = 2000

const pendingId = (clientId: string) => `pending:${clientId}`

/** A pending message as a row of the list: mine, newest, with nothing on it yet. */
const asMessage = (p: PendingMessage, meId: string | undefined): ChatMessage => ({
  id: pendingId(p.clientId), channelId: p.channelId, seq: Number.MAX_SAFE_INTEGER, clientId: p.clientId, senderId: meId ?? '', content: p.content, body: p.body,
  attachments: [], reactions: [], threadCount: 0, lastReplyAt: null, linkedTicketKeys: [], mentions: [], editedAt: null, createdAt: p.createdAt,
})

const estimate = (row: MessageListRow) => (row.kind === 'day' ? 40 : row.kind === 'new' ? 24 : row.continuation ? 24 : 72)

type MessagesQuery = UseInfiniteQueryResult<InfiniteData<Page<ChatMessage>, unknown>>

/**
 * A channel's messages (spec 6.2): virtualized, opened at the newest message (or at the New line when more than a
 * screen is unread), older pages load as the top comes near and the view stays put. Day sections with a sticky
 * date whose menu jumps through the channel, the New line, the unread bar and Jump to latest. After a jump the list
 * starts at that message and loads newer pages as the end comes near. Marks read once the newest message is on
 * screen in a focused window.
 */
export function MessageList({
  query,
  title,
  users,
  meId,
  canPost,
  messageActions,
  newAfterSeq,
  totalUnread,
  markedSeq,
  onMarkRead,
  focusSeq = null,
  focusNonce = 0,
  openAtEnd = false,
  onJump,
  onLatest,
  scope,
  pending = [],
  onRetry,
  onDiscard,
}: {
  query: MessagesQuery
  title: string
  users: User[]
  meId?: string
  canPost: boolean
  messageActions?: (message: ChatMessage, close: () => void) => ReactNode
  /** My read marker when the channel opened: where the New line goes, and it stays there until I leave. */
  newAfterSeq: number | null
  /** How many messages were unread when the channel opened (the unread bar's count). */
  totalUnread: number
  /** My read marker now. */
  markedSeq: number
  onMarkRead: (seq?: number) => void
  /** A message to bring to the top (a jump); a new nonce brings it there again. */
  focusSeq?: number | null
  focusNonce?: number
  /** Open at the newest message even when the New line is further up (coming back from a jump). */
  openAtEnd?: boolean
  onJump: (choice: JumpChoice) => void
  /** Leave a jump for the live end of the channel. */
  onLatest: () => void
  /** Projects I can see and the workspace: what bodies need besides `users`. */
  scope: Omit<BodyScope, 'users'>
  /** My messages on their way (spec 6.2), shown after the newest as "Sending…" or "Not sent". */
  pending?: PendingMessage[]
  onRetry?: (clientId: string) => void
  onDiscard?: (clientId: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const messages = useMemo(() => query.data?.pages.flatMap((page) => page.items).reverse() ?? [], [query.data])
  const hasOlder = Boolean(query.hasNextPage)
  // After a jump, newer messages may still be unloaded below: the end of the list isn't the newest yet.
  const hasNewer = Boolean(query.hasPreviousPage)
  // Pending messages follow the newest; one the server has confirmed is already in the list and drops out here.
  const shownPending = useMemo(() => {
    if (hasNewer) return []
    const arrived = new Set(messages.map((m) => m.clientId).filter(Boolean))
    return pending.filter((p) => !arrived.has(p.clientId))
  }, [pending, messages, hasNewer])
  const pendingById = useMemo(() => new Map(shownPending.map((p) => [pendingId(p.clientId), p])), [shownPending])
  const rows = useMemo(
    () => buildRows([...messages, ...shownPending.map((p) => asMessage(p, meId))], { newAfterSeq, meId, hasOlder, now: new Date() }),
    [messages, shownPending, newAfterSeq, meId, hasOlder],
  )
  // On open, older pages load until my first unread message is among them (a few at most), so the list can open there.
  const catchingUp =
    totalUnread > 0 && newAfterSeq !== null && hasOlder && messages.length > 0 && messages[0].seq > newAfterSeq && (query.data?.pages.length ?? 0) < CATCH_UP_PAGES
  useEffect(() => {
    if (catchingUp && !query.isFetchingNextPage && !query.isFetchNextPageError) void query.fetchNextPage()
  }, [catchingUp, query])
  // Every task the loaded messages name, looked up in one go (live: a status change refreshes it).
  const bodyScope = useMemo(() => ({ ...scope, users }), [scope, users])
  const ctx = useBodyContext(useMemo(() => messages.map((m) => m.body), [messages]), bodyScope)

  // Selected (spec 6.3): the message whose thread is open, or the one a jump landed on, which fades after 2s.
  const [params] = useSearchParams()
  const inspector = parseInspector(params)
  const threadOpen = inspector?.kind === 'thread' ? inspector.messageId : null
  const [jumped, setJumped] = useState<{ seq: number; phase: 'on' | 'fading' } | null>(null)
  useEffect(() => {
    if (jumped?.phase !== 'on') return
    const timer = setTimeout(() => setJumped((j) => j && { ...j, phase: 'fading' }), SELECTED_MS)
    return () => clearTimeout(timer)
  }, [jumped])
  const selectionOf = (m: ChatMessage): Selection => (m.id === threadOpen ? 'on' : jumped && m.seq === jumped.seq ? jumped.phase : null)

  // The day each row belongs to, for the sticky date.
  const dayOf = useMemo(() => {
    let label = ''
    return rows.map((row) => (row.kind === 'day' ? (label = row.label) : label))
  }, [rows])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => estimate(rows[i]),
    getItemKey: (i) => rows[i].key,
    overscan: 10,
    paddingStart: 8,
    paddingEnd: 8,
    // Chat behaviour (virtual-core 3.19): older rows added above keep the view where it is, and new rows at the
    // end are followed while I'm at the end.
    anchorTo: 'end',
    followOnAppend: !hasNewer,
    scrollEndThreshold: BOTTOM_SLACK,
    // Scrolling to the New line leaves room above it for the unread bar.
    scrollPaddingStart: BAR_ROOM,
  })

  // Not at the end until the list has opened there: opening at the New line must not count as reading it all.
  const [atBottom, setAtBottom] = useState(false)
  const atBottomRef = useRef(false)
  const [far, setFar] = useState(false)
  const [bar, setBar] = useState(false)
  const newest = messages.at(-1)
  // The newest message I have seen at the bottom: Jump to latest counts what came after it.
  const seenSeq = useRef(0)
  useEffect(() => {
    if (atBottom && newest) seenSeq.current = newest.seq
  }, [atBottom, newest])

  const newIndex = rows.findIndex((r) => r.kind === 'new')
  // Row places are read through getOffsetForIndex: it counts the sizes measured since the last render.
  const startOf = (index: number) => (index < 0 ? undefined : virtualizer.getOffsetForIndex(index, 'start')?.[0])
  const scrollToNewLine = () => {
    if (newIndex >= 0) virtualizer.scrollToIndex(newIndex, { align: 'start' })
  }
  // scrollToIndex keeps correcting until the rows on the way are measured; a plain scrollTop would stop short.
  const scrollToBottom = () => {
    if (rows.length > 0) virtualizer.scrollToIndex(rows.length - 1, { align: 'end' })
  }
  const openAtBottom = () => {
    atBottomRef.current = true
    setAtBottom(true)
    scrollToBottom()
  }


  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    atBottomRef.current = distance < BOTTOM_SLACK
    setAtBottom(atBottomRef.current)
    setFar(distance > el.clientHeight)
    if (atBottomRef.current) setBar(false)
    if (el.scrollTop < el.clientHeight && query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) void query.fetchNextPage()
    if (distance < el.clientHeight && hasNewer && !query.isFetchingPreviousPage && !query.isFetchPreviousPageError) void query.fetchPreviousPage()
  }

  const focusIndex = focusSeq === null ? -1 : rows.findIndex((r) => r.kind === 'message' && r.message.seq >= focusSeq)
  const scrollToFocus = () => {
    if (focusIndex < 0) return false
    virtualizer.scrollToIndex(focusIndex, { align: 'start' })
    const row = rows[focusIndex]
    if (row.kind === 'message') setJumped({ seq: row.message.seq, phase: 'on' })
    atBottomRef.current = false
    setAtBottom(false)
    setBar(false)
    return true
  }

  // Sending while a jump is open goes back to the live end, where the message shows (spec 6.2). Only a new send:
  // retrying or deleting one already on its way isn't.
  const pendingSeen = useRef(new Set(pending.map((p) => p.clientId)))
  useEffect(() => {
    const fresh = pending.filter((p) => !pendingSeen.current.has(p.clientId))
    for (const p of fresh) pendingSeen.current.add(p.clientId)
    if (fresh.length > 0 && hasNewer) onLatest()
  }, [pending, hasNewer, onLatest])

  // My newest message (on its way, or in), and the last one of mine the view has already been to.
  const newestMine = shownPending.at(-1)?.clientId ?? (newest && newest.senderId === meId ? newest.id : null)
  const mineSeen = useRef<string | null>(null)

  // Open once, when the first page is there: at the newest message, or at the New line with the unread bar when
  // the unread messages don't fit on one screen.
  const positioned = useRef(false)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (positioned.current || !el || rows.length === 0 || catchingUp) return
    positioned.current = true
    // Jump to latest counts what comes in after this (the unread bar counts what was there).
    seenSeq.current = newest?.seq ?? 0
    mineSeen.current = newestMine
    if (scrollToFocus()) return
    if (openAtEnd) return openAtBottom()
    const start = startOf(newIndex)
    // From the New line down is more than a screen: open there, with the bar. Otherwise open at the newest.
    if (start !== undefined && virtualizer.getTotalSize() - start > el.clientHeight) {
      scrollToNewLine()
      setBar(true)
    } else {
      openAtBottom()
    }
  })


  // A jump to a message that is already loaded scrolls to it.
  const focusedFor = useRef(focusNonce)
  useEffect(() => {
    if (!positioned.current || focusedFor.current === focusNonce) return
    focusedFor.current = focusNonce
    scrollToFocus()
  })

  // The message I start editing (Up in an empty box) comes into view.
  const editingId = useEditing((s) => s.id)
  useEffect(() => {
    const i = editingId ? rows.findIndex((r) => r.kind === 'message' && r.message.id === editingId) : -1
    if (i >= 0) virtualizer.scrollToIndex(i, { align: 'auto' })
    // Only a new edit moves the view.
  }, [editingId])

  // A new message at the end keeps me at the end when I was there (with followOnAppend as the first line of it).
  const lastKey = rows.at(-1)?.key
  useLayoutEffect(() => {
    // Only a new last row moves the view, so lastKey is the one dependency.
    if (positioned.current && atBottomRef.current && !hasNewer) scrollToBottom()
  }, [lastKey])

  // My own new message always brings me down to it. Mine that was already there on open isn't new: the open (at a
  // jump's message, say) decides where the view starts.
  useEffect(() => {
    if (!newestMine || !positioned.current || newestMine === mineSeen.current) return
    mineSeen.current = newestMine
    atBottomRef.current = true
    setAtBottom(true)
    scrollToBottom()
  }, [newestMine])

  // Mark read once the newest message is on screen in a focused, visible window (spec 6.2).
  const [, setFocusTick] = useState(0)
  useEffect(() => {
    const bump = () => setFocusTick((t) => t + 1)
    window.addEventListener('focus', bump)
    document.addEventListener('visibilitychange', bump)
    return () => {
      window.removeEventListener('focus', bump)
      document.removeEventListener('visibilitychange', bump)
    }
  }, [])
  const sent = useRef(markedSeq)
  const upTo = readUpTo({
    atBottom: atBottom && !hasNewer,
    visible: document.visibilityState === 'visible',
    focused: document.hasFocus(),
    settled: !query.isFetching,
    newestSeq: newest?.seq ?? null,
    markedSeq: Math.max(markedSeq, sent.current),
  })
  useEffect(() => {
    if (upTo === null) return
    sent.current = upTo
    onMarkRead(upTo)
  }, [upTo, onMarkRead])

  // Someone else's new message is read out once; scrolling past rows is not (the log itself is silent). Announcing
  // starts from the newest message once the list is live: what was there on open, and the pages loaded on the way
  // back from a jump, aren't news.
  const [announce, setAnnounce] = useState('')
  const lastAnnounced = useRef<number | null>(null)
  const wasJumping = useRef(hasNewer)
  useEffect(() => {
    const jumping = hasNewer || wasJumping.current
    wasJumping.current = hasNewer
    if (!newest) return
    if (lastAnnounced.current === null || jumping) {
      lastAnnounced.current = newest.seq
      return
    }
    if (newest.seq <= lastAnnounced.current) return
    lastAnnounced.current = newest.seq
    if (newest.senderId !== meId) setAnnounce(`${users.find((u) => u.id === newest.senderId)?.name ?? 'Someone'}: ${newest.content.slice(0, 140)}`)
  }, [newest, hasNewer, meId, users])

  if (query.isError && !query.data) return <div className="px-4 pt-4 md:px-6"><QueryError what="Messages" onRetry={() => void query.refetch()} /></div>
  if (!query.data || (catchingUp && !positioned.current)) return <div className="min-h-0 flex-1 px-4 pt-4 md:px-6"><MessageSkeleton /></div>
  if (messages.length === 0) return <p className="min-h-0 flex-1 px-4 pt-4 text-sm text-fg-muted md:px-6">No messages here yet.</p>

  const items = virtualizer.getVirtualItems()
  const scrollTop = virtualizer.scrollOffset ?? 0
  const top = items.find((v) => v.end > scrollTop + 8)
  // The sticky date hides while a day's own divider is at the top, so the two never show at once.
  const dividerAtTop = items.some((v) => rows[v.index].kind === 'day' && v.start >= scrollTop - 8 && v.start < scrollTop + 40)
  const stickyDay = top && !dividerAtTop ? dayOf[top.index] : null
  const summary = unreadSummary(messages, newAfterSeq, meId)
  const unread = { count: Math.max(summary.count, totalUnread), since: summary.since }
  // After a jump the newest messages aren't loaded, so there is no count to give.
  const newer = hasNewer ? 0 : messages.filter((m) => m.seq > seenSeq.current && m.senderId !== meId).length

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={onScroll} role="log" aria-live="off" aria-label={`Messages in ${title}`} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto outline-none [overflow-anchor:none]">
        <ol className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {items.map((v) => {
            const row = rows[v.index]
            return (
              <li key={v.key} data-index={v.index} ref={virtualizer.measureElement} className="absolute inset-x-0 top-0" style={{ transform: `translateY(${v.start}px)` }}>
                {row.kind === 'day' ? (
                  <DayDivider label={row.label} onJump={onJump} />
                ) : row.kind === 'new' ? (
                  <NewLine />
                ) : (
                  <ChannelMessage
                    message={row.message}
                    users={users}
                    ctx={ctx}
                    meId={meId}
                    canPost={canPost}
                    continuation={row.continuation}
                    selected={selectionOf(row.message)}
                    actions={messageActions && ((close) => messageActions(row.message, close))}
                    sendState={pendingById.get(row.message.id)?.status === 'failed' ? 'failed' : pendingById.has(row.message.id) ? 'sending' : undefined}
                    sendError={pendingById.get(row.message.id)?.error}
                    onRetry={() => onRetry?.(pendingById.get(row.message.id)!.clientId)}
                    onDiscard={() => onDiscard?.(pendingById.get(row.message.id)!.clientId)}
                  />
                )}
              </li>
            )
          })}
        </ol>
      </div>

      {bar && unread.count > 0 && unread.since && (
        <div className="sf absolute inset-x-4 top-2 z-[var(--z-sticky)] flex h-8 items-center gap-2 rounded-sf-md bg-sf-accent-fill ps-3 pe-2 font-sf text-[13px]/[18px] font-medium text-sf-on-accent">
          <button type="button" className="sf-focus min-w-0 truncate text-start" onClick={scrollToNewLine}>
            {unread.count} new {unread.count === 1 ? 'message' : 'messages'} since {formatTime(unread.since)}
          </button>
          <button
            type="button"
            className="sf-focus ms-auto flex-none underline"
            onClick={() => {
              setBar(false)
              sent.current = newest?.seq ?? sent.current
              onMarkRead()
            }}
          >
            Mark as read
          </button>
        </div>
      )}
      {stickyDay && (
        // A copy of the day's divider for the pointer; keyboard and screen reader users have the divider itself.
        <div aria-hidden className={`sf pointer-events-none absolute inset-x-0 z-[var(--z-sticky)] flex justify-center ${bar ? 'top-12' : 'top-2'}`}>
          <span className="pointer-events-auto">
            <DayMenu label={stickyDay} onJump={onJump} focusable={false} />
          </span>
        </div>
      )}
      {query.isFetchingNextPage && (
        <p className="sf sf-meta absolute inset-x-0 top-2 text-center text-sf-text-muted">Loading older messages…</p>
      )}
      {query.isFetchingPreviousPage && (
        <p className="sf sf-meta absolute inset-x-0 bottom-14 text-center text-sf-text-muted">Loading newer messages…</p>
      )}
      {query.isFetchPreviousPageError && (
        <div className="absolute inset-x-4 bottom-14">
          <QueryError what="Newer messages" onRetry={() => void query.fetchPreviousPage()} />
        </div>
      )}
      {query.isFetchNextPageError && (
        <div className="absolute inset-x-4 top-2">
          <QueryError what="Older messages" onRetry={() => void query.fetchNextPage()} />
        </div>
      )}
      {(far || hasNewer) && (
        <div className="sf absolute inset-x-0 bottom-3 z-[var(--z-sticky)] flex justify-center">
          <button
            type="button"
            onClick={() => {
              if (hasNewer) return onLatest()
              atBottomRef.current = true
              scrollToBottom()
            }}
            className="sf-focus inline-flex h-8 items-center gap-2 rounded-sf-full bg-sf-accent-fill px-4 font-sf text-[13px]/[18px] font-medium text-sf-on-accent shadow-sf-menu hover:bg-sf-accent-fill-hover"
          >
            <Icon icon={IconArrowDown} size={16} />
            {newer > 0 ? `Jump to latest · ${newer} new` : 'Jump to latest'}
          </button>
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </div>
  )
}

const JUMPS: { choice: JumpChoice; label: string }[] = [
  { choice: 'today', label: 'Today' },
  { choice: 'yesterday', label: 'Yesterday' },
  { choice: 'week', label: 'Last week' },
  { choice: 'month', label: 'Last month' },
  { choice: 'beginning', label: 'The very beginning' },
]

/** The date pill (spec 6.2): it opens a menu that jumps through the channel. Jump to a specific date comes later. */
function DayMenu({ label, onJump, focusable = true }: { label: string; onJump: (choice: JumpChoice) => void; focusable?: boolean }) {
  return (
    <Menu
      label="Jump to"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          tabIndex={focusable ? undefined : -1}
          className={`sf-focus ${pillClass} pe-2`}
        >
          {label}
          <Icon icon={IconChevronDown} size={16} className="text-sf-text-secondary" />
        </button>
      )}
    >
      {JUMPS.map((j) => (
        <MenuItem key={j.choice} onSelect={() => onJump(j.choice)}>
          {j.label}
        </MenuItem>
      ))}
    </Menu>
  )
}

const pillClass = 'inline-flex h-7 items-center gap-1 rounded-sf-full bg-sf-surface-raised ps-3 font-sf text-[13px]/[18px] font-medium text-sf-text shadow-sf-toolbar'

/** A day's start: a rule across the list with the date on it, which jumps through the channel when `onJump` is given. */
export function DayDivider({ label, onJump }: { label: string; onJump?: (choice: JumpChoice) => void }) {
  return (
    <div className="sf relative flex h-10 items-center justify-center">
      <span aria-hidden className="absolute inset-x-0 top-5 h-px bg-sf-line" />
      <span className="relative">
        {onJump ? (
          <DayMenu label={label} onJump={onJump} />
        ) : (
          <span role="separator" aria-label={label} className={`${pillClass} pe-3`}>
            {label}
          </span>
        )}
      </span>
    </div>
  )
}

/** Where my unread messages start (spec 6.2): a 1px accent rule with "New". */
function NewLine() {
  return (
    <div className="sf flex h-6 items-center gap-2 px-4 font-sf text-[12px]/[16px] font-semibold text-sf-accent" role="separator" aria-label="New messages">
      <span aria-hidden className="h-px flex-1 bg-sf-accent-fill" />
      <span aria-hidden>New</span>
    </div>
  )
}
