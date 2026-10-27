import type { ChatMessage, NewTicket } from '@/api/types'

const MAX_TITLE = 120

/** A new task from a chat message: its first line as the title, the whole text as the description (mentions read as names). */
export function taskDraft(message: ChatMessage, projectId: string): Pick<NewTicket, 'projectId' | 'title' | 'description' | 'linkedChannelId' | 'linkedMessageId'> {
  const plain = message.content.replace(/@\[([^\]]+)\]\([\w-]+\)/g, '@$1')
  const first = plain.trim().split('\n')[0]!.trim()
  return { projectId, title: first.slice(0, MAX_TITLE), description: plain.trim(), linkedChannelId: message.channelId, linkedMessageId: message.id }
}
