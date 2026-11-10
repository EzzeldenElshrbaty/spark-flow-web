import { IconAlarm, IconArchive, IconArrowBackUp, IconDotsVertical, IconTrash } from '@tabler/icons-react'
import clsx from 'clsx'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import type { SavedStatus, SavedView as Saved } from '@/api/types'
import { Avatar } from '@/components/Avatar'
import { Button, IconButton } from '@/components/sf/Button'
import { Menu, MenuItem } from '@/components/sf/Menu'
import { Tabs } from '@/components/sf/Tabs'
import { Checkbox } from '@/components/sf/Toggle'
import { isFlowbot } from '@/lib/flowbot'
import { formatWhen } from '@/lib/format'
import { paths } from '@/lib/paths'
import { dueSoon } from '@/lib/remindTimes'
import { useNow } from '@/lib/useNow'
import { CustomReminder, RemindItems } from '@/pages/chat/saved/RemindMenu'
import { useParam } from '@/lib/searchParams'
import { useDocumentTitle } from '@/lib/useDocumentTitle'

type Patch = { status?: SavedStatus; remindAt?: string | null }

/** The row's buttons are 44px touch targets on phones (spec 6.16). */
const PHONE_44 = 'max-md:size-11'

const TAB_LABELS: Record<SavedStatus, string> = { inProgress: 'In progress', archived: 'Archived', completed: 'Completed' }
const EMPTY: Record<SavedStatus, string> = {
  inProgress: 'Nothing saved yet. Save a message with S or its ⋯ menu.',
  archived: 'Nothing archived.',
  completed: 'Nothing completed yet.',
}

/** Where a saved row opens: the message in its channel, or a reply's thread beside it. */
export function savedLink(item: Saved, ws: string): string | null {
  if (item.gone || !item.channelId) return null
  if (item.target.kind === 'note') return paths.channel(ws, item.channelId)
  if (item.target.kind === 'file' && !item.rootId) return item.messageId ? paths.message(ws, item.channelId, item.messageId) : paths.channel(ws, item.channelId)
  if (item.rootId) return `${paths.channel(ws, item.channelId)}?thread=${encodeURIComponent(item.rootId)}`
  return paths.message(ws, item.channelId, item.target.id)
}

/**
 * The Saved view (spec 6.12): a 52px header, the tabs In progress (with its count), Archived and Completed, and a row
 * per item: complete checkbox, avatar, source line, text and the reminder time (accent within 24 hours). Hover or
 * focus shows Change reminder, Archive and More (Remove from Saved); phones and tablets show them always.
 */
export function SavedView({
  items,
  ws,
  placeOf,
  error,
  retrying,
  onRetry,
  onUpdate,
  onRemove,
}: {
  /** Undefined while it loads. */
  items: Saved[] | undefined
  ws: string
  /** A channel's name as the row says it: `#backend`, "a direct message", or null when it can't be found. */
  placeOf: (channelId: string | null) => string | null
  error: boolean
  retrying: boolean
  onRetry: () => void
  onUpdate: (id: string, patch: Patch) => void
  onRemove: (id: string) => void
}) {
  useDocumentTitle(['Saved'])
  const now = useNow(60_000)
  // In the address (UX Phase 2, 2.7).
  const [tabParam, setTabParam] = useParam('tab')
  const tab: SavedStatus = tabParam === 'archived' || tabParam === 'completed' ? tabParam : 'inProgress'
  const setTab = (next: SavedStatus) => setTabParam(next === 'inProgress' ? '' : next)
  const [custom, setCustom] = useState<string | null>(null)
  const panelId = useId()
  const shown = items?.filter((item) => item.status === tab)
  const inProgress = items?.filter((item) => item.status === 'inProgress').length
  const tabs = (Object.keys(TAB_LABELS) as SavedStatus[]).map((id) => ({ id, label: TAB_LABELS[id], count: id === 'inProgress' ? inProgress : undefined }))

  const row = (item: Saved) => {
    const place = placeOf(item.channelId) ?? 'a conversation'
    const note = item.target.kind === 'note'
    const isFile = item.target.kind === 'file'
    const source = note
      ? `Reminder set in ${place}`
      : isFile
        ? item.authorName ? `File from ${item.authorName} in ${place}` : 'Saved file'
        : item.authorName ? `${item.authorName} in ${place}` : 'Saved message'
    const link = savedLink(item, ws)
    const completed = item.status === 'completed'
    const body = (
      <>
        <span className="sf-meta block truncate font-medium text-sf-text-secondary">{source}</span>
        <span className={clsx('sf-body mt-0.5 line-clamp-2 block', item.gone ? 'text-sf-text-muted italic' : 'text-sf-text')}>
          {item.gone === 'deleted' ? 'This message was deleted.' : item.gone === 'hidden' ? 'You can no longer see this message.' : item.text}
        </span>
        {item.remindAt && (
          <span className={clsx('sf-meta mt-1 block tabular-nums', dueSoon(item.remindAt, now) ? 'text-sf-accent' : 'text-sf-text-muted')}>
            Reminder {formatWhen(item.remindAt, now)}
          </span>
        )}
      </>
    )
    return (
      <li key={item.id}>
        <article
          aria-label={source}
          className="group grid grid-cols-[16px_var(--size-avatar)_minmax(0,1fr)_auto] items-start gap-x-3 border-b border-sf-line px-4 py-3 hover:bg-sf-surface-hover sm:px-6"
        >
          <span className="mt-2.5">
            <Checkbox checked={completed} onChange={(on) => onUpdate(item.id, { status: on ? 'completed' : 'inProgress' })}>
              <span className="sr-only">{completed ? 'Mark not complete' : 'Mark complete'}</span>
            </Checkbox>
          </span>
          {item.authorId ? <Avatar id={item.authorId} name={item.authorName ?? ''} app={isFlowbot(item.authorId)} decorative /> : <span />}
          {link ? (
            <Link to={link} aria-label={note ? `Open ${place}: ${item.text}` : isFile ? `View file: ${item.text}` : `View message: ${item.text}`} className="sf-focus min-w-0 rounded-sf-sm">
              {body}
            </Link>
          ) : (
            <span className="min-w-0">{body}</span>
          )}
          <span className="flex items-center gap-0.5 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0">
            {item.status !== 'completed' && (
              <Menu
                label={item.remindAt ? 'Change reminder' : 'Set reminder'}
                trigger={(props) => <IconButton label={item.remindAt ? 'Change reminder' : 'Set reminder'} icon={IconAlarm} size="sm" className={PHONE_44} {...props} />}
              >
                <RemindItems
                  onPick={(at) => onUpdate(item.id, { remindAt: at.toISOString() })}
                  onCustom={() => setCustom(item.id)}
                  onClear={item.remindAt ? () => onUpdate(item.id, { remindAt: null }) : undefined}
                />
              </Menu>
            )}
            {item.status === 'archived' ? (
              <IconButton label="Move to In progress" icon={IconArrowBackUp} size="sm" className={PHONE_44} onClick={() => onUpdate(item.id, { status: 'inProgress' })} />
            ) : (
              <IconButton label="Archive" icon={IconArchive} size="sm" className={PHONE_44} onClick={() => onUpdate(item.id, { status: 'archived' })} />
            )}
            <Menu label="Saved item actions" trigger={(props) => <IconButton label="More actions" icon={IconDotsVertical} size="sm" className={PHONE_44} {...props} />}>
              <MenuItem icon={IconTrash} danger onSelect={() => onRemove(item.id)}>
                Remove from Saved
              </MenuItem>
            </Menu>
          </span>
        </article>
      </li>
    )
  }

  return (
    <section aria-labelledby={`${panelId}-title`} className="flex min-h-0 min-w-0 flex-1 flex-col bg-sf-surface">
      <header className="flex h-sf-header flex-none items-center gap-3 ps-4 pe-4 sm:ps-6">
        <h1 id={`${panelId}-title`} className="sf-title min-w-0 flex-1 truncate text-sf-text">
          Saved
        </h1>
      </header>
      <Tabs label="Saved" tabs={tabs} tab={tab} onChange={setTab} panelId={panelId} />
      <div id={panelId} role="tabpanel" aria-label={TAB_LABELS[tab]} aria-busy={!items && !error} className="min-h-0 flex-1 overflow-y-auto pb-6">
        {!shown && error ? (
          <div className="flex flex-col items-start gap-3 px-6 py-8">
            <p className="sf-ui text-sf-text-secondary">Saved didn’t load.</p>
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
        ) : shown.length === 0 ? (
          <p className="sf-ui px-6 py-8 text-sf-text-muted">{EMPTY[tab]}</p>
        ) : (
          <ul aria-label={TAB_LABELS[tab]}>{shown.map(row)}</ul>
        )}
      </div>
      <CustomReminder open={custom !== null} onClose={() => setCustom(null)} onPick={(at) => custom && onUpdate(custom, { remindAt: at.toISOString() })} />
    </section>
  )
}
