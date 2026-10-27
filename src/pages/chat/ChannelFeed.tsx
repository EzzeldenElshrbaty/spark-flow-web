import { useEffect, useRef, type ReactNode } from 'react'
import { useMarkRead, useMessages } from '@/api/chat'
import type { ChatMessage, User } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { QueryError } from '@/components/ui/QueryError'
import { useRealtime } from '@/lib/realtime'
import { shouldMarkRead } from '@/pages/chat/markRead'
import { MessageRow, MessageSkeleton } from '@/pages/chat/MessageRow'

/**
 * A channel's messages, newest at the bottom, with "Load older messages". Opening it marks the channel read and keeps
 * a live connection to it. Used by the Chat page and by a project's Chat tab; the caller shows the header.
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
  pane = false,
}: {
  channelId: string
  title: string
  users: User[]
  usersLoading: boolean
  composer?: ReactNode
  meId?: string
  /** Fill the parent (a flex column) and scroll the list inside it, instead of scrolling with the page. */
  pane?: boolean
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

  const items = messages.data?.pages.flatMap((page) => page.items).reverse() ?? []
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
        <ol className="-mx-2 space-y-1" aria-label={`Messages in ${title}`}>
          {items.map((message) => (
            <li key={message.id}>
              <MessageRow message={message} users={users} meId={meId} canPost={canPost} actions={messageActions && ((close) => messageActions(message, close))} />
            </li>
          ))}
        </ol>
      </>
    )
  }

  // In a pane (the channel page) the list scrolls on its own between the header and the composer; on a page (a
  // project's Chat tab) it scrolls with the page and the composer sticks to the bottom.
  if (pane) {
    return (
      <>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 md:px-6">
          {body}
          <div ref={endRef} />
        </div>
        {composer && <div className="flex-none px-4 pt-2 pb-3 md:px-6">{composer}</div>}
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
