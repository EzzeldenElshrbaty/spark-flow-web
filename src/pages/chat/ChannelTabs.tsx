import { IconFileText, IconFiles, IconLink, IconMessage, IconPin, IconPlus } from '@tabler/icons-react'
import { useState } from 'react'
import type { Bookmark, Channel } from '@/api/types'
import { IconButton } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Tabs, type TabItem } from '@/components/sf/Tabs'
import { usePhone } from '@/components/sf/usePhone'
import { AddBookmarkDialog } from '@/pages/chat/AddBookmarkDialog'

export type ChannelTab = 'messages' | 'files' | 'pins' | 'page'

const ALL: TabItem<ChannelTab>[] = [
  { id: 'messages', label: 'Messages', icon: IconMessage },
  { id: 'files', label: 'Files', icon: IconFiles },
  { id: 'pins', label: 'Pins', icon: IconPin },
  { id: 'page', label: 'Page', icon: IconFileText },
]

/** The views a channel has (spec 6.1). A conversation has no Page. */
export function channelTabs(channel: Pick<Channel, 'kind'>) {
  return ALL.filter((t) => t.id !== 'page' || channel.kind === 'channel')
}

/** The tab a `?tab=` value opens: one the channel has, else Messages. */
export function tabFromParam(value: string | null, channel: Pick<Channel, 'kind'>): ChannelTab {
  return channelTabs(channel).find((t) => t.id === value)?.id ?? 'messages'
}

/**
 * The channel's views under its header (spec 6.1): Messages, Files, Pins (count), Page; then, after a separator, its
 * bookmarks (links that open in a new tab) and + to add one where I may post. On phones the bookmarks get their own row
 * under the tabs, only when there are some, and Add a bookmark is in Channel actions (follow-up to UX Phase 6).
 */
export function ChannelTabs({
  channel,
  tab,
  onChange,
  panelId,
  pinCount,
  bookmarks = [],
  onAddBookmark,
  hidden = [],
}: {
  channel: Pick<Channel, 'kind'>
  tab: ChannelTab
  onChange: (tab: ChannelTab) => void
  panelId: string
  /** Pins (count), once the pins are in (spec 6.1). */
  pinCount?: number
  bookmarks?: Bookmark[]
  /** + Add a bookmark, where I may post. */
  onAddBookmark?: (bookmark: { title: string; url: string }) => Promise<unknown>
  /** Views left out here (UX Phase 2, 2.5: a project's chat has no Files tab; the project's Files tab has its files). */
  hidden?: readonly ChannelTab[]
}) {
  const [adding, setAdding] = useState(false)
  const phone = usePhone()
  const tabs = channelTabs(channel).filter((t) => !hidden.includes(t.id)).map((t) => (t.id === 'pins' && pinCount ? { ...t, count: pinCount } : t))
  return (
    <div className="flex min-w-0 items-center max-md:flex-col max-md:items-stretch">
      <div className="min-w-0 flex-none">
        <Tabs label="Channel views" tabs={tabs} tab={tab} onChange={onChange} panelId={panelId} />
      </div>
      {(bookmarks.length > 0 || (onAddBookmark && !phone)) && (
        // On phones its own row; its line is an inset shadow, like the tabs', so 44px links fit without it scrolling.
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto border-b border-sf-line pe-3 self-stretch max-md:h-11 max-md:flex-none max-md:border-b-0 max-md:px-4 max-md:shadow-[inset_0_-1px_0_var(--line)]">
          <span aria-hidden className="mx-2 h-4 w-px flex-none bg-sf-line max-md:hidden" />
          {bookmarks.length > 0 && (
            <ul aria-label="Bookmarks" className="m-0 flex list-none items-center gap-1 p-0">
              {bookmarks.map((b) => (
                <li key={b.id} className="flex-none">
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sf-focus sf-ui-medium inline-flex h-8 max-w-48 items-center gap-1 rounded-sf-md px-2 text-sf-text-secondary hover:bg-sf-surface-hover hover:text-sf-text max-md:h-11"
                  >
                    <Icon icon={IconLink} size={16} />
                    <span className="truncate">{b.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {onAddBookmark && !phone && <IconButton label="Add a bookmark" icon={IconPlus} size="sm" tone="muted" onClick={() => setAdding(true)} />}
        </div>
      )}
      {adding && onAddBookmark && <AddBookmarkDialog onAdd={onAddBookmark} onClose={() => setAdding(false)} />}
    </div>
  )
}
