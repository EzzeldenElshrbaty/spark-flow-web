import type { QueryKey } from '@tanstack/react-query'
import type { RealtimeEvent } from '@/lib/realtime'

/** Every query key in one place, so a live update can name exactly what it makes stale. */
export const qk = {
  workspaces: () => ['workspaces'],
  me: () => ['users', 'me'],
  users: (workspaceId: string) => ['users', workspaceId],
  channelsAll: () => ['chat', 'channels'],               // prefix of every workspace's channel list
  channels: (workspaceId: string) => ['chat', 'channels', workspaceId],
  channel: (id: string) => ['chat', 'channel', id],
  messages: (channelId: string) => ['chat', 'messages', channelId],
  message: (id: string) => ['chat', 'message', id],
  replies: (messageId: string) => ['chat', 'replies', messageId],
  projects: (workspaceId: string) => ['tickets', 'projects', workspaceId],
  sprints: (projectId: string) => ['tickets', 'sprints', projectId],
  tickets: (projectId: string) => ['tickets', 'list', projectId],
  ticket: (key: string) => ['tickets', 'one', key],
  phases: (projectId: string) => ['projects', 'phases', projectId],
  deliverables: (projectId: string) => ['projects', 'deliverables', projectId],
  files: (projectId: string) => ['projects', 'files', projectId],
  teams: (workspaceId: string) => ['teams', workspaceId],
  time: (projectId: string) => ['projects', 'time', projectId],
} as const

/** The queries a live update makes stale. Typing is not data, so it touches none. */
export function keysForEvent(event: RealtimeEvent): QueryKey[] {
  switch (event.type) {
    case 'messageReceived': {
      const { channelId } = event.message
      return [qk.messages(channelId), qk.channelsAll(), qk.channel(channelId)]
    }
    case 'replyReceived': {
      const { channelId, messageId } = event.reply
      return [qk.replies(messageId), qk.message(messageId), qk.messages(channelId), qk.channelsAll(), qk.channel(channelId)]
    }
    case 'ticketUpdated':
      return [qk.tickets(event.ticket.projectId), qk.ticket(event.ticket.key)]
    case 'userTyping':
      return []
  }
}
