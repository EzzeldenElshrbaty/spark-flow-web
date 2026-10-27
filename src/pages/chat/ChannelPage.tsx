import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useChannel, useLeaveChannel, useMarkRead, useMessages, useSendMessage, useSetMuted, useSetStarred } from '@/api/chat'
import { useUsers } from '@/api/users'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { ApiError } from '@/lib/api'
import { channelLabel, inWorkspace, isArchived } from '@/lib/channels'
import { paths } from '@/lib/paths'
import { useRole } from '@/lib/useRole'
import { useRealtime } from '@/lib/realtime'
import { NotFound } from '@/pages/NotFound'
import { MessageList } from '@/pages/chat/MessageList'
import { CanPostError } from '@/pages/chat/CanPostError'
import { TypingLine } from '@/pages/chat/ChannelTyping'
import { Composer } from '@/pages/chat/Composer'
import { useCanPost, useReadOnlyLine } from '@/pages/chat/useCanPost'
import { useTaskFromMessage } from '@/pages/chat/useTaskFromMessage'
import { ArchiveChannelModal, ArchivedChannelLine, JoinChannelLine, useChannelRights } from '@/pages/chat/ChannelActions'
import { ChannelHeader } from '@/pages/chat/ChannelHeader'
import { ChannelSheet } from '@/pages/chat/ChannelSheet'
import { ChannelTabs, TabStub, tabFromParam, type ChannelTab } from '@/pages/chat/ChannelTabs'
import type { Channel, ChatMessage, User } from '@/api/types'
import { useProjectSummaries } from '@/api/projects'
import { MessageSkeleton } from '@/pages/chat/MessageRow'

/** A channel or DM: its header and tabs over its messages, newest at the bottom, filling the main card (spec 5.3, 6.1). */
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
  const realtime = useRealtime()
  const panelId = useId()
  const [params, setParams] = useSearchParams()
  const tab = channel.data ? tabFromParam(params.get('tab'), channel.data) : 'messages'
  const setTab = (next: ChannelTab) => setParams(next === 'messages' ? {} : { tab: next }, { replace: true })
  // An error belongs to the channel it happened in.
  const { reset } = send
  useEffect(() => reset(), [channelId, reset])
  // A channel id from another workspace is not a channel of this one: it reads as not found, and is never marked read.
  const foreign = Boolean(channel.data && workspace && !inWorkspace(channel.data, workspace.id))

  if (foreign || (channel.error instanceof ApiError && channel.error.status === 404)) {
    return (
      <Padded>
        <NotFound what="channel" backTo={paths.workspace(ws)} backLabel={`Back to ${workspace?.name ?? 'the workspace'}`} />
      </Padded>
    )
  }
  if (channel.error instanceof ApiError && channel.error.status === 403) {
    return (
      <Padded>
        <PageHeader title="Private channel" />
        <p className="text-sm text-fg-muted">You're not in this channel. Ask someone in it to add you.</p>
      </Padded>
    )
  }
  if (channel.isError) {
    return (
      <Padded>
        <PageHeader title="Channel" />
        <QueryError what="Channel" onRetry={() => void channel.refetch()} />
      </Padded>
    )
  }
  if (channel.isPending) {
    return (
      <Padded>
        <div className="mb-6 space-y-2" aria-hidden>
          <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-muted" />
          <div className="h-4 w-72 max-w-full animate-pulse rounded bg-surface-muted" />
        </div>
        <MessageSkeleton />
      </Padded>
    )
  }

  const people = users.data ?? []
  const current = channel.data
  const title = current.kind === 'channel' ? `#${current.name}` : channelLabel(current, people, persona.id)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChannelTop channel={current} people={people} workspaceSlug={ws} tab={tab} onTab={setTab} panelId={panelId} />
      <div id={panelId} role="tabpanel" aria-label={tab === 'messages' ? 'Messages' : tab} className="flex min-h-0 flex-1 flex-col">
      {tab !== 'messages' ? (
        <div className="sf">
          <TabStub tab={tab} />
        </div>
      ) : (
      <PaneFeed
        key={current.id}
        channel={current}
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
            <>
            <TypingLine channelId={current.id} people={people} meId={persona.id} />
            <Composer
              placeholder={`Message ${title}`}
              onTyping={() => realtime.sendTyping(current.id, persona.id)}
              submitLabel="Send"
              pendingLabel="Sending…"
              error={send.error as Error | null}
              onSubmit={(content) => send.mutateAsync({ channelId: current.id, content })}
            />
            </>
          ) : (
            <CanPostError channel={current} />
          )
        }
      />
      )}
      </div>
      {fromMessage.sheet}
    </div>
  )
}

/** The page column's padding, for the states shown instead of a channel. */
function Padded({ children }: { children: ReactNode }) {
  return <div className="px-4 pt-6 md:px-6 xl:px-8">{children}</div>
}

/** The header and tabs, with what they open: Edit details, Archive, and errors from their actions near them. */
function ChannelTop({ channel, people, workspaceSlug, tab, onTab, panelId }: { channel: Channel; people: User[]; workspaceSlug: string; tab: ChannelTab; onTab: (tab: ChannelTab) => void; panelId: string }) {
  const { persona } = useRole()
  const rights = useChannelRights(channel)
  const star = useSetStarred()
  const mute = useSetMuted()
  const markRead = useMarkRead()
  const leave = useLeaveChannel()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const error = (star.error ?? mute.error ?? markRead.error ?? leave.error) as Error | null
  const members = channel.memberIds.map((id) => ({ id, name: people.find((u) => u.id === id)?.name ?? 'Unknown person' }))
  return (
    <div className="sf flex-none bg-sf-surface">
      <ChannelHeader
        channel={channel}
        title={channel.kind === 'channel' ? (channel.name ?? '') : channelLabel(channel, people, persona.id)}
        members={members}
        rights={rights}
        onEdit={() => setEditing(true)}
        onStar={(starred) => star.mutate({ id: channel.id, starred })}
        onMute={(muted) => mute.mutate({ id: channel.id, muted })}
        onMarkRead={() => markRead.mutate({ channelId: channel.id })}
        onCopyLink={() => navigator.clipboard.writeText(new URL(paths.channel(workspaceSlug, channel.id), window.location.origin).href)}
        onLeave={() => leave.mutate(channel.id, { onSuccess: () => navigate(paths.home(workspaceSlug)) })}
        onArchive={() => setArchiving(true)}
      />
      <ChannelTabs channel={channel} tab={tab} onChange={onTab} panelId={panelId} />
      {error && <p className="sf-small px-4 pt-2 text-sf-error">{error.message}</p>}
      {editing && <ChannelSheet workspaceId={channel.workspaceId} workspaceSlug={workspaceSlug} channel={channel} onClose={() => setEditing(false)} />}
      {channel.kind === 'channel' && <ArchiveChannelModal channel={channel} open={archiving} onClose={() => setArchiving(false)} />}
    </div>
  )
}

/**
 * The Messages tab: the channel's list over its composer, with a live connection to the channel while it's open.
 * The New line stays where my read marker was when I opened the channel.
 */
function PaneFeed({
  channel,
  title,
  users,
  usersLoading,
  meId,
  canPost,
  messageActions,
  composer,
}: {
  channel: Channel
  title: string
  users: User[]
  usersLoading: boolean
  meId: string
  canPost: boolean
  messageActions?: (message: ChatMessage, close: () => void) => ReactNode
  composer: ReactNode
}) {
  const messages = useMessages(channel.id)
  const realtime = useRealtime()
  const { mutate: markRead } = useMarkRead()
  useEffect(() => {
    realtime.joinChannel(channel.id)
    return () => realtime.leaveChannel(channel.id)
  }, [realtime, channel.id])
  const [{ newAfterSeq, totalUnread }] = useState({ newAfterSeq: channel.lastReadSeq, totalUnread: channel.unreadCount })
  const onMarkRead = useCallback((seq?: number) => markRead({ channelId: channel.id, seq }), [markRead, channel.id])
  return (
    <>
      {usersLoading ? (
        <div className="min-h-0 flex-1 px-4 pt-4 md:px-6">
          <MessageSkeleton />
        </div>
      ) : (
        <MessageList
          query={messages}
          title={title}
          users={users}
          meId={meId}
          canPost={canPost}
          messageActions={messageActions}
          newAfterSeq={newAfterSeq}
          totalUnread={totalUnread}
          markedSeq={channel.lastReadSeq}
          onMarkRead={onMarkRead}
        />
      )}
      {composer && <div className="flex-none px-4 pt-2 pb-3 md:px-6">{composer}</div>}
    </>
  )
}
