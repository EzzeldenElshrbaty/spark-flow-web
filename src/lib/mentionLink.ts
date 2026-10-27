import type { MentionItem } from '@/api/types'
import { paths } from '@/lib/paths'

/**
 * Where a mention opens, in the mention's own workspace: a message or reply in its thread beside the channel, a comment
 * on its task in the project's Tasks tab (a task key starts with its project's key). Home here when it can't be found.
 */
export function mentionLink(item: MentionItem, workspaces: { id: string; slug: string }[], currentSlug: string): string {
  const ws = workspaces.find((w) => w.id === item.workspaceId)?.slug
  if (!ws) return paths.home(currentSlug)
  if (item.source === 'comment') {
    if (!item.taskKey) return paths.home(currentSlug)
    return `${paths.project(ws, item.taskKey.split('-')[0]!, 'tasks')}?ticket=${encodeURIComponent(item.taskKey)}`
  }
  if (!item.channelId || !item.messageId) return paths.home(currentSlug)
  return `${paths.channel(ws, item.channelId)}?thread=${encodeURIComponent(item.messageId)}`
}
