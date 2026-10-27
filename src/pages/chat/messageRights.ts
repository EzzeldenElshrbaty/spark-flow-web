import type { ChatMessage, ThreadReply } from '@/api/types'

/** What I may do to a message or reply: react where I can post; edit and delete my own plain ones; nothing once deleted. */
export function actionsFor(row: ChatMessage | ThreadReply, meId: string | undefined, canPost: boolean) {
  if (!canPost || row.deletedAt) return { react: false, edit: false, remove: false }
  const card = ('commentId' in row && Boolean(row.commentId)) || ('taskEvent' in row && Boolean(row.taskEvent))
  const own = !card && meId != null && row.senderId === meId
  return { react: true, edit: own, remove: own }
}
