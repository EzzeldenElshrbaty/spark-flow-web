import type { ActivityItem, ActivityItemKind } from '@/api/types'
import { paths } from '@/lib/paths'

export type ActivityTab = 'all' | ActivityItemKind

/** Activity's tabs (spec 6.12); Reminders comes with reminders (Phase 3). */
export const ACTIVITY_TABS: { id: ActivityTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'mention', label: 'Mentions' },
  { id: 'reaction', label: 'Reactions' },
  { id: 'thread', label: 'Threads' },
]

/** A tab's rows, newest first as they come: the unread ones, then the read ones under "Earlier" (none with Unread only). */
export function shownActivity(items: ActivityItem[], tab: ActivityTab, unreadOnly: boolean) {
  const inTab = items.filter((item) => tab === 'all' || item.kind === tab)
  return { unread: inTab.filter((item) => !item.read), earlier: unreadOnly ? [] : inTab.filter((item) => item.read) }
}

/** The line above a row's text: what happened, and where (`#backend`, a direct message; null when it can't be found). */
export function activityKind(item: ActivityItem, place: string | null): string {
  const where = item.taskKey && !item.channelId ? ` on ${item.taskKey}` : place ? ` in ${place}` : ''
  if (item.kind === 'reaction') return `Reacted ${item.emoji ?? ''} to your ${item.replyId ? 'reply' : 'message'}${where}`
  if (item.kind === 'thread') return `Replied in a thread you follow${where}`
  return `Mentioned you${where}`
}

/**
 * Where opening a row goes: a message opens on it in its channel, a reply opens its thread beside the channel, and a
 * comment opens its task in the project's Tasks tab (a task key starts with its project's key). Activity else.
 */
export function activityLink(item: ActivityItem, ws: string): string {
  if (item.taskKey && !item.channelId) return `${paths.project(ws, item.taskKey.split('-')[0]!, 'tasks')}?ticket=${encodeURIComponent(item.taskKey)}`
  if (!item.channelId || !item.messageId) return paths.activity(ws)
  if (item.replyId) return `${paths.channel(ws, item.channelId)}?thread=${encodeURIComponent(item.messageId)}`
  return paths.message(ws, item.channelId, item.messageId)
}
