import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useChannels, useDrafts, useSetFollowing, useSetThreadMuted, useThread } from '@/api/chat'
import { useMarkThreadsRead, useThreads } from '@/api/threads'
import type { Channel, ThreadCard, User } from '@/api/types'
import { useUsers } from '@/api/users'
import { Button } from '@/components/sf/Button'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { channelLabel } from '@/lib/channels'
import { senderName } from '@/lib/flowbot'
import { withInspector } from '@/lib/inspector'
import { paths } from '@/lib/paths'
import { useRole } from '@/lib/useRole'
import { useShownError } from '@/lib/useShownError'
import { ChannelMessage } from '@/pages/chat/ChannelMessage'
import { FileActionsProvider } from '@/pages/chat/files/FileActions'
import { canContinue } from '@/pages/chat/messageRows'
import { ThreadReplyBox } from '@/pages/chat/ThreadReplyBox'
import { orderThreads } from '@/pages/chat/threads/threadOrder'
import { ThreadCardView } from '@/pages/chat/threads/ThreadCardView'
import { useSeen } from '@/pages/chat/threads/useSeen'
import { useCanPost } from '@/pages/chat/useCanPost'
import { useBodyContext, useProjectKeys } from '@/pages/chat/useBodyContext'

/**
 * Threads (spec 6.12) for the workspace on screen: every thread I follow, unread first. While the view is open it keeps every card it has shown (so one the server
 * stops listing, read past the loaded pages or unfollowed, stays where it was), how many replies were new in each (so
 * reading doesn't move or unmark anything), and which I unfollowed here (folded, with Follow again). Another workspace
 * starts afresh.
 */
export function ThreadsPage() {
  const { workspace } = useCurrentWorkspace()
  const { persona } = useRole()
  const threads = useThreads(workspace?.id)
  const usersQuery = useUsers(workspace?.id)
  const channelsQuery = useChannels(workspace?.id)
  const error = useShownError(threads) ?? usersQuery.error ?? channelsQuery.error
  const users = usersQuery.data
  const channels = channelsQuery.data
  const drafts = useDrafts(workspace?.id).data
  const [, setParams] = useSearchParams()
  const cards = useMemo(() => threads.data?.pages.flatMap((p) => p.items), [threads.data])

  // Every card shown on this visit, as the server last sent it, and the most replies each had unread: its "N new" and
  // its place with the unread ones. Adjusted as each answer arrives (React's "adjust state on a prop change").
  const [seenCards, setSeenCards] = useState<ThreadCard[] | undefined>(undefined)
  const [kept, setKept] = useState<ReadonlyMap<string, ThreadCard>>(new Map())
  const [newCounts, setNewCounts] = useState<ReadonlyMap<string, number>>(new Map())
  const [unfollowed, setUnfollowed] = useState<ReadonlySet<string>>(new Set())
  // Reset in place rather than by remounting (a `key`), which would ask the server for the list again.
  const [visit, setVisit] = useState(workspace?.id)
  if (workspace?.id !== visit) {
    setVisit(workspace?.id)
    setSeenCards(undefined)
    setKept(new Map())
    setNewCounts(new Map())
    setUnfollowed(new Set())
  } else if (cards !== seenCards) {
    setSeenCards(cards)
    if (cards) {
      setKept(new Map([...kept, ...cards.map((c) => [c.root.id, c] as const)]))
      const grown = cards.filter((c) => c.unreadCount > (newCounts.get(c.root.id) ?? 0))
      if (grown.length) setNewCounts(new Map([...newCounts, ...grown.map((c) => [c.root.id, c.unreadCount] as const)]))
    }
  }

  const shown = useMemo(() => {
    if (!cards) return undefined
    const ever = new Set([...newCounts].filter(([, n]) => n > 0).map(([id]) => id))
    return orderThreads([...kept.values()], ever)
  }, [cards, kept, newCounts])

  const people = users ?? []
  return (
    <div className="sf flex min-h-0 flex-1 flex-col">
      <FileActionsProvider workspaceId={workspace?.id ?? ''} meId={persona.id} people={people} onDetails={(file) => setParams((p) => withInspector(p, { kind: 'file', fileId: file.id }))}>
        <section aria-labelledby="threads-title" className="flex min-h-0 min-w-0 flex-1 flex-col bg-sf-surface">
          <header className="flex h-sf-header flex-none items-center ps-4 pe-4 sm:ps-6">
            <h1 id="threads-title" className="sf-title min-w-0 flex-1 truncate text-sf-text">
              Threads
            </h1>
          </header>
          <div aria-busy={!shown && !error} className="min-h-0 flex-1 overflow-y-auto bg-sf-surface-sunken px-2 py-3 sm:px-6 sm:py-4">
            {(!shown || !channels || !users) && error ? (
              <div className="flex flex-col items-start gap-3 px-4 py-8">
                <p className="sf-ui text-sf-text-secondary">Threads didn’t load.</p>
                <Button
                  size="sm"
                  onClick={() => void Promise.all([threads.refetch(), usersQuery.refetch(), channelsQuery.refetch()])}
                  disabled={threads.isFetching || usersQuery.isFetching || channelsQuery.isFetching}
                >
                  {threads.isFetching || usersQuery.isFetching || channelsQuery.isFetching ? 'Trying…' : 'Try again'}
                </Button>
              </div>
            ) : !shown || !channels || !users ? (
              <ul aria-hidden className="flex flex-col gap-3">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="h-40 animate-pulse rounded-sf-lg bg-sf-surface-hover" />
                ))}
              </ul>
            ) : shown.length === 0 ? (
              <p className="sf-ui px-4 py-8 text-sf-text-muted">No threads yet. Threads you start, reply to or are mentioned in show here.</p>
            ) : (
              <>
                <ul aria-label="Threads" className="mx-auto flex max-w-[860px] flex-col gap-3">
                  {shown.map((card) => {
                    const channel = channels.find((c) => c.id === card.channelId)
                    return (
                      channel && (
                        <li key={card.root.id}>
                          <ThreadItem
                            card={card}
                            channel={channel}
                            users={people}
                            meId={persona.id}
                            ws={workspace?.slug ?? ''}
                            workspaceId={workspace?.id ?? ''}
                            newCount={newCounts.get(card.root.id) ?? 0}
                            unfollowed={unfollowed.has(card.root.id)}
                            onUnfollowed={(done) => setUnfollowed((ids) => (done ? new Set(ids).add(card.root.id) : new Set([...ids].filter((id) => id !== card.root.id))))}
                            hasDraft={Boolean(drafts?.some((d) => d.rootId === card.root.id))}
                          />
                        </li>
                      )
                    )
                  })}
                </ul>
                <div className="mx-auto max-w-[860px] px-2 py-4">
                  {threads.hasNextPage ? (
                    <Button size="sm" touch disabled={threads.isFetchingNextPage} onClick={() => void threads.fetchNextPage()}>
                      {threads.isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </Button>
                  ) : (
                    <p className="sf-small m-0 text-center text-sf-text-muted">You’re caught up.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      </FileActionsProvider>
    </div>
  )
}

/** One thread's card, live: its replies (all of them after Show more), read once on screen, Unfollow, the reply box. */
function ThreadItem({
  card,
  channel,
  users,
  meId,
  ws,
  workspaceId,
  newCount,
  unfollowed,
  onUnfollowed,
  hasDraft,
}: {
  card: ThreadCard
  channel: Channel
  users: User[]
  meId: string
  ws: string
  workspaceId: string
  newCount: number
  unfollowed: boolean
  onUnfollowed: (unfollowed: boolean) => void
  /** A draft reply waits here: its box shows at once. */
  hasDraft: boolean
}) {
  const rootId = card.root.id
  // The reply box is a whole editor: it mounts when asked for (Reply…) or when a draft waits, not on every card.
  const [replying, setReplying] = useState(false)
  const [all, setAll] = useState(false)
  const everything = useThread(all ? rootId : undefined)
  const replies = all && everything.data ? everything.data.filter((r) => !r.deletedAt) : card.replies
  const hiddenCount = Math.max(0, card.totalReplies - replies.length)
  const markRead = useMarkThreadsRead()
  const seen = useSeen<HTMLDivElement>(card.unreadCount > 0 && !unfollowed, () => markRead.mutate({ workspaceId, rootIds: [rootId] }))
  const setFollowing = useSetFollowing()
  const [followError, setFollowError] = useState<string | null>(null)
  const follow = (following: boolean) =>
    setFollowing.mutate(
      { messageId: rootId, following },
      { onSuccess: () => (setFollowError(null), onUnfollowed(!following)), onError: () => setFollowError('Couldn’t change that. Try again.') },
    )
  const setMuted = useSetThreadMuted()
  const toggleMute = () => setMuted.mutate({ messageId: rootId, muted: !card.muted }, { onSuccess: () => setFollowError(null), onError: () => setFollowError('Couldn’t change that. Try again.') })
  const canPost = useCanPost(channel) === true
  const projectKeys = useProjectKeys(workspaceId)
  const scope = useMemo(() => ({ users, projectKeys, ws, workspaceId }), [users, projectKeys, ws, workspaceId])
  const bodies = useMemo(() => [card.root.body, ...replies.map((r) => r.body)], [card.root.body, replies])
  const ctx = useBodyContext(bodies, scope)
  const where = channel.kind === 'channel' ? `#${channel.name}` : channelLabel(channel, users, meId)
  // The "New" line sits before the replies that were unread when I came, when they are all on the card.
  const newFrom = newCount > 0 && newCount <= replies.length ? replies.length - newCount : -1
  return (
    <div ref={seen}>
      <ThreadCardView
        place={where}
        participants={card.participantIds.map((id) => ({ id, name: senderName(id, users) }))}
        newCount={newCount}
        hiddenCount={hiddenCount}
        loadingMore={all && everything.isPending}
        onShowMore={() => setAll(true)}
        unfollowed={unfollowed}
        muted={card.muted}
        onToggleMute={toggleMute}
        onUnfollow={() => follow(false)}
        onFollow={() => follow(true)}
        followError={followError}
        channelHref={paths.message(ws, channel.id, rootId)}
        link={new URL(`${paths.channel(ws, channel.id)}?thread=${encodeURIComponent(rootId)}`, window.location.origin).href}
        parent={<ChannelMessage message={card.root} users={users} ctx={ctx} meId={meId} canPost={canPost} continuation={false} showThread={false} compact />}
        replies={
          <ul>
            {replies.map((reply, i) => (
              <li key={reply.id}>
                {i === newFrom && (
                  <div className="sf-meta flex items-center gap-2 px-3 py-1 font-medium text-sf-accent" role="separator" aria-label="New replies">
                    <span className="h-px flex-1 bg-sf-accent-fill" />
                    New
                  </div>
                )}
                <ChannelMessage
                  message={reply}
                  users={users}
                  ctx={ctx}
                  meId={meId}
                  canPost={canPost}
                  continuation={i > 0 && i !== newFrom && canContinue(replies[i - 1], reply)}
                  compact
                  alsoSentTo={where}
                />
              </li>
            ))}
          </ul>
        }
        replyBox={
          replying || hasDraft ? (
            <ThreadReplyBox channel={channel} rootId={rootId} where={where} autoFocus={replying} />
          ) : (
            <button
              type="button"
              onClick={() => setReplying(true)}
              className="sf-focus sf-body flex h-10 w-full cursor-text items-center rounded-sf-lg border border-sf-line-strong bg-sf-surface px-3 text-start text-sf-text-muted hover:border-sf-text-secondary max-md:h-11"
            >
              Reply…
            </button>
          )
        }
      />
    </div>
  )
}
