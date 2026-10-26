import { useChannel, useMessage, useReply, useThread } from '@/api/chat'
import { useUsers } from '@/api/users'
import { QueryError } from '@/components/ui/QueryError'
import { InspectorFrame, InspectorSkeleton, TitleSkeleton, type InspectorBodyProps } from '@/layout/InspectorFrame'
import { ApiError } from '@/lib/api'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { channelLabel, inWorkspace } from '@/lib/channels'
import { firstLine } from '@/lib/inspector'
import { useRole } from '@/lib/useRole'
import { NotFound } from '@/pages/NotFound'
import { Composer } from '@/pages/chat/Composer'
import { MessageRow } from '@/pages/chat/MessageRow'
import { readOnlyLine, useCanPost } from '@/pages/chat/useCanPost'

const isNotFound = (error: Error | null) => error instanceof ApiError && error.status === 404

/** A message, its replies and, for people who may write in the channel, a reply box. */
export function ThreadInspector({ messageId, onClose, closeTo }: { messageId: string } & InspectorBodyProps) {
  const { persona } = useRole()
  const { workspace } = useCurrentWorkspace()
  const message = useMessage(messageId)
  const channel = useChannel(message.data?.channelId)
  const users = useUsers(channel.data?.workspaceId)
  const replies = useThread(message.data ? messageId : undefined)
  const canPost = useCanPost(channel.data)
  const reply = useReply()

  // A message from another workspace's channel is not found in this one.
  const foreign = Boolean(channel.data && workspace && !inWorkspace(channel.data, workspace.id))
  const where = channel.data && !foreign ? (channel.data.kind === 'channel' ? `#${channel.data.name}` : channelLabel(channel.data, users.data ?? [], persona.id)) : null
  const eyebrow = where ? `Thread · ${where}` : 'Thread'
  // The title waits for the channel too, so a message from another workspace never shows even briefly.
  const title = foreign ? 'Thread' : message.data && channel.data ? firstLine(message.data.content) || 'Thread' : message.isPending || channel.isLoading ? <TitleSkeleton /> : 'Thread'

  let body
  if (foreign || isNotFound(message.error)) body = <NotFound what="message" backTo={closeTo} backLabel="Close the thread" />
  else if (message.isError) body = <QueryError what="Message" onRetry={() => void message.refetch()} />
  else if (channel.isError) body = <QueryError what="Channel" onRetry={() => void channel.refetch()} />
  // Names come with the channel's workspace; a channel that fails to load only leaves them unknown.
  else if (message.isPending || channel.isLoading || users.isLoading) body = <InspectorSkeleton />
  else {
    const people = users.data ?? []
    body = (
      <>
        <MessageRow message={message.data} users={people} showThread={false} />
        <div className="my-3 flex items-center gap-3 text-xs text-fg-muted">
          <span className="tabular-nums">
            {message.data.threadCount} {message.data.threadCount === 1 ? 'reply' : 'replies'}
          </span>
          <span className="h-px flex-1 bg-line-subtle" />
        </div>
        {replies.isError ? (
          <QueryError what="Replies" onRetry={() => void replies.refetch()} />
        ) : replies.isPending ? (
          <InspectorSkeleton rows={3} />
        ) : replies.data.length === 0 ? (
          <p className="text-sm text-fg-muted">No replies yet.</p>
        ) : (
          <ul className="space-y-1">
            {replies.data.map((reply) => (
              <li key={reply.id}>
                <MessageRow message={reply} users={people} />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          {canPost === false ? (
            <p className="text-sm text-fg-muted">{readOnlyLine}</p>
          ) : canPost ? (
            <Composer quiet placeholder="Reply in the thread" submitLabel="Reply" pendingLabel="Replying…" error={reply.error as Error | null} onSubmit={(content) => reply.mutateAsync({ messageId, content })} />
          ) : null}
        </div>
      </>
    )
  }

  return (
    <InspectorFrame label="Thread" eyebrow={eyebrow} title={title} onClose={onClose}>
      {body}
    </InspectorFrame>
  )
}
