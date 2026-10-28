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
  // Under messages(), so every live update about the channel reaches it too.
  messagesFrom: (channelId: string, seq: number) => ['chat', 'messages', channelId, 'from', seq],
  linkPreview: (url: string) => ['chat', 'link-preview', url],
  draftsAll: () => ['chat', 'drafts'],
  drafts: (workspaceId: string) => ['chat', 'drafts', workspaceId],
  jumpTarget: (channelId: string, since: string | null) => ['chat', 'jump', channelId, since ?? 'beginning'],
  message: (id: string) => ['chat', 'message', id],
  replies: (messageId: string) => ['chat', 'replies', messageId],
  projects: (workspaceId: string) => ['tickets', 'projects', workspaceId],
  archivedProjects: (workspaceId: string) => ['tickets', 'projects', workspaceId, 'archived'],
  projectByKey: (workspaceId: string, key: string) => ['tickets', 'project', workspaceId, key],
  sprints: (projectId: string) => ['tickets', 'sprints', projectId],
  tickets: (projectId: string) => ['tickets', 'list', projectId],
  archivedTickets: (projectId: string) => ['tickets', 'archived', projectId],
  taskHistory: (key: string) => ['history', 'task', key],
  projectHistory: (projectId: string) => ['history', 'project', projectId],
  ticket: (key: string) => ['tickets', 'one', key],
  taskRefsAll: () => ['tickets', 'refs'],                // prefix of every chip lookup
  taskRefs: (keys: string[]) => ['tickets', 'refs', ...keys],
  phases: (projectId: string) => ['projects', 'phases', projectId],
  deliverables: (projectId: string) => ['projects', 'deliverables', projectId],
  files: (projectId: string) => ['projects', 'files', projectId],
  teams: (workspaceId: string) => ['teams', workspaceId],
  time: (projectId: string) => ['projects', 'time', projectId],
  timeAll: () => ['projects', 'time'],                    // prefix of every project's time
  myDay: () => ['time', 'me'],
  timeReport: (workspaceId: string, days: number, projectId = '') => ['time', 'report', workspaceId, days, projectId],
  rates: () => ['rates'],
  comments: (taskKey: string) => ['comments', taskKey],
  mentions: () => ['mentions', 'me'],
  activityAll: () => ['activity'],                       // prefix of every workspace's Activity
  activity: (workspaceId: string) => ['activity', workspaceId],
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
      // Project summaries (progress, overdue) and the dashboard are worked out from tasks too.
      return [
        qk.tickets(event.ticket.projectId), qk.archivedTickets(event.ticket.projectId), qk.ticket(event.ticket.key), qk.taskHistory(event.ticket.key), qk.projectHistory(event.ticket.projectId),
        ['tickets', 'projects'], ['tickets', 'project'], ['dashboard'], qk.taskRefsAll(),
      ]
    case 'timeLogged':
      // Hours change everywhere: my day, every task and project summary (under 'tickets'), and the Time tabs.
      return [qk.myDay(), ['tickets'], qk.timeAll(), ['dashboard'], ['time', 'report']]
    case 'messageChanged':
      return [qk.messages(event.channelId), qk.message(event.messageId), qk.replies(event.messageId), qk.mentions(), qk.activityAll()]
    case 'projectChanged':
      // Summaries and task lists live under 'tickets'; phases, deliverables and project time under 'projects'.
      return [['tickets'], ['projects'], ['dashboard'], qk.projectHistory(event.projectId)]
    case 'channelChanged':
      // Leaving, removal, archiving and privacy decide what my mentions and Activity may show.
      return [qk.channelsAll(), qk.channel(event.channelId), qk.mentions(), qk.activityAll()]
    case 'commentAdded':
      return [qk.comments(event.taskKey), qk.mentions(), qk.activityAll(), qk.taskHistory(event.taskKey), qk.projectHistory(event.projectId)]
    case 'ratesChanged':
      // Cost is worked out from rates on every read: the report, the dashboard and the Time tabs.
      return [qk.rates(), ['time', 'report'], ['dashboard'], qk.timeAll(), ['tickets']]
    case 'filesChanged':
      return [qk.files(event.projectId)]
    case 'draftChanged':
      return [qk.draftsAll()]
    case 'readChanged':
      return [qk.channelsAll(), qk.mentions(), qk.activityAll(), ...(event.channelId ? [qk.channel(event.channelId)] : [])]
    case 'notificationCreated':
      // Something was stored for me, or a new message or reply mentions me (spec 6.12).
      return [qk.activityAll()]
    case 'dataReset':
      // The empty key matches every query.
      return [[]]
    case 'userTyping':
      return []
  }
}
