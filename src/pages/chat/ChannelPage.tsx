import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { useSchedule, viewerZone } from '@/api/scheduled'
import { useAddMembers, useChannel, useChannels, useDrafts, useDraftSaver, useInvitations, useJumpTarget, useLeaveChannel, useMarkRead, useMessage, useMessages, useMessagesFrom, useRemoveMember, useRevokeInvitation, useSetMuted, useSetNotifyLevel, useSetStarred, useUpdateChannel } from '@/api/chat'
import { useUsers } from '@/api/users'
import { useDndEnd, usePreferences } from '@/api/preferences'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { ApiError } from '@/lib/api'
import { channelLabel, inWorkspace, isArchived, mustJoin, cantWriteLine } from '@/lib/channels'
import { paths } from '@/lib/paths'
import { usePermission } from '@/lib/usePermission'
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
import { useCanPost, useCanWrite, useReadOnlyLine } from '@/pages/chat/useCanPost'
import { useTaskFromMessage } from '@/pages/chat/useTaskFromMessage'
import { useSnippet } from '@/pages/chat/snippets/useSnippet'
import { RemindDialog } from '@/pages/chat/saved/RemindDialog'
import { useNoteReminder } from '@/api/saved'
import { useChannelCommands, type ChannelCommandUi } from '@/pages/chat/composer/useChannelCommands'
import { ArchiveChannelModal, ArchivedChannelLine, JoinChannelLine, useChannelProject, useChannelRights } from '@/pages/chat/ChannelActions'
import { ChannelHeader } from '@/pages/chat/ChannelHeader'
import { ChannelDetails, detailsRights, type DetailsTab } from '@/pages/chat/ChannelDetails'
import { ChannelTabs, tabFromParam, type ChannelTab } from '@/pages/chat/ChannelTabs'
import { ChannelPageTab } from '@/pages/chat/page/ChannelPageTab'
import { TemplatePicker } from '@/pages/chat/page/TemplatePicker'
import { ChannelIntroRow } from '@/pages/chat/ChannelIntroRow'
import { askToLeave } from '@/lib/unsavedChanges'
import { ChannelPins } from '@/pages/chat/PinsTab'
import { ChannelFiles } from '@/pages/chat/files/FilesTab'
import { useFlowFilePicker } from '@/pages/chat/files/FilePicker'
import { usePins } from '@/api/pins'
import { useAddBookmark, useBookmarks, useRemoveBookmark, useUpdateBookmark } from '@/api/bookmarks'
import type { Attachment, Channel, ChatMessage, User } from '@/api/types'
import { useProjectSummaries, useTeams } from '@/api/projects'
import { MessageSkeleton } from '@/pages/chat/MessageSkeleton'
import { useChannelReadState, useReadHold, useReadHoldScope } from '@/pages/chat/readState'
import { ChannelShortcuts, type ChannelNavState } from '@/pages/chat/ChannelShortcuts'
import { useGroupConfirm } from '@/pages/chat/composer/useGroupConfirm'
import { useChannelInvite } from '@/pages/chat/composer/useChannelInvite'
import { FileActionsProvider } from '@/pages/chat/files/FileActions'
import { withInspector } from '@/lib/inspector'
import { UploadTray } from '@/pages/chat/uploads/UploadTray'
import { composerLinkPreview } from '@/pages/chat/LinkPreviewCard'
import { channelScope } from '@/pages/chat/search/resolveSearch'
import { useOpenSearch } from '@/lib/openSearch'
import { paneDrop, useUploads, type Uploads } from '@/pages/chat/uploads/useUploads'

/** A channel or DM: its header and tabs over its messages, newest at the bottom, filling the main card (spec 5.3, 6.1). */
export function ChannelPage() {
  const { channelId } = useParams()
  return <ChannelView channelId={channelId} />
}

/**
 * A channel's whole view: header, tabs, messages and the rich composer. The channel page fills the card with it; a
 * project's Chat tab shows its channel with it in a box (slice AA), so both behave the same.
 */
export function ChannelView({ channelId, hideTabs = [] }: { channelId: string | undefined; hideTabs?: readonly ChannelTab[] }) {
  const { ws = '' } = useParams()
  const { workspace } = useCurrentWorkspace()
  const { persona } = useRole()
  const channel = useChannel(channelId)
  const users = useUsers(workspace?.id)
  const canPost = useCanPost(channel.data)
  const canWrite = useCanWrite(channel.data)
  const queue = useSendQueue()
  const queryClient = useQueryClient()
  const readOnly = useReadOnlyLine(channel.data)
  const fromMessage = useTaskFromMessage(channelId, workspace?.id)
  const projects = useProjectSummaries(workspace?.id)
  const realtime = useRealtime()
  // The composer's tray (spec 6.9): its own per channel.
  const uploads = useUploads(channelId ?? '')
  // Marked unread (U) stays unread until I leave the channel.
  useReadHoldScope(channelId)
  // Start fetching the composer with the page, not once the drafts are in.
  useEffect(() => void loadComposer(), [])
  const panelId = useId()
  // Channel details: from the header, and from /invite and /topic in the box (spec 6.8).
  const [details, setDetails] = useState<OpenDetails | null>(null)
  // /remind: the words to be reminded of, while Set a reminder is open.
  const [reminding, setReminding] = useState<string | null>(null)
  const [pickingTemplate, setPickingTemplate] = useState(false)
  const noteReminder = useNoteReminder()
  const [params, setParams] = useSearchParams()
  const asked = channel.data ? tabFromParam(params.get('tab'), channel.data) : 'messages'
  // A view left out here (a project's chat has no Files) opens Messages instead.
  const tab = hideTabs.includes(asked) ? 'messages' : asked
  // Leaving the Page tab with changes it doesn't have asks first, as leaving the channel does (spec 6.14 §6.4).
  const setTab = (next: ChannelTab) => askToLeave(() => setParams(next === 'messages' ? {} : { tab: next }, { replace: true }))
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
        <p className="text-sm text-fg-muted">You’re not in this channel. Ask someone in it to add you.</p>
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
  const writing = tab === 'messages' && !isArchived(current) && !mustJoin(current, persona.id, projects.data) && canPost === true && canWrite === true
  return (
    <FileActionsProvider
      workspaceId={current.workspaceId}
      meId={persona.id}
      people={people}
      // Details opens the File details panel beside the channel (spec 6.9), as a thread does.
      onDetails={(file) => setParams((p) => withInspector(p, { kind: 'file', fileId: file.id }))}
      onCreateTask={fromMessage.fromFile}
      // An archived channel (a project's too, archived with it) is read-only: its files can't be edited or deleted.
      frozen={isArchived(current)}
    >
    <div className="flex min-h-0 flex-1 flex-col">
      <ChannelTop channel={current} people={people} workspaceSlug={ws} tab={tab} onTab={setTab} panelId={panelId} details={details} setDetails={setDetails} hideTabs={hideTabs} />
      <div id={panelId} role="tabpanel" aria-label={tab === 'messages' ? 'Messages' : tab} className="flex min-h-0 flex-1 flex-col" {...paneDrop(writing, uploads.add)}>
      {tab === 'pins' ? (
        <div className="sf flex min-h-0 flex-1 flex-col">
          <ChannelPins channel={current} users={people} canPost={canPost === true && canWrite === true} />
        </div>
      ) : tab === 'files' ? (
        <div className="sf flex min-h-0 flex-1 flex-col">
          <ChannelFiles channel={current} users={people} />
        </div>
      ) : tab === 'page' ? (
        <div className="sf flex min-h-0 flex-1 flex-col">
          <ChannelPageTab channel={current} people={people} me={persona.id} />
        </div>
      ) : (
      <PaneFeed
        key={current.id}
        channel={current}
        title={title}
        intro={
          <ChannelIntroRow
            channel={current}
            people={people}
            me={persona.id}
            ws={ws}
            onAddPeople={() => setDetails({ tab: 'members' })}
            onEditDescription={() => setDetails({ tab: 'about', editDescription: true })}
            onPickTemplate={() => setPickingTemplate(true)}
          />
        }
        users={people}
        usersLoading={users.isLoading}
        meId={persona.id}
        canPost={canPost === true}
        messageActions={fromMessage.messageActions}
        composer={
          isArchived(current) ? (
            <ArchivedChannelLine channel={current} />
          ) : mustJoin(current, persona.id, projects.data) ? (
            <JoinChannelLine channel={current} />
          ) : canPost === false ? (
            <p className="text-sm text-fg-muted">{readOnly}</p>
          ) : canPost && !canWrite ? (
            <p className="text-sm text-fg-muted">{cantWriteLine(current)}</p>
          ) : canPost ? (
            <>
            <ChannelComposer
              channel={current}
              placeholder={`Message ${title}`}
              uploads={uploads}
              commandUi={{ openDetails: (on, options) => setDetails({ tab: on, ...options }), newTask: fromMessage.fromCommand, whyNoTask: fromMessage.whyNoTask, remind: setReminding }}
              onTyping={() => realtime.sendTyping(current.id, persona.id)}
              // Shown at once and sent in the background (spec 6.2), with its files; a failure shows on the message, with Retry.
              onSend={async (body) => {
                queue.enqueue({ clientId: crypto.randomUUID(), channelId: current.id, content: bodyText(body), body, fileIds: uploads.ready.map((f) => f.id), attachments: uploads.ready })
                uploads.clear()
              }}
              // A snippet goes out like any file, on its own with its message (spec 6.9).
              onSendSnippet={async (file, body) => {
                queue.enqueue({ clientId: crypto.randomUUID(), channelId: current.id, content: bodyText(body), body, fileIds: [file.id], attachments: [file] })
              }}
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
      {pickingTemplate && <TemplatePicker channelId={current.id} people={people} me={persona.id} onClose={() => setPickingTemplate(false)} onAdded={() => setTab('page')} />}
      {reminding !== null && (
        <RemindDialog
          initialText={reminding}
          where={title}
          onSet={(text, at) => noteReminder.mutateAsync({ channelId: current.id, text, remindAt: at.toISOString() }).then(() => setReminding(null))}
          onClose={() => setReminding(null)}
        />
      )}
      <ChannelShortcuts channel={current} workspaceSlug={ws} searchScope={channelScope(current, people, persona.id)} />
    </div>
    </FileActionsProvider>
  )
}

/** The page column's padding, for the states shown instead of a channel. */
function Padded({ children }: { children: ReactNode }) {
  return <div className="px-4 pt-6 md:px-6 xl:px-8">{children}</div>
}

/** The header and tabs, with what they open: Channel details, Archive, and errors from their actions near them. */
/** Channel details as opened: the tab, and what /topic and /invite start it with. */
type OpenDetails = { tab: DetailsTab; editTopic?: boolean; editDescription?: boolean; addPeople?: string[] }

function ChannelTop({
  channel,
  people,
  workspaceSlug,
  tab,
  onTab,
  panelId,
  details,
  setDetails,
  hideTabs,
}: {
  channel: Channel
  people: User[]
  workspaceSlug: string
  tab: ChannelTab
  onTab: (tab: ChannelTab) => void
  /** Views left out (UX Phase 2, 2.5). */
  hideTabs: readonly ChannelTab[]
  panelId: string
  details: OpenDetails | null
  setDetails: (details: OpenDetails | null) => void
}) {
  const { persona } = useRole()
  const check = usePermission()
  const rights = useChannelRights(channel)
  const star = useSetStarred()
  const mute = useSetMuted()
  const level = useSetNotifyLevel()
  const markRead = useMarkRead()
  const leave = useLeaveChannel()
  const update = useUpdateChannel()
  const addMembers = useAddMembers()
  const removeMember = useRemoveMember()
  const revoke = useRevokeInvitation()
  const navigate = useNavigate()
  // The bell's way to Preferences, with the Do Not Disturb note while it's on (spec 6.11).
  const dndEnd = useDndEnd()
  const defaultLevel = usePreferences().data?.defaultLevel
  const preferences = { dndEnd, defaultLevel, onOpen: () => navigate(paths.preferences(workspaceSlug)) }
  // An archived project's channel still names its project (review).
  const own = useChannelProject(channel).project
  const takenNames = (useChannels(channel.workspaceId).data ?? []).filter((c) => c.kind === 'channel' && c.id !== channel.id).map((c) => c.name ?? '')
  const allowed = detailsRights(channel, rights, {
    restrictPosting: check('channel.restrictPosting', { channel }),
    inviteByEmail: check('channel.inviteByEmail', { channel }),
    setDefault: check('channel.setDefault', { channel }),
  })
  // Teams and invites only matter once the details are open.
  const teams = useTeams(details ? channel.workspaceId : undefined).data ?? []
  const invitations = useInvitations(channel.id, Boolean(details) && allowed.manage)
  const [archiving, setArchiving] = useState(false)
  // The Pins tab's count (spec 6.1).
  const pins = usePins(channel.id)
  // Bookmarks after the tabs, and in Channel details › Tabs (spec 6.1, 6.10): whoever may post manages them.
  const bookmarks = useBookmarks(channel.id)
  const addBookmark = useAddBookmark()
  const updateBookmark = useUpdateBookmark()
  const removeBookmark = useRemoveBookmark()
  // "Only admins can post" holds for bookmarks too (the server checks the same).
  const mayBookmark = useCanWrite(channel) === true && !isArchived(channel)
  // The tabs' + adds one; on phones the header's more menu does (follow-up to UX Phase 6).
  const addBookmarkTo = mayBookmark ? (bookmark: { title: string; url: string }) => addBookmark.mutateAsync({ channelId: channel.id, bookmark }) : undefined
  const top = useRef<HTMLDivElement>(null)
  // The details change the star, level and mute too: while they're open, these errors show under their header.
  const headerError = (star.error ?? mute.error ?? level.error) as Error | null
  const error = (headerError ?? markRead.error ?? leave.error) as Error | null
  const members = channel.memberIds.map((id) => ({ id, name: people.find((u) => u.id === id)?.name ?? 'Unknown person' }))
  const openDetails = (on: DetailsTab, editTopic?: boolean) => {
    star.reset()
    mute.reset()
    level.reset()
    setDetails({ tab: on, editTopic })
  }
  const copyLink = () => navigator.clipboard.writeText(new URL(paths.channel(workspaceSlug, channel.id), window.location.origin).href)
  const openSearch = useOpenSearch(workspaceSlug)
  const scope = channelScope(channel, people, persona.id)
  const leaveChannel = () => leave.mutate(channel.id, { onSuccess: () => navigate(paths.start(workspaceSlug)) })
  return (
    <div ref={top} className="sf flex-none bg-sf-surface">
      <ChannelHeader
        channel={channel}
        title={channel.kind === 'channel' ? (channel.name ?? '') : channelLabel(channel, people, persona.id)}
        members={members}
        rights={rights}
        onDetails={openDetails}
        onStar={(starred) => star.mutate({ id: channel.id, starred })}
        onMute={(muted) => mute.mutate({ id: channel.id, muted })}
        onNotifyLevel={(notifyLevel) => level.mutate({ id: channel.id, level: notifyLevel })}
        preferences={preferences}
        onMarkRead={() => {
          useReadHold.getState().release(channel.id)
          markRead.mutate({ channelId: channel.id })
        }}
        onCopyLink={copyLink}
        onLeave={leaveChannel}
        onArchive={() => setArchiving(true)}
        onSearch={scope ? () => openSearch(scope) : undefined}
        onAddBookmark={addBookmarkTo}
      />
      <ChannelTabs
        channel={channel}
        tab={tab}
        onChange={onTab}
        panelId={panelId}
        pinCount={pins.data?.length}
        hidden={hideTabs}
        bookmarks={bookmarks.data}
        onAddBookmark={addBookmarkTo}
      />
      {error && !details && <p className="sf-small px-4 pt-2 text-sf-error">{error.message}</p>}
      {details && channel.kind === 'channel' && (
        <ChannelDetails
          channel={channel}
          meId={persona.id}
          people={people}
          takenNames={takenNames}
          project={own ? { name: own.name, key: own.key, href: paths.project(workspaceSlug, own.key) } : null}
          teams={teams}
          invitations={invitations}
          mayRevoke={(invitation) => check('invitation.revoke', { invitedBy: invitation.invitedBy })}
          rights={allowed}
          tab={details.tab}
          editTopic={details.editTopic}
          editDescription={details.editDescription}
          addPeople={details.addPeople}
          bookmarks={bookmarks.data}
          onUpdateBookmark={mayBookmark ? (id, patch) => updateBookmark.mutateAsync({ id, patch }) : undefined}
          onRemoveBookmark={mayBookmark ? (id) => removeBookmark.mutateAsync(id) : undefined}
          headerError={headerError?.message}
          // "Add a topic" is gone once there's a topic: focus goes back to the channel's name.
          fallbackFocus={() => top.current?.querySelector<HTMLElement>('h1 button')}
          onClose={() => setDetails(null)}
          onSave={(patch) => update.mutateAsync({ id: channel.id, patch })}
          onAdd={({ userIds, emails }) => addMembers.mutateAsync({ id: channel.id, userIds, emails })}
          onRemove={(userId) => removeMember.mutateAsync({ id: channel.id, userId })}
          onRevoke={(invitationId) => revoke.mutateAsync(invitationId)}
          onStar={(starred) => star.mutate({ id: channel.id, starred })}
          onNotifyLevel={(notifyLevel) => level.mutate({ id: channel.id, level: notifyLevel })}
          preferences={preferences}
          onMute={(muted) => mute.mutate({ id: channel.id, muted })}
          onCopyLink={copyLink}
          onLeave={() => {
            setDetails(null)
            leaveChannel()
          }}
          onArchive={() => {
            // Its question takes over: once it's archived, nothing here can be changed anyway.
            setDetails(null)
            setArchiving(true)
          }}
        />
      )}
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
  intro,
}: {
  channel: Channel
  title: string
  /** The channel's intro (chat spec 6.14), at the very start of its history. */
  intro: ReactNode
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
      () => setJumpError("Couldn’t jump there. Try again."),
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
    else setJumpError("That message isn’t in this channel any more.")
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
          totalUnread={view.from === null ? read.unreadOnOpen : 0}
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
          intro={intro}
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
  uploads,
  onTyping,
  error,
  onSend,
  onEditLast,
  onSendSnippet,
  commandUi,
}: {
  channel: Channel
  placeholder: string
  uploads: Uploads
  onTyping: () => void
  error?: Error | null
  onSend: (body: Body) => Promise<unknown>
  onEditLast: () => void
  onSendSnippet: (file: Attachment, message: Body) => Promise<unknown>
  commandUi: ChannelCommandUi
}) {
  const drafts = useDrafts(channel.workspaceId)
  const saveDraft = useDraftSaver()
  // Alt+↑/↓ brought me here: carry on typing.
  const arrived = (useLocation().state as ChannelNavState)?.focus === 'composer'
  const directory = useComposerDirectory(channel.workspaceId, channel.memberIds)
  // @channel or @here to more than 25 members asks first (spec 6.8).
  const loud = useGroupConfirm(channel.kind === 'channel' ? `#${channel.name}` : 'this conversation', channel.memberIds.length)
  // Someone mentioned who isn't in the channel: add them, or send without them (spec 6.8).
  const invite = useChannelInvite(channel, directory.users)
  const schedule = useSchedule()
  // The / shortcuts this channel offers me (spec 6.8).
  const slash = useChannelCommands(channel, commandUi)
  // Add from Flow files (spec 6.8): the picked files join this box's tray.
  const flowFiles = useFlowFilePicker(channel.workspaceId, uploads.addExisting)
  const snippet = useSnippet({
    channelId: channel.id,
    where: placeholder.replace(/^Message /, ''),
    send: (file, message) => loud.confirm(message).then(() => invite.confirm(message)).then(() => onSendSnippet(file, message)),
  })
  if (drafts.isPending) return composerSkeleton
  const draft = drafts.data?.find((d) => d.channelId === channel.id && d.rootId === null)
  return (
    <Suspense fallback={composerSkeleton}>
    {loud.dialog}
    {invite.dialog}
    {snippet.dialog}
    {flowFiles.dialog}
    <RichComposer
      key={channel.id}
      placeholder={placeholder}
      initialBody={draft?.body}
      onSend={(body) => loud.confirm(body).then(() => invite.confirm(body)).then(() => onSend(body))}
      onSchedule={(body, at) =>
        loud
          .confirm(body)
          .then(() => invite.confirm(body))
          .then(() => schedule.mutateAsync({ channelId: channel.id, rootId: null, body, sendAt: at.toISOString(), tz: viewerZone() }))
      }
      onEditLast={onEditLast}
      onDraft={(body) => saveDraft(channel.id, body)}
      onTyping={onTyping}
      error={error ?? schedule.error}
      directory={directory}
      slash={slash}
      onSnippet={snippet.open}
      linkPreview={composerLinkPreview}
      autoFocus={arrived}
      files={{
        tray: <UploadTray uploads={uploads.items} refused={uploads.refused} onRemove={uploads.remove} onRetry={uploads.retry} />,
        onAdd: uploads.add,
        ready: uploads.ready.length,
        waiting: uploads.waiting,
        fromFlow: flowFiles.open,
      }}
    />
    </Suspense>
  )
}
