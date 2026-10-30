import { IconFileText, IconFiles, IconMessage, IconPin } from '@tabler/icons-react'
import type { Channel } from '@/api/types'
import { Tabs, type TabItem } from '@/components/sf/Tabs'

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

/** The channel's views under its header (spec 6.1). Bookmarks and + come in a later phase. */
export function ChannelTabs({
  channel,
  tab,
  onChange,
  panelId,
  pinCount,
}: {
  channel: Pick<Channel, 'kind'>
  tab: ChannelTab
  onChange: (tab: ChannelTab) => void
  panelId: string
  /** Pins (count), once the pins are in (spec 6.1). */
  pinCount?: number
}) {
  const tabs = channelTabs(channel).map((t) => (t.id === 'pins' && pinCount ? { ...t, count: pinCount } : t))
  return <Tabs label="Channel views" tabs={tabs} tab={tab} onChange={onChange} panelId={panelId} />
}

const STUBS: Record<Exclude<ChannelTab, 'messages' | 'pins' | 'files'>, string> = {
  page: "This channel's page will live here.",
}

/** What Page shows until it's built (Phase 4). */
export function TabStub({ tab }: { tab: Exclude<ChannelTab, 'messages' | 'pins' | 'files'> }) {
  return <p className="sf-ui px-6 py-8 text-sf-text-muted">{STUBS[tab]}</p>
}
