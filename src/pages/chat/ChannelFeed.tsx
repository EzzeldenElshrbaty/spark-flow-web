import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useMarkRead, useMessages } from '@/api/chat'
import type { ChatMessage, User } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { QueryError } from '@/components/ui/QueryError'
import { useRealtime } from '@/lib/realtime'
import { shouldMarkRead } from '@/pages/chat/markRead'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { ChannelMessage } from '@/pages/chat/ChannelMessage'
import { DayDivider } from '@/pages/chat/MessageList'
import { buildRows } from '@/pages/chat/messageRows'
import { MessageSkeleton } from '@/pages/chat/MessageSkeleton'
import { useBodyContext, useProjectKeys } from '@/pages/chat/useBodyContext'

/**
 * A channel's messages, newest at the bottom, with "Load older messages": the project Chat tab's list, which scrolls
 * with its page (the channel page has its own, MessageList). The same message rows, day dividers and grouping.
 * Opening it marks the channel read and keeps a live connection to it; the caller shows the header.
 */
export function ChannelFeed({
  channelId,
  title,
  users,
  usersLoading,
  composer,
  meId,
  canPost = false,
  messageActions,
}: {
  channelId: string
  title: string
  users: User[]
  usersLoading: boolean
  composer?: ReactNode
  meId?: string
  /** Whether I can write here: reactions, edits and deletes need it too. */
  canPost?: boolean
  /** More items for a message's ⋯ menu (a project's channel adds Create task). */
  messageActions?: (message: ChatMessage, close: () => void) => ReactNode
}) {
  const messages = useMessages(channelId)
  const { mutate: markRead } = useMarkRead()
  // One live connection per feed on screen; it follows the channel shown.
  const realtime = useRealtime()
  const endRef = useRef<HTMLDivElement>(null)
  const scrolledFor = useRef<string | null>(null)

  useEffect(() => {
    realtime.joinChannel(channelId)
    return () => realtime.leaveChannel(channelId)
  }, [realtime, channelId])

  const listShown = Boolean(messages.data && !usersLoading)
  useEffect(() => {
    // Open each channel at its newest message, once; loading older ones must not jump back down.
    if (!listShown || scrolledFor.current === channelId) return
    scrolledFor.current = channelId
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [listShown, channelId])

  const items = useMemo(() => messages.data?.pages.flatMap((page) => page.items).reverse() ?? [], [messages.data])
  const rows = useMemo(() => buildRows(items, { newAfterSeq: null, meId, now: new Date() }), [items, meId])
  const { workspace } = useCurrentWorkspace()
  const projectKeys = useProjectKeys(workspace?.id)
  const scope = useMemo(() => ({ users, projectKeys, ws: workspace?.slug ?? '', workspaceId: workspace?.id ?? '' }), [users, projectKeys, workspace])
  const ctx = useBodyContext(useMemo(() => items.map((m) => m.body), [items]), scope)
  // After I post, follow my message down; someone else's message never pulls the view.
  const newest = items.at(-1)
  const newestMine = newest && newest.senderId === meId ? newest.id : null
  useEffect(() => {
    if (newestMine) endRef.current?.scrollIntoView({ block: 'end' })
  }, [newestMine])

  // The channel on screen stays read: opening it, or a new message, marks it read once its newest message is shown in
  // a tab in view, and coming back to the tab does too. A channel opened or left open in a background tab keeps its badge.
  const newestId = newest?.id ?? null
  // Read up to the newest message on screen, not the channel's end: one that arrives meanwhile stays unread.
  const newestSeq = newest?.seq
  const seen = useRef<string | null>(null)
  useEffect(() => {
    if (shouldMarkRead(seen.current, newestId, document.visibilityState === 'visible', !messages.isFetching)) {
      seen.current = newestId
      markRead({ channelId, seq: newestSeq })
    }
  }, [newestId, newestSeq, channelId, markRead, messages.isFetching])
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      seen.current = newestId
      markRead({ channelId, seq: newestSeq })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [newestId, newestSeq, channelId, markRead])

  let body
  if (messages.isError && !messages.data) body = <QueryError what="Messages" onRetry={() => void messages.refetch()} />
  else if (!listShown) body = <MessageSkeleton />
  else if (items.length === 0) body = <p className="text-sm text-fg-muted">No messages here yet.</p>
  else {
    body = (
      <>
        {messages.hasNextPage && (
          <div className="mb-3 flex justify-center">
            <Button variant="secondary" onClick={() => void messages.fetchNextPage()} disabled={messages.isFetchingNextPage}>
              {messages.isFetchingNextPage ? 'Loading older messages…' : 'Load older messages'}
            </Button>
          </div>
        )}
        {messages.isFetchNextPageError && (
          <div className="mb-3">
            <QueryError what="Older messages" onRetry={() => void messages.fetchNextPage()} />
          </div>
        )}
        <ol className="-mx-4 md:-mx-6" aria-label={`Messages in ${title}`}>
          {rows.map((row) => (
            <li key={row.key}>
              {row.kind === 'day' ? (
                <DayDivider label={row.label} />
              ) : row.kind === 'message' ? (
                <ChannelMessage
                  message={row.message}
                  users={users}
                  ctx={ctx}
                  meId={meId}
                  canPost={canPost}
                  continuation={row.continuation}
                  actions={messageActions && ((close) => messageActions(row.message, close))}
                />
              ) : null}
            </li>
          ))}
        </ol>
      </>
    )
  }

  return (
    <>
      {body}
      <div ref={endRef} />
      {composer && <div className="sticky bottom-[calc(3.5rem+var(--timer-bar,0px)+env(safe-area-inset-bottom))] z-10 -mx-1 mt-4 bg-canvas px-1 pb-2 pt-2 lg:bottom-0">{composer}</div>}
    </>
  )
}
