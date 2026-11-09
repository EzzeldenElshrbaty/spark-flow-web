import type { MentionItem } from '@/api/types'
import { paths } from '@/lib/paths'

/**
 * Where a mention opens, in the mention's own workspace: a message or reply in its thread beside the channel, a comment
 * on its task in the project's Tasks tab (a task key starts with its project's key). Home here when it can't be found.
 */
export function mentionLink(item: MentionItem, workspaces: { id: string; slug: string }[], currentSlug: string): string {
  const ws = workspaces.find((w) => w.id === item.workspaceId)?.slug
  if (!ws) return paths.home(currentSlug)
  // A comment, or task news for me (UX Phase 2, 2.3): the task, on its project's Tasks tab.
  if (item.source === 'comment' || item.source === 'assigned' || item.source === 'status' || item.source === 'taskComment') {
    if (!item.taskKey) return paths.home(currentSlug)
    return `${paths.project(ws, item.taskKey.split('-')[0]!, 'tasks')}?ticket=${encodeURIComponent(item.taskKey)}`
  }
  if (!item.channelId || !item.messageId) return paths.home(currentSlug)
  return `${paths.channel(ws, item.channelId)}?thread=${encodeURIComponent(item.messageId)}`
}

/** What a bell item says happened (UX Phase 2, 2.3): a mention, or what someone did to a task of mine. */
export function notificationLine(item: Pick<MentionItem, 'source' | 'authorName' | 'taskKey' | 'statusLabel'>): string {
  const who = item.authorName
  if (item.source === 'assigned') return `${who} assigned you ${item.taskKey}`
  if (item.source === 'status') return item.statusLabel ? `${who} moved ${item.taskKey} to ${item.statusLabel}` : `${who} moved ${item.taskKey}`
  if (item.source === 'taskComment') return `${who} commented on ${item.taskKey}`
  return `${who} mentioned you`
}
