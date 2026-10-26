import { useEffect, useRef, useState } from 'react'
import { useMarkRead, useMessages } from '@/api/chat'
import type { User } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { QueryError } from '@/components/ui/QueryError'
import { createRealtimeClient } from '@/lib/realtime'
import { MessageRow, MessageSkeleton } from '@/pages/chat/MessageRow'

/**
 * A channel's messages, newest at the bottom, with "Load older messages". Opening it marks the channel read and keeps
 * a live connection to it. Used by the Chat page and by a project's Chat tab; the caller shows the header.
 */
export function ChannelFeed({ channelId, title, users, usersLoading }: { channelId: string; title: string; users: User[]; usersLoading: boolean }) {
  const messages = useMessages(channelId)
  const { mutate: markRead } = useMarkRead()
  // One live connection per feed on screen; it follows the channel shown.
  const [realtime] = useState(createRealtimeClient)
  const endRef = useRef<HTMLDivElement>(null)
  const scrolledFor = useRef<string | null>(null)

  useEffect(() => markRead(channelId), [channelId, markRead])

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
              <MessageRow message={message} users={users} />
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
    </>
  )
}
