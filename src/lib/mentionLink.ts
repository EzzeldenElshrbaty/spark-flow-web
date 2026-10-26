import type { MentionItem } from '@/api/types'
import { paths } from '@/lib/paths'

/** Where a mention opens: its channel, its thread beside the channel, or its task on the project's Tasks tab. */
export function mentionLink(item: MentionItem, ws: string, projects: { id: string; key: string }[]): string {
  if (item.source === 'comment') {
    const project = projects.find((p) => p.id === item.projectId)
    if (!project || !item.taskKey) return paths.home(ws)
    return `${paths.project(ws, project.key, 'tasks')}?ticket=${encodeURIComponent(item.taskKey)}`
  }
  if (!item.channelId) return paths.home(ws)
  const channel = paths.channel(ws, item.channelId)
  return item.source === 'reply' && item.messageId ? `${channel}?thread=${encodeURIComponent(item.messageId)}` : channel
}
