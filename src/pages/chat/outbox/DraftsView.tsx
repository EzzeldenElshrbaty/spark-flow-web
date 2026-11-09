import { IconCalendarEvent, IconClock, IconPencil, IconSend, IconTrash } from '@tabler/icons-react'
import clsx from 'clsx'
import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { Draft, ScheduledMessage, SentItem } from '@/api/types'
import { Button, IconButton } from '@/components/sf/Button'
import { Menu, MenuItem, MenuSeparator } from '@/components/sf/Menu'
import { Tabs } from '@/components/sf/Tabs'
import { formatTime, formatWhen, timeAgo } from '@/lib/format'
import { bodyText } from '@/lib/messageBody'
import { paths } from '@/lib/paths'
import { schedulePresets } from '@/lib/remindTimes'
import { useNow } from '@/lib/useNow'
import { CustomReminder } from '@/pages/chat/saved/RemindMenu'
import { useParam } from '@/lib/searchParams'

type Tab = 'drafts' | 'scheduled' | 'sent'

const EMPTY: Record<Tab, string> = {
  drafts: 'No drafts. What you start writing and don’t send is kept here.',
  scheduled: 'Nothing scheduled. Use the arrow next to Send to pick a time.',
  sent: 'Nothing sent yet.',
}

/** "Sends today at 2:00 PM", "Sends tomorrow at 9:00 AM", or "Sends Mon 3 Nov at 9:00 AM" (spec 6.12). */
export function sendsWhen(iso: string, now = new Date()): string {
  const date = new Date(iso)
  const days = Math.round((new Date(date).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000)
  const day = days === 0 ? 'today' : days === 1 ? 'tomorrow' : date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')
  return `Sends ${day} at ${formatTime(date)}`
}

/** Where a draft, scheduled message or sent one opens: its channel, or its thread beside it. */
const placeLink = (ws: string, channelId: string, rootId: string | null) =>
  rootId ? `${paths.channel(ws, channelId)}?thread=${encodeURIComponent(rootId)}` : paths.channel(ws, channelId)

/**
 * Drafts & sent (spec 6.12): a 52px header and the tabs Drafts, Scheduled (with counts) and Sent. Drafts open where
 * they were written, with Delete draft. Scheduled rows say when they send, with Send now, Reschedule, Edit and Delete,
 * under a note with the viewer's time zone; a failed one says why. Sent rows open the message.
 */
export function DraftsView({
  drafts,
  scheduled,
  sent,
  ws,
  placeOf,
  zone,
  error,
  retrying,
  onRetry,
  onDeleteDraft,
  onSendNow,
  onReschedule,
  onEdit,
  onDelete,
}: {
  /** Each undefined while it loads. */
  drafts: Draft[] | undefined
  scheduled: ScheduledMessage[] | undefined
  sent: SentItem[] | undefined
  ws: string
  /** A channel's name: `#backend`, "a direct message", or null when it can't be found. */
  placeOf: (channelId: string) => string | null
  /** The viewer's time zone, which scheduled times are in. */
  zone: string
  error: boolean
  retrying: boolean
  onRetry: () => void
  onDeleteDraft: (draft: Draft) => void
  onSendNow: (id: string) => void
  onReschedule: (id: string, at: Date) => void
  onEdit: (item: ScheduledMessage) => void
  onDelete: (id: string) => void
}) {
  const now = useNow(60_000)
  // In the address (UX Phase 2, 2.7).
  const [tabParam, setTabParam] = useParam('tab')
  const tab: Tab = tabParam === 'scheduled' || tabParam === 'sent' ? tabParam : 'drafts'
  const setTab = (next: Tab) => setTabParam(next === 'drafts' ? '' : next)
  const [custom, setCustom] = useState<string | null>(null)
  const panelId = useId()
  const where = (channelId: string, rootId: string | null) => {
    const place = placeOf(channelId) ?? 'a conversation'
    return rootId ? `a thread in ${place}` : place
  }
  const tabs = [
    { id: 'drafts' as const, label: 'Drafts', count: drafts?.length },
    { id: 'scheduled' as const, label: 'Scheduled', count: scheduled?.length },
    { id: 'sent' as const, label: 'Sent' },
  ]
  const list = tab === 'drafts' ? drafts : tab === 'scheduled' ? scheduled : sent

  const row = (key: string, label: string, link: string, meta: ReactNode, text: string, actions?: ReactNode) => (
    <li key={key}>
      <article aria-label={label} className="group grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 border-b border-sf-line px-4 py-3 hover:bg-sf-surface-hover sm:px-6">
        <Link to={link} className="sf-focus min-w-0 rounded-sf-sm">
          <span className="sf-meta block truncate font-medium text-sf-text-secondary">{label}</span>
          {meta}
          <span className="sf-body mt-0.5 line-clamp-2 block text-sf-text">{text}</span>
        </Link>
        {actions && <span className="flex flex-wrap items-center justify-end gap-1">{actions}</span>}
      </article>
    </li>
  )

  const draftRow = (d: Draft) =>
    row(
      `${d.channelId}:${d.rootId ?? ''}`,
      `Draft in ${where(d.channelId, d.rootId)}`,
      placeLink(ws, d.channelId, d.rootId),
      <span className="sf-meta block text-sf-text-muted tabular-nums">Edited {timeAgo(d.updatedAt, now.getTime())}</span>,
      bodyText(d.body),
      <IconButton label="Delete draft" icon={IconTrash} size="sm" onClick={() => onDeleteDraft(d)} />,
    )

  const scheduledRow = (s: ScheduledMessage) =>
    row(
      s.id,
      `To ${where(s.channelId, s.rootId)}`,
      placeLink(ws, s.channelId, s.rootId),
      s.status === 'failed' ? (
        <span className="sf-meta block text-sf-error">Not sent. {s.failure}</span>
      ) : (
        <span className="sf-meta block text-sf-text-muted tabular-nums">{sendsWhen(s.sendAt, now)}</span>
      ),
      s.content,
      <>
        <Button size="sm" icon={IconSend} onClick={() => onSendNow(s.id)}>
          Send now
        </Button>
        <Menu
          label="Reschedule"
          trigger={(props) => (
            <Button size="sm" icon={IconClock} {...props}>
              Reschedule
            </Button>
          )}
        >
          {schedulePresets(now).map((preset) => (
            <MenuItem key={preset.label} icon={IconClock} onSelect={() => onReschedule(s.id, preset.at)}>
              {preset.label}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem icon={IconCalendarEvent} onSelect={() => setCustom(s.id)}>
            Custom time…
          </MenuItem>
        </Menu>
        <IconButton label="Edit" icon={IconPencil} size="sm" onClick={() => onEdit(s)} />
        <IconButton label="Delete" icon={IconTrash} size="sm" onClick={() => onDelete(s.id)} />
      </>,
    )

  const sentRow = (s: SentItem) =>
    row(
      `${s.target.kind}:${s.target.id}`,
      `To ${where(s.channelId, s.rootId)}`,
      s.rootId ? placeLink(ws, s.channelId, s.rootId) : paths.message(ws, s.channelId, s.target.id),
      <span className="sf-meta block text-sf-text-muted tabular-nums">{formatWhen(s.createdAt, now)}</span>,
      s.text,
    )

  return (
    <section aria-labelledby={`${panelId}-title`} className="flex min-h-0 min-w-0 flex-1 flex-col bg-sf-surface">
      <header className="flex h-sf-header flex-none items-center gap-3 ps-4 pe-4 sm:ps-6">
        <h1 id={`${panelId}-title`} className="sf-title min-w-0 flex-1 truncate text-sf-text">
          Drafts & sent
        </h1>
      </header>
      <Tabs label="Drafts & sent" tabs={tabs} tab={tab} onChange={setTab} panelId={panelId} />
      <div id={panelId} role="tabpanel" aria-label={tabs.find((t) => t.id === tab)!.label} aria-busy={!list && !error} className="min-h-0 flex-1 overflow-y-auto pb-6">
        {tab === 'scheduled' && <p className="sf-small m-0 px-4 pt-3 text-sf-text-muted sm:px-6">Times are in {zone}.</p>}
        {!list && error ? (
          <div className="flex flex-col items-start gap-3 px-6 py-8">
            <p className="sf-ui text-sf-text-secondary">This didn’t load.</p>
            <Button size="sm" onClick={onRetry} disabled={retrying}>
              {retrying ? 'Trying…' : 'Try again'}
            </Button>
          </div>
        ) : !list ? (
          <ul aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="mx-6 my-3 h-12 animate-pulse rounded-sf-md bg-sf-surface-hover" />
            ))}
          </ul>
        ) : list.length === 0 ? (
          <p className={clsx('sf-ui px-6 text-sf-text-muted', tab === 'scheduled' ? 'py-4' : 'py-8')}>{EMPTY[tab]}</p>
        ) : (
          <ul aria-label={tabs.find((t) => t.id === tab)!.label}>
            {tab === 'drafts' ? drafts!.map(draftRow) : tab === 'scheduled' ? scheduled!.map(scheduledRow) : sent!.map(sentRow)}
          </ul>
        )}
      </div>
      <CustomReminder
        open={custom !== null}
        onClose={() => setCustom(null)}
        onPick={(at) => custom && onReschedule(custom, at)}
        title="Reschedule"
        action="Reschedule"
      />
    </section>
  )
}
