import type { ChannelTask } from '@/api/types'

type Row = Record<string, unknown>
const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]).filter(Boolean) : [])

/**
 * Channel task lists from what tasks already say (chat spec 6.14, task list §4.2): a live task made from a channel's
 * message is on that channel's list, added by whoever made it, when it was made. A DM, or a channel of another
 * workspace, has none. Plain data in and out, so the migration and the seed share it.
 */
export function channelTasksFrom(doc: { projects?: unknown; channels?: unknown; tickets?: unknown }): ChannelTask[] {
  const workspaceOf = new Map(rows(doc.projects).map((p) => [p.id, p.workspaceId]))
  const channels = new Map(rows(doc.channels).map((c) => [c.id, c]))
  return rows(doc.tickets).flatMap((t) => {
    const channel = typeof t.linkedChannelId === 'string' ? channels.get(t.linkedChannelId) : undefined
    if (!channel || channel.kind !== 'channel' || t.archivedAt) return []
    if (channel.workspaceId !== workspaceOf.get(t.projectId)) return []
    return [{ id: `ct-${String(t.id)}`, channelId: String(channel.id), taskId: String(t.id), addedBy: String(t.reporterId), addedAt: String(t.createdAt) }]
  })
}
