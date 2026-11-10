import { IconAlarm, IconAt, IconSubtask, IconMessages, IconMoodSmile, type TablerIcon } from '@tabler/icons-react'
import { useId } from 'react'
import { Link } from 'react-router'
import type { ActivityItem, ActivityItemKind } from '@/api/types'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Tabs } from '@/components/sf/Tabs'
import { Toggle } from '@/components/sf/Toggle'
import { isFlowbot } from '@/lib/flowbot'
import { timeAgo } from '@/lib/format'
import { useNow } from '@/lib/useNow'
import { ACTIVITY_TABS, activityKind, activityLink, shownActivity, type ActivityTab } from '@/pages/chat/activityRows'
import { useParam } from '@/lib/searchParams'
import { useDocumentTitle } from '@/lib/useDocumentTitle'

const KIND_ICONS: Record<ActivityItemKind, TablerIcon> = { mention: IconAt, reaction: IconMoodSmile, thread: IconMessages, reminder: IconAlarm, task: IconSubtask }

/**
 * The Activity view (spec 6.12): a 52px header with Unread only and Mark all read, the tabs, and the rows, unread
 * first and then "Earlier". Opening a row goes to it; `onOpen` marks it read. Mark all read marks everything on All,
 * and only the tab's unread rows on the others.
 */
export function ActivityView({
  items,
  ws,
  placeOf,
  error,
  retrying,
  onRetry,
  onOpen,
  onMarkAllRead,
  marking,
  markError,
}: {
  /** Undefined while it loads. */
  items: ActivityItem[] | undefined
  ws: string
  /** Where an item happened: `#backend`, "a direct message", or null when it can't be found. */
  placeOf: (item: ActivityItem) => string | null
  error: boolean
  retrying: boolean
  onRetry: () => void
  onOpen: (item: ActivityItem) => void
  onMarkAllRead: (ids: string[] | undefined) => void
  marking: boolean
  markError: string | null
}) {
  useDocumentTitle(['Activity'])
  // A page people leave open: "3 min ago" moves on by itself.
  const now = useNow(60_000).getTime()
  // In the address (UX Phase 2, 2.7): a reload, Back or a shared link keeps the tab and Unread only.
  const [tabParam, setTabParam] = useParam('tab')
  const tab: ActivityTab = ACTIVITY_TABS.some((t) => t.id === tabParam) ? (tabParam as ActivityTab) : 'all'
  const setTab = (next: ActivityTab, how?: { keys: true }) => setTabParam(next === 'all' ? '' : next, { replace: Boolean(how?.keys) })
  const [unreadParam, setUnreadParam] = useParam('unread')
  const unreadOnly = unreadParam === '1'
  const setUnreadOnly = (on: boolean) => setUnreadParam(on ? '1' : '')
  const panelId = useId()
  const switchId = useId()
  const shown = items && shownActivity(items, tab, unreadOnly)
  const label = ACTIVITY_TABS.find((t) => t.id === tab)!.label

  const row = (item: ActivityItem) => (
    <li key={item.id}>
      <Link
        to={activityLink(item, ws)}
        onClick={() => onOpen(item)}
        className="sf-focus grid grid-cols-[8px_var(--size-avatar)_minmax(0,1fr)_auto] items-start gap-x-3 border-b border-sf-line px-4 py-3 hover:bg-sf-surface-hover sm:px-6"
      >
        {item.read ? (
          <span />
        ) : (
          <span className="mt-4 size-2 rounded-sf-full bg-sf-accent-fill">
            <span className="sr-only">Unread, </span>
          </span>
        )}
        <Avatar id={item.actorId} name={item.actorName} app={isFlowbot(item.actorId)} decorative />
        <span className="min-w-0">
          <span className="sf-meta flex items-center gap-1 font-medium text-sf-text-secondary">
            <Icon icon={KIND_ICONS[item.kind]} size={16} className="flex-none" />
            <span className="truncate">{activityKind(item, placeOf(item))}</span>
          </span>
          {item.kind === 'reaction' || item.kind === 'reminder' || (item.kind === 'task' && item.taskEvent !== 'taskComment') ? (
            // My own words under the line that says who reacted; the message a reminder is about; the task's title.
            <span className="sf-body mt-0.5 line-clamp-2 block text-sf-text-secondary">{item.excerpt}</span>
          ) : (
            <span className="sf-body mt-0.5 line-clamp-2 block text-sf-text">
              <span className="font-medium">{item.actorName}</span> {item.excerpt}
            </span>
          )}
        </span>
        <span className="sf-meta whitespace-nowrap text-sf-text-muted tabular-nums">{timeAgo(item.createdAt, now)}</span>
      </Link>
    </li>
  )

  const unreadInTab = shown?.unread ?? []
  return (
    <section aria-labelledby={`${panelId}-title`} className="flex min-h-0 min-w-0 flex-1 flex-col bg-sf-surface">
      <header className="flex h-sf-header flex-none items-center gap-3 ps-4 pe-4 sm:ps-6">
        <h1 id={`${panelId}-title`} className="sf-title min-w-0 flex-1 truncate text-sf-text">
          Activity
        </h1>
        {/* The words flip the switch too, and the pair is a 44px touch target on phones (spec 6.16). */}
        <label className="sf-small inline-flex cursor-pointer items-center gap-2 text-sf-text-secondary max-md:min-h-11">
          <span id={switchId}>Unread only</span>
          <Toggle checked={unreadOnly} onChange={setUnreadOnly} labelledBy={switchId} />
        </label>
        <Button size="sm" touch disabled={marking || unreadInTab.length === 0} onClick={() => onMarkAllRead(tab === 'all' ? undefined : unreadInTab.map((item) => item.id))}>
          {marking ? 'Marking…' : 'Mark all read'}
        </Button>
      </header>
      {markError && (
        <p role="alert" className="sf-small px-4 pb-2 text-sf-error sm:px-6">
          {markError}
        </p>
      )}
      <Tabs label="Activity" tabs={ACTIVITY_TABS} tab={tab} onChange={setTab} panelId={panelId} />
      <div id={panelId} role="tabpanel" aria-label={label} aria-busy={!items && !error} className="min-h-0 flex-1 overflow-y-auto pb-6">
        {!shown && error ? (
          <div className="flex flex-col items-start gap-3 px-6 py-8">
            <p className="sf-ui text-sf-text-secondary">Activity didn’t load.</p>
            <Button size="sm" onClick={onRetry} disabled={retrying}>
              {retrying ? 'Trying…' : 'Try again'}
            </Button>
          </div>
        ) : !shown ? (
          <ul aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="mx-6 my-3 h-12 animate-pulse rounded-sf-md bg-sf-surface-hover" />
            ))}
          </ul>
        ) : unreadOnly && shown.unread.length === 0 ? (
          <p className="sf-ui px-6 py-8 text-sf-text-muted">You’re all caught up.</p>
        ) : shown.unread.length + shown.earlier.length === 0 ? (
          <p className="sf-ui px-6 py-8 text-sf-text-muted">Nothing here yet.</p>
        ) : (
          <>
            {shown.unread.length > 0 && <ul aria-label="Unread">{shown.unread.map(row)}</ul>}
            {shown.earlier.length > 0 && (
              <>
                <h2 id={`${panelId}-earlier`} className="sf-label px-4 pt-4 pb-1 text-sf-text-muted sm:px-6">
                  Earlier
                </h2>
                <ul aria-labelledby={`${panelId}-earlier`}>{shown.earlier.map(row)}</ul>
              </>
            )}
          </>
        )}
      </div>
    </section>
  )
}
