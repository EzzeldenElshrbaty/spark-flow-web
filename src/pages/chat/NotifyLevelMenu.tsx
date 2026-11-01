import { IconBell, IconBellOff, IconDeviceDesktop, IconMoon } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import type { Channel, NotifyLevel } from '@/api/types'
import { Menu, MenuHeading, MenuItem, MenuSeparator, type MenuTriggerProps } from '@/components/sf/Menu'

/** The three levels (spec 6.11), in the menu's order. */
export const NOTIFY_LEVELS: { level: NotifyLevel; label: string }[] = [
  { level: 'all', label: 'All new messages' },
  { level: 'mentions', label: 'Mentions and keywords' },
  { level: 'none', label: 'Nothing' },
]

/**
 * The way to my Preferences from the bell (spec 6.11: "Desktop, mobile and email…" and the note on Do Not Disturb):
 * `dndEnd` is when Do Not Disturb ends while it's on.
 */
export type PreferencesLink = { dndEnd: string | null; onOpen: () => void; /** My default level, for "Default (…)" (slice AA). */ defaultLevel?: NotifyLevel }

/** A level's name as the menu writes it. */
export const levelLabel = (level: NotifyLevel) => NOTIFY_LEVELS.find((l) => l.level === level)!.label

/**
 * "Notify me about" (spec 6.11): "Default (…)" to follow my default (slice AA), the three levels, the one that
 * applies checked, then Mute, then the way to Preferences. The header bell and the Channel details header open it from
 * their own triggers. Picking what's already set sends nothing; `null` goes back to the default.
 */
export function NotifyLevelMenu({
  channel,
  label,
  trigger,
  preferences,
  onNotifyLevel,
  onMute,
}: {
  channel: Pick<Channel, 'kind' | 'notifyLevel' | 'notifyLevelOwn' | 'muted'>
  label: string
  trigger: (props: MenuTriggerProps) => ReactNode
  preferences?: PreferencesLink
  onNotifyLevel: (level: NotifyLevel | null) => void
  onMute: (muted: boolean) => void
}) {
  return (
    <Menu label={label} trigger={trigger}>
      <NotifyLevelItems channel={channel} preferences={preferences} onNotifyLevel={onNotifyLevel} onMute={onMute} />
    </Menu>
  )
}

/** The levels, Mute and Preferences, for the bell's menu and for Notification settings in the channel's more menu. */
export function NotifyLevelItems({
  channel,
  preferences,
  onNotifyLevel,
  onMute,
}: {
  channel: Pick<Channel, 'kind' | 'notifyLevel' | 'notifyLevelOwn' | 'muted'>
  preferences?: PreferencesLink
  onNotifyLevel: (level: NotifyLevel | null) => void
  onMute: (muted: boolean) => void
}) {
  const noun = channel.kind === 'channel' ? 'channel' : 'conversation'
  // The level the channel follows without its own: a DM, every message; a channel, my default.
  const fallback = !channel.notifyLevelOwn ? channel.notifyLevel : channel.kind === 'dm' ? 'all' : preferences?.defaultLevel
  return (
    <>
      <MenuHeading>Notify me about</MenuHeading>
      <MenuItem checked={!channel.notifyLevelOwn} onSelect={() => channel.notifyLevelOwn && onNotifyLevel(null)}>
        {fallback ? `Default (${levelLabel(fallback)})` : 'Default'}
      </MenuItem>
      {NOTIFY_LEVELS.map(({ level, label: name }) => (
        <MenuItem key={level} checked={channel.notifyLevelOwn && channel.notifyLevel === level} onSelect={() => (!channel.notifyLevelOwn || level !== channel.notifyLevel) && onNotifyLevel(level)}>
          {name}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem icon={channel.muted ? IconBell : IconBellOff} onSelect={() => onMute(!channel.muted)}>
        {channel.muted ? `Unmute ${noun}` : `Mute ${noun}`}
      </MenuItem>
      {/* As the spec lays it out: Mute and "Desktop, mobile and email…" together, then the Do Not Disturb note. */}
      {preferences && (
        <MenuItem icon={IconDeviceDesktop} onSelect={preferences.onOpen}>
          Desktop, mobile and email…
        </MenuItem>
      )}
      {preferences?.dndEnd && (
        <>
          <MenuSeparator />
          <MenuItem icon={IconMoon} onSelect={preferences.onOpen}>
            Do Not Disturb until {preferences.dndEnd}
          </MenuItem>
        </>
      )}
    </>
  )
}
