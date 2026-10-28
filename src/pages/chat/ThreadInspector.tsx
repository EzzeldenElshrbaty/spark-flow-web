import { useMemo } from 'react'
import { useChannel, useMessage, useReply, useThread } from '@/api/chat'
import { useUsers } from '@/api/users'
import { QueryError } from '@/components/ui/QueryError'
import { InspectorFrame, InspectorSkeleton, TitleSkeleton, type InspectorBodyProps } from '@/layout/InspectorFrame'
import { ApiError } from '@/lib/api'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { channelLabel, inWorkspace, mustJoin, onlyAdminsLine } from '@/lib/channels'
import { useProjectSummaries } from '@/api/projects'
import { JoinChannelLine } from '@/pages/chat/ChannelActions'
import { firstLine } from '@/lib/inspector'
import { useRole } from '@/lib/useRole'
import { NotFound } from '@/pages/NotFound'
import { ThreadComposer } from '@/pages/chat/ThreadComposer'
import { bodyText } from '@/lib/messageBody'
import { ChannelMessage } from '@/pages/chat/ChannelMessage'
import { canContinue } from '@/pages/chat/messageRows'
import { useBodyContext, useProjectKeys } from '@/pages/chat/useBodyContext'
import { useCanPost, useCanWrite, useReadOnlyLine } from '@/pages/chat/useCanPost'
import { CanPostError } from '@/pages/chat/CanPostError'
import { useReplyFocus } from '@/pages/chat/useReplyFocus'
import { ThreadMenu } from '@/pages/chat/ThreadMenu'
import { paths } from '@/lib/paths'

const isNotFound = (error: Error | null) => error instanceof ApiError && error.status === 404
const isForbidden = (error: Error | null) => error instanceof ApiError && error.status === 403

/** A message, its replies and, for people who may write in the channel, a reply box. */
export function ThreadInspector({ messageId, onClose, closeTo }: { messageId: string } & InspectorBodyProps) {
  const { persona } = useRole()
  const { workspace } = useCurrentWorkspace()
  const message = useMessage(messageId)
  const channel = useChannel(message.data?.channelId)
  const users = useUsers(channel.data?.workspaceId)
  const replies = useThread(message.data ? messageId : undefined)
  const canPost = useCanPost(channel.data)
  const canWrite = useCanWrite(channel.data)
  const readOnly = useReadOnlyLine(channel.data)
  const reply = useReply()
  // As in the channel: a public channel I'm not in asks me to join before I write, here too.
  const projects = useProjectSummaries(channel.data?.workspaceId)
  const projectKeys = useProjectKeys(channel.data?.workspaceId)
  const people = useMemo(() => users.data ?? [], [users.data])
  const scope = useMemo(() => ({ users: people, projectKeys, ws: workspace?.slug ?? '', workspaceId: channel.data?.workspaceId ?? '' }), [people, projectKeys, workspace, channel.data])
  const bodies = useMemo(() => [message.data?.body ?? [], ...(replies.data ?? []).map((r) => r.body)], [message.data, replies.data])
  const ctx = useBodyContext(bodies, scope)
  // Opened with Reply in thread or T: the caret goes to the reply box.
  const replyBox = useReplyFocus()

  // A message from another workspace's channel is not found in this one.
  const foreign = Boolean(channel.data && workspace && !inWorkspace(channel.data, workspace.id))
  const where = channel.data && !foreign ? (channel.data.kind === 'channel' ? `#${channel.data.name}` : channelLabel(channel.data, users.data ?? [], persona.id)) : null
  const eyebrow = where ? `Thread · ${where}` : 'Thread'
  // The title waits for the channel too, so a message from another workspace never shows even briefly.
  const title = foreign ? 'Thread' : message.data && channel.data ? firstLine(message.data.content) || 'Thread' : message.isPending || channel.isLoading ? <TitleSkeleton /> : 'Thread'

  let body
  if (foreign || isNotFound(message.error)) body = <NotFound what="message" backTo={closeTo} backLabel="Close the thread" />
  // Taken off the channel while the thread is open: the channel answers 403 before the message is fetched again.
  else if (isForbidden(message.error) || isForbidden(channel.error)) body = <p className="text-sm text-fg-muted">You're not in this channel.</p>
  else if (message.isError) body = <QueryError what="Message" onRetry={() => void message.refetch()} />
  else if (channel.isError) body = <QueryError what="Channel" onRetry={() => void channel.refetch()} />
  // Names come with the channel's workspace; a channel that fails to load only leaves them unknown.
  else if (message.isPending || channel.isLoading || users.isLoading) body = <InspectorSkeleton />
  else {
    body = (
      <>
        <div className="-mx-3">
          <ChannelMessage message={message.data} users={people} ctx={ctx} meId={persona.id} canPost={canPost === true} continuation={false} showThread={false} compact />
        </div>
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
          <ul className="-mx-3">
            {replies.data.map((reply, i) => (
              <li key={reply.id}>
                <ChannelMessage
                  message={reply}
                  users={people}
                  ctx={ctx}
                  meId={persona.id}
                  canPost={canPost === true}
                  continuation={i > 0 && canContinue(replies.data[i - 1], reply)}
                  compact
                  alsoSentTo={where ?? undefined}
                />
              </li>
            ))}
          </ul>
        )}
        <div ref={replyBox} className="mt-4">
          {channel.data && mustJoin(channel.data, persona.id, projects.data) ? (
            <JoinChannelLine channel={channel.data} />
          ) : canPost === false ? (
            <p className="text-sm text-fg-muted">{readOnly}</p>
          ) : canPost && channel.data && !canWrite ? (
            <p className="text-sm text-fg-muted">{onlyAdminsLine(channel.data)}</p>
          ) : canPost && channel.data ? (
            <ThreadComposer
              channel={channel.data}
              rootId={messageId}
              sendTo={where ?? 'the channel'}
              error={reply.error as Error | null}
              onSend={(body, alsoInChannel) => reply.mutateAsync({ messageId, content: bodyText(body), body, alsoInChannel })}
            />
          ) : (
            <CanPostError channel={channel.data} />
          )}
        </div>
      </>
    )
  }

  // The thread's ⋮ once it's there, in a channel of this workspace: its link opens the channel with the thread.
  const actions = message.data && channel.data && workspace && !foreign && (
    <ThreadMenu
      messageId={message.data.id}
      following={Boolean(message.data.following)}
      link={new URL(`${paths.channel(workspace.slug, channel.data.id)}?thread=${encodeURIComponent(message.data.id)}`, window.location.origin).href}
    />
  )
  return (
    <InspectorFrame label="Thread" eyebrow={eyebrow} title={title} actions={actions} onClose={onClose}>
      {body}
    </InspectorFrame>
  )
}
