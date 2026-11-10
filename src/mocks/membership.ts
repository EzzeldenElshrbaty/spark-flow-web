import type { ChannelKind, ChannelMemberState, NotifyLevel, Preferences } from '@/api/types'
import type { DbData, StoredMemberState } from './db'

/** Preferences before anyone changes them (spec 6.11): today's levels, nothing paused, a daily digest. */
export const DEFAULT_PREFERENCES: Preferences = {
  defaultLevel: 'mentions',
  keywords: [],
  desktop: false,
  push: true,
  emailDigest: 'daily',
  dndUntil: null,
  // Spark's working week is Sunday to Thursday (report weeks start on Sunday).
  dndSchedule: { on: false, from: '18:00', to: '09:00', days: [0, 1, 2, 3, 4], tz: 'Africa/Cairo' },
  singleKeyShortcuts: true,
}

/** This person's preferences, or the defaults. */
export function prefsOf(data: DbData, userId: string): Preferences {
  const stored = data.notificationPrefs.find((p) => p.id === userId)
  if (!stored) return structuredClone(DEFAULT_PREFERENCES)
  const { id: _id, keywordsSince: _since, ...prefs } = stored
  return prefs
}

/** When each of this person's keywords was added (lowercased): a keyword counts only from then. */
export function keywordsSinceOf(data: DbData, userId: string): Record<string, string> {
  return data.notificationPrefs.find((p) => p.id === userId)?.keywordsSince ?? {}
}

/** A state nobody has touched: nothing read, starred or muted, and the level following the default. */
export const freshState = (): StoredMemberState => ({ lastReadSeq: 0, starred: false, muted: false, notifyLevel: null })

/** Whether this person may read a channel: a private one (or a DM) only its members. */
export const canRead = (data: DbData, channelId: string, userId: string) => {
  const channel = data.channels.find((c) => c.id === channelId)
  return Boolean(channel) && (!channel!.isPrivate || channel!.memberIds.includes(userId))
}

/** The level a channel follows without one of its own (spec 6.11): a DM, every message; a channel, my default. */
export const defaultLevelFor = (data: DbData, userId: string, kind: ChannelKind | undefined): NotifyLevel => (kind === 'dm' ? 'all' : prefsOf(data, userId).defaultLevel)

/** A stored state as it applies: its own level, else the default for that kind of channel. */
export function applied(data: DbData, userId: string, kind: ChannelKind | undefined, state: StoredMemberState): ChannelMemberState {
  return { ...state, notifyLevel: state.notifyLevel ?? defaultLevelFor(data, userId, kind), notifyLevelOwn: state.notifyLevel !== null }
}

/** This person's state in a channel as it applies (spec 6.11), or the fresh one. */
export function stateOf(data: DbData, userId: string, channelId: string): ChannelMemberState {
  const kind = data.channels.find((c) => c.id === channelId)?.kind
  return applied(data, userId, kind, data.channelState[userId]?.[channelId] ?? freshState())
}

/** Channels this person hears nothing from (spec 6.11), set so or by default: they stay out of Activity and the bell. */
export function silenced(data: DbData, userId: string): (channelId: string | null) => boolean {
  return (channelId) => Boolean(channelId) && stateOf(data, userId, channelId!).notifyLevel === 'none'
}
