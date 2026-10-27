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
  archivedTickets: (projectId: string) => ['tickets', 'archived', projectId],
  taskHistory: (key: string) => ['history', 'task', key],
  projectHistory: (projectId: string) => ['history', 'project', projectId],
  ticket: (key: string) => ['tickets', 'one', key],
  phases: (projectId: string) => ['projects', 'phases', projectId],
  deliverables: (projectId: string) => ['projects', 'deliverables', projectId],
  files: (projectId: string) => ['projects', 'files', projectId],
  teams: (workspaceId: string) => ['teams', workspaceId],
  time: (projectId: string) => ['projects', 'time', projectId],
  timeAll: () => ['projects', 'time'],                    // prefix of every project's time
  myDay: () => ['time', 'me'],
  timeReport: (workspaceId: string, days: number) => ['time', 'report', workspaceId, days],
  rates: () => ['rates'],
  comments: (taskKey: string) => ['comments', taskKey],
  mentions: () => ['mentions', 'me'],
  dashboard: (workspaceId: string) => ['dashboard', workspaceId],
  checkedIn: (workspaceId: string) => ['dashboard', 'checked-in', workspaceId],
} as const

/** The queries a live update makes stale. Typing is not data, so it touches none. */
export function keysForEvent(event: RealtimeEvent): QueryKey[] {
  switch (event.type) {
    case 'messageReceived': {
      const { channelId } = event.message
      return [qk.messages(channelId), qk.channelsAll(), qk.channel(channelId), qk.mentions()]
    }
    case 'replyReceived': {
      const { channelId, messageId } = event.reply
      return [qk.replies(messageId), qk.message(messageId), qk.messages(channelId), qk.channelsAll(), qk.channel(channelId), qk.mentions()]
    }
    case 'ticketUpdated':
      return [qk.tickets(event.ticket.projectId), qk.archivedTickets(event.ticket.projectId), qk.ticket(event.ticket.key), qk.taskHistory(event.ticket.key), qk.projectHistory(event.ticket.projectId)]
    case 'timeLogged':
      // Hours change everywhere: my day, every task and project summary (under 'tickets'), and the Time tabs.
      return [qk.myDay(), ['tickets'], qk.timeAll(), ['dashboard'], ['time', 'report']]
    case 'messageChanged':
      return [qk.messages(event.channelId), qk.message(event.messageId), qk.replies(event.messageId), qk.mentions()]
    case 'projectChanged':
      // Summaries and task lists live under 'tickets'; phases, deliverables and project time under 'projects'.
      return [['tickets'], ['projects'], ['dashboard'], qk.projectHistory(event.projectId)]
    case 'channelChanged':
      return [qk.channelsAll(), qk.channel(event.channelId)]
    case 'commentAdded':
      return [qk.comments(event.taskKey), qk.mentions(), qk.taskHistory(event.taskKey), qk.projectHistory(event.projectId)]
    case 'userTyping':
      return []
  }
}
