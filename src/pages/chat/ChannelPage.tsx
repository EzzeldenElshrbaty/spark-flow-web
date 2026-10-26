import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useChannel, useMarkRead, useMessages } from '@/api/chat'
import { useUsers } from '@/api/users'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { ApiError } from '@/lib/api'
import { channelLabel, inWorkspace } from '@/lib/channels'
import { paths } from '@/lib/paths'
import { createRealtimeClient } from '@/lib/realtime'
import { useRole } from '@/lib/useRole'
import { NotFound } from '@/pages/NotFound'
import { MessageRow, MessageSkeleton } from '@/pages/chat/MessageRow'

/** A channel or DM: its name and topic, then its messages with the newest at the bottom. Read-only in Phase 1. */
export function ChannelPage() {
  const { ws = '', channelId } = useParams()
  const { workspace } = useCurrentWorkspace()
  const { persona } = useRole()
  const channel = useChannel(channelId)
  const users = useUsers(workspace?.id)
  const messages = useMessages(channelId)
  const { mutate: markRead } = useMarkRead()
  // One live connection per visit to the page; it follows the channel on screen.
  const [realtime] = useState(createRealtimeClient)
  const endRef = useRef<HTMLDivElement>(null)
  const scrolledFor = useRef<string | null>(null)

  // A channel id from another workspace is not a channel of this one: it reads as not found, and is never marked read.
  const foreign = Boolean(channel.data && workspace && !inWorkspace(channel.data, workspace.id))
  const loadedId = foreign ? undefined : channel.data?.id
  useEffect(() => {
    if (loadedId) markRead(loadedId)
  }, [loadedId, markRead])

  useEffect(() => {
    if (!channelId) return
    realtime.joinChannel(channelId)
    return () => realtime.leaveChannel(channelId)
  }, [realtime, channelId])

  const listShown = Boolean(channel.data && !foreign && messages.data && !users.isLoading)
  useEffect(() => {
    // Open each channel at its newest message, once; loading older ones must not jump back down.
    if (!listShown || !channelId || scrolledFor.current === channelId) return
    scrolledFor.current = channelId
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [listShown, channelId])

  if (foreign || (channel.error instanceof ApiError && channel.error.status === 404)) {
    return <NotFound what="channel" backTo={paths.workspace(ws)} backLabel={`Back to ${workspace?.name ?? 'the workspace'}`} />
  }
  if (channel.isError) {
    return (
      <>
        <PageHeader title="Channel" />
        <QueryError what="Channel" onRetry={() => void channel.refetch()} />
      </>
    )
  }
  if (channel.isPending) {
    return (
      <>
        <div className="mb-6 space-y-2" aria-hidden>
          <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-muted" />
          <div className="h-4 w-72 max-w-full animate-pulse rounded bg-surface-muted" />
        </div>
        <MessageSkeleton />
      </>
    )
  }

  const people = users.data ?? []
  const current = channel.data
  const title = current.kind === 'channel' ? `#${current.name}` : channelLabel(current, people, persona.id)
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
              <MessageRow message={message} users={people} />
            </li>
          ))}
        </ol>
      </>
    )
  }

  return (
    <>
      <PageHeader title={title} subtitle={current.topic.trim() || '—'} />
      {body}
      <div ref={endRef} />
    </>
  )
}
