import type { ChatMessage, NewTicket } from '@/api/types'
import { textBody } from '@/lib/messageBody'

const MAX_TITLE = 120

/** Whether a chat message can become a task: not a card (a comment, a task event, a sprint), nor a thread reply also sent to the chat. */
export const canMakeTask = (message: ChatMessage) => !message.taskEvent && !message.sprintEvent && !message.commentId && !message.broadcast

/** A new task from a chat message: its first line as the title, the whole text as the description (mentions read as names). */
export function taskDraft(message: ChatMessage, projectId: string): Pick<NewTicket, 'projectId' | 'title' | 'descriptionBody' | 'linkedChannelId' | 'linkedMessageId'> {
  const plain = message.content.replace(/@\[([^\]]+)\]\([\w-]+\)/g, '@$1')
  const first = plain.trim().split('\n')[0]!.trim()
  return { projectId, title: first.slice(0, MAX_TITLE), descriptionBody: textBody(plain.trim()), linkedChannelId: message.channelId, linkedMessageId: message.id }
}
