import { useEffect } from 'react'
import { useParams } from 'react-router'
import { useChannel, useSendMessage } from '@/api/chat'
import { useUsers } from '@/api/users'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { ApiError } from '@/lib/api'
import { channelLabel, inWorkspace, isArchived } from '@/lib/channels'
import { paths } from '@/lib/paths'
import { useRole } from '@/lib/useRole'
import { NotFound } from '@/pages/NotFound'
import { ChannelFeed } from '@/pages/chat/ChannelFeed'
import { Composer } from '@/pages/chat/Composer'
import { useCanPost, useReadOnlyLine } from '@/pages/chat/useCanPost'
import { useTaskFromMessage } from '@/pages/chat/useTaskFromMessage'
import { ArchivedChannelLine, ChannelMenu, JoinChannelLine } from '@/pages/chat/ChannelMenu'
import { useProjectSummaries } from '@/api/projects'
import { MessageSkeleton } from '@/pages/chat/MessageRow'

/** A channel or DM: its name and topic, then its messages with the newest at the bottom. Read-only in Phase 1. */
export function ChannelPage() {
  const { ws = '', channelId } = useParams()
  const { workspace } = useCurrentWorkspace()
  const { persona } = useRole()
  const channel = useChannel(channelId)
  const users = useUsers(workspace?.id)
  const canPost = useCanPost(channel.data)
  const send = useSendMessage()
  const readOnly = useReadOnlyLine(channel.data)
  const fromMessage = useTaskFromMessage(channelId, workspace?.id)
  const projects = useProjectSummaries(workspace?.id)
  // An error belongs to the channel it happened in.
  const { reset } = send
  useEffect(() => reset(), [channelId, reset])
  // A channel id from another workspace is not a channel of this one: it reads as not found, and is never marked read.
  const foreign = Boolean(channel.data && workspace && !inWorkspace(channel.data, workspace.id))

  if (foreign || (channel.error instanceof ApiError && channel.error.status === 404)) {
    return <NotFound what="channel" backTo={paths.workspace(ws)} backLabel={`Back to ${workspace?.name ?? 'the workspace'}`} />
  }
  if (channel.error instanceof ApiError && channel.error.status === 403) {
    return (
      <>
        <PageHeader title="Private channel" />
        <p className="text-sm text-fg-muted">You're not in this channel. Ask someone in it to add you.</p>
      </>
    )
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
  return (
    <>
      <PageHeader title={title} subtitle={current.topic.trim() || '—'} actions={<ChannelMenu channel={current} workspaceSlug={ws} />} />
      <ChannelFeed
        key={current.id}
        channelId={current.id}
        title={title}
        users={people}
        usersLoading={users.isLoading}
        meId={persona.id}
        canPost={canPost === true}
        messageActions={fromMessage.messageActions}
        composer={
          isArchived(current) ? (
            <ArchivedChannelLine channel={current} />
          ) : current.kind === 'channel' && !current.isPrivate && !current.memberIds.includes(persona.id) && projects.data && !projects.data.some((p) => p.channelId === current.id) ? (
            <JoinChannelLine channel={current} />
          ) : canPost === false ? (
            <p className="text-sm text-fg-muted">{readOnly}</p>
          ) : canPost ? (
            <Composer
              placeholder={`Message ${title}`}
              submitLabel="Send"
              pendingLabel="Sending…"
              error={send.error as Error | null}
              onSubmit={(content) => send.mutateAsync({ channelId: current.id, content })}
            />
          ) : null
        }
      />
      {fromMessage.sheet}
    </>
  )
}
