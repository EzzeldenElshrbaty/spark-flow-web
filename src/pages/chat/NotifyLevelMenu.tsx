import { IconBell, IconBellOff } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import type { Channel, NotifyLevel } from '@/api/types'
import { Menu, MenuHeading, MenuItem, MenuSeparator, type MenuTriggerProps } from '@/components/sf/Menu'

/** The three levels (spec 6.11), in the menu's order. */
export const NOTIFY_LEVELS: { level: NotifyLevel; label: string }[] = [
  { level: 'all', label: 'All new messages' },
  { level: 'mentions', label: 'Mentions and keywords' },
  { level: 'none', label: 'Nothing' },
]

/** A level's name as the menu writes it. */
export const levelLabel = (level: NotifyLevel) => NOTIFY_LEVELS.find((l) => l.level === level)!.label

/**
 * "Notify me about" (spec 6.11): the three levels, the channel's own checked, then Mute. The header bell and the
 * Channel details header open it from their own triggers. Picking the level already set sends nothing.
 */
export function NotifyLevelMenu({
  channel,
  label,
  trigger,
  onNotifyLevel,
  onMute,
}: {
  channel: Pick<Channel, 'kind' | 'notifyLevel' | 'muted'>
  label: string
  trigger: (props: MenuTriggerProps) => ReactNode
  onNotifyLevel: (level: NotifyLevel) => void
  onMute: (muted: boolean) => void
}) {
  const noun = channel.kind === 'channel' ? 'channel' : 'conversation'
  return (
    <Menu label={label} trigger={trigger}>
      <MenuHeading>Notify me about</MenuHeading>
      {NOTIFY_LEVELS.map(({ level, label: name }) => (
        <MenuItem key={level} checked={channel.notifyLevel === level} onSelect={() => level !== channel.notifyLevel && onNotifyLevel(level)}>
          {name}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem icon={channel.muted ? IconBell : IconBellOff} onSelect={() => onMute(!channel.muted)}>
        {channel.muted ? `Unmute ${noun}` : `Mute ${noun}`}
      </MenuItem>
    </Menu>
  )
}
