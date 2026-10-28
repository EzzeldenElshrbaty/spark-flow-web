import { lazy, Suspense, useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { useChannel, useDrafts, useDraftSaver, useJumpTarget, useLeaveChannel, useMarkRead, useMessage, useMessages, useMessagesFrom, useSetMuted, useSetStarred } from '@/api/chat'
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
import { useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import type { Page } from '@/api/types'
import { useEditing } from '@/pages/chat/editingStore'
import { lastEditable } from '@/pages/chat/messageRights'
import { usePendingMessages, useSendQueue } from '@/api/sendQueue'
import { bodyText, type Body } from '@/lib/messageBody'
import { useComposerDirectory } from '@/pages/chat/useComposerDirectory'
import { useProjectKeys } from '@/pages/chat/useBodyContext'
import { jumpSince, type JumpChoice } from '@/pages/chat/messageRows'
import { CanPostError } from '@/pages/chat/CanPostError'
import { TypingLine } from '@/pages/chat/ChannelTyping'
import { useCanPost, useReadOnlyLine } from '@/pages/chat/useCanPost'
import { useTaskFromMessage } from '@/pages/chat/useTaskFromMessage'
import { ArchiveChannelModal, ArchivedChannelLine, JoinChannelLine, useChannelRights } from '@/pages/chat/ChannelActions'
import { ChannelHeader } from '@/pages/chat/ChannelHeader'
import { ChannelSheet } from '@/pages/chat/ChannelSheet'
import { ChannelTabs, TabStub, tabFromParam, type ChannelTab } from '@/pages/chat/ChannelTabs'
import type { Channel, ChatMessage, User } from '@/api/types'
import { useProjectSummaries } from '@/api/projects'
import { MessageSkeleton } from '@/pages/chat/MessageSkeleton'
import { useChannelReadState, useReadHold, useReadHoldScope } from '@/pages/chat/readState'
import { ChannelShortcuts, type ChannelNavState } from '@/pages/chat/ChannelShortcuts'

/** A channel or DM: its header and tabs over its messages, newest at the bottom, filling the main card (spec 5.3, 6.1). */
export function ChannelPage() {
  const { ws = '', channelId } = useParams()
  const { workspace } = useCurrentWorkspace()
  const { persona } = useRole()
  const channel = useChannel(channelId)
  const users = useUsers(workspace?.id)
  const canPost = useCanPost(channel.data)
  const queue = useSendQueue()
  const queryClient = useQueryClient()
  const readOnly = useReadOnlyLine(channel.data)
  const fromMessage = useTaskFromMessage(channelId, workspace?.id)
  const projects = useProjectSummaries(workspace?.id)
  const realtime = useRealtime()
  // Marked unread (U) stays unread until I leave the channel.
  useReadHoldScope(channelId)
  // Start fetching the composer with the page, not once the drafts are in.
  useEffect(() => void loadComposer(), [])
  const panelId = useId()
  const [params, setParams] = useSearchParams()
  const tab = channel.data ? tabFromParam(params.get('tab'), channel.data) : 'messages'
  const setTab = (next: ChannelTab) => setParams(next === 'messages' ? {} : { tab: next }, { replace: true })
  // An error belongs to the channel it happened in.
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
            <ChannelComposer
              channel={current}
              placeholder={`Message ${title}`}
              onTyping={() => realtime.sendTyping(current.id, persona.id)}
              // Shown at once and sent in the background (spec 6.2); a failure shows on the message, with Retry.
              onSend={async (body) => queue.enqueue({ clientId: crypto.randomUUID(), channelId: current.id, content: bodyText(body), body })}
              onEditLast={() => {
                const loaded = queryClient.getQueryData<InfiniteData<Page<ChatMessage>>>(qk.messages(current.id))
                const last = lastEditable(loaded?.pages.flatMap((p) => p.items).reverse() ?? [], persona.id)
                if (last) useEditing.getState().start(last.id, 'channel')
              }}
            />
            <TypingLine channelId={current.id} people={people} meId={persona.id} />
            </>
          ) : (
            <CanPostError channel={current} />
          )
        }
      />
      )}
      </div>
      {fromMessage.sheet}
      <ChannelShortcuts channel={current} workspaceSlug={ws} />
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
        onMarkRead={() => {
          useReadHold.getState().release(channel.id)
          markRead.mutate({ channelId: channel.id })
        }}
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
 * The New line stays where my read marker was when I opened the channel. A jump from the date menu scrolls to a
 * message already loaded, or opens the list from it (`from`) until Jump to latest goes back to the live end.
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
  messageActions?: (message: ChatMessage) => ReactNode
  composer: ReactNode
}) {
  const live = useMessages(channel.id)
  const queue = useSendQueue()
  const pending = usePendingMessages(channel.id)
  const { ws: workspaceSlug = '' } = useParams()
  const projectKeys = useProjectKeys(channel.workspaceId)
  const scope = useMemo(() => ({ projectKeys, ws: workspaceSlug, workspaceId: channel.workspaceId }), [projectKeys, workspaceSlug, channel.workspaceId])
  const [view, setView] = useState<{ from: number | null; focus: number | null; nonce: number; atEnd: boolean }>({ from: null, focus: null, nonce: 0, atEnd: false })
  const jumped = useMessagesFrom(channel.id, view.from)
  const messages = view.from === null ? live : jumped
  const jumpTarget = useJumpTarget()
  const [jumpError, setJumpError] = useState<string | null>(null)
  /** Brings message `seq` to the top: scrolled to when it's loaded, else the list opens from it. */
  const goTo = (seq: number) =>
    setView((v) => {
      const loaded = (v.from === null ? live : jumped).data?.pages.some((p) => p.items.some((m) => m.seq === seq))
      return loaded ? { ...v, focus: seq, nonce: v.nonce + 1 } : { from: seq, focus: seq, nonce: v.nonce + 1, atEnd: false }
    })
  const onJump = (choice: JumpChoice) => {
    setJumpError(null)
    jumpTarget(channel.id, jumpSince(choice, new Date())).then(
      // Nothing that recent: the newest message is the closest there is.
      (seq) => (seq === null ? setView((v) => ({ from: null, focus: null, nonce: v.nonce + 1, atEnd: true })) : goTo(seq)),
      () => setJumpError("Couldn't jump there. Try again."),
    )
  }
  // A permalink (?message=, from Copy link) opens the channel on that message, once; the address then drops it.
  const [params, setParams] = useSearchParams()
  const linked = params.get('message')
  const linkedMessage = useMessage(linked ?? undefined)
  useEffect(() => {
    if (!linked || (!linkedMessage.data && !linkedMessage.isError)) return
    const m = linkedMessage.data
    if (m && m.channelId === channel.id) goTo(m.seq)
    else setJumpError("That message isn't in this channel any more.")
    setParams(
      (p) => {
        p.delete('message')
        return p
      },
      { replace: true },
    )
    // Runs when the linked message arrives (goTo reads the latest lists through setView).
  }, [linked, linkedMessage.data, linkedMessage.isError])
  const realtime = useRealtime()
  useEffect(() => {
    realtime.joinChannel(channel.id)
    return () => realtime.leaveChannel(channel.id)
  }, [realtime, channel.id])
  const [totalUnread] = useState(channel.unreadCount)
  const read = useChannelReadState(channel)
  return (
    <>
      {usersLoading ? (
        <div className="min-h-0 flex-1 px-4 pt-4 md:px-6">
          <MessageSkeleton />
        </div>
      ) : (
        <MessageList
          // A new start (a jump, or back to the live end) is a new list, opened afresh.
          key={view.from ?? 'live'}
          query={messages}
          title={title}
          users={users}
          meId={meId}
          canPost={canPost}
          messageActions={messageActions}
          newAfterSeq={read.newAfterSeq}
          // After a jump the list starts where I asked, not at my first unread message.
          totalUnread={view.from === null ? totalUnread : 0}
          // Marked read on opening (spec 6.2): the list needn't send it again.
          markedSeq={Math.max(channel.lastReadSeq, read.readOnOpen ?? 0)}
          onMarkRead={read.markRead}
          holdRead={read.held}
          onMarkUnread={(message) => read.markUnread(message.seq)}
          focusSeq={view.focus}
          focusNonce={view.nonce}
          openAtEnd={view.atEnd}
          onJump={onJump}
          onLatest={() => setView((v) => ({ from: null, focus: null, nonce: v.nonce + 1, atEnd: true }))}
          scope={scope}
          pending={pending}
          onRetry={queue.retry}
          onDiscard={queue.discard}
        />
      )}
      {jumpError && <p className="sf sf-small flex-none px-4 pt-2 text-sf-error md:px-6">{jumpError}</p>}
      {/* CHANNEL_COMPOSER (useChannelKeys): Esc in here still marks the channel read. */}
      {composer && (
        <div data-channel-composer="" className="flex-none px-4 pt-2 pb-3 md:px-6">
          {composer}
        </div>
      )}
    </>
  )
}

// The editor (Lexical) is most of a channel's code: it loads on its own, so the messages don't wait for it.
const loadComposer = () => import('@/pages/chat/composer/RichComposer')
const RichComposer = lazy(() => loadComposer().then((m) => ({ default: m.RichComposer })))
const composerSkeleton = <div aria-hidden className="h-[106px] animate-pulse rounded-lg bg-surface-muted" />

/**
 * The channel's composer: it starts from my draft here (once my drafts have loaded, so typing never races the
 * draft), saves changes back, and names the workspace's people, projects, tasks and channels.
 */
function ChannelComposer({
  channel,
  placeholder,
  onTyping,
  error,
  onSend,
  onEditLast,
}: {
  channel: Channel
  placeholder: string
  onTyping: () => void
  error?: Error | null
  onSend: (body: Body) => Promise<unknown>
  onEditLast: () => void
}) {
  const drafts = useDrafts(channel.workspaceId)
  const saveDraft = useDraftSaver()
  // Alt+↑/↓ brought me here: carry on typing.
  const arrived = (useLocation().state as ChannelNavState)?.focus === 'composer'
  const directory = useComposerDirectory(channel.workspaceId, channel.memberIds)
  if (drafts.isPending) return composerSkeleton
  const draft = drafts.data?.find((d) => d.channelId === channel.id && d.rootId === null)
  return (
    <Suspense fallback={composerSkeleton}>
    <RichComposer
      key={channel.id}
      placeholder={placeholder}
      initialBody={draft?.body}
      onSend={onSend}
      onEditLast={onEditLast}
      onDraft={(body) => saveDraft(channel.id, body)}
      onTyping={onTyping}
      error={error}
      directory={directory}
      autoFocus={arrived}
    />
    </Suspense>
  )
}
