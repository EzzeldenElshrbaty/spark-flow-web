import { IconFileText, IconFiles, IconMessage, IconPin, type TablerIcon } from '@tabler/icons-react'
import clsx from 'clsx'
import { useRef, type KeyboardEvent } from 'react'
import type { Channel } from '@/api/types'
import { Icon } from '@/components/sf/Icon'

export type ChannelTab = 'messages' | 'files' | 'pins' | 'page'

const ALL: { id: ChannelTab; label: string; icon: TablerIcon }[] = [
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
 * The 40px tab row under the channel header. Arrow keys move to the next tab and open it (one tab stop for the
 * row); Home and End go to the ends. Bookmarks and + come in a later phase.
 */
export function ChannelTabs({ channel, tab, onChange, panelId }: { channel: Pick<Channel, 'kind'>; tab: ChannelTab; onChange: (tab: ChannelTab) => void; panelId: string }) {
  const tabs = channelTabs(channel)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[event.key]
    const next = step !== undefined ? (index + step + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
    if (next === null) return
    event.preventDefault()
    refs.current[next]?.focus()
    onChange(tabs[next].id)
  }
  return (
    <div role="tablist" aria-label="Channel views" className="flex h-sf-tabs flex-none items-stretch gap-1 overflow-x-auto border-b border-sf-line px-4">
      {tabs.map((t, i) => {
        const selected = t.id === tab
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={clsx(
              'sf-focus sf-ui-medium relative inline-flex items-center gap-2 px-2 whitespace-nowrap hover:text-sf-text',
              // The 2px accent rule sits on the row's bottom border (spec 6.1).
              'after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-t-[2px]',
              selected ? 'text-sf-text after:bg-sf-accent-fill' : 'text-sf-text-secondary after:bg-transparent',
            )}
          >
            <Icon icon={t.icon} size={18} />
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

const STUBS: Record<Exclude<ChannelTab, 'messages'>, string> = {
  files: 'Files shared in this channel will be listed here.',
  pins: 'Pinned messages will be listed here.',
  page: "This channel's page will live here.",
}

/** What Files, Pins and Page show until they're built (Phase 3 and 4). */
export function TabStub({ tab }: { tab: Exclude<ChannelTab, 'messages'> }) {
  return <p className="sf-ui px-6 py-8 text-sf-text-muted">{STUBS[tab]}</p>
}
