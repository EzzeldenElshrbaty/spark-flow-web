import type { ChatMessage, ThreadReply } from '@/api/types'
import { can } from '@/lib/permissions'

/**
 * What I may do to a message or reply (spec §9): react where I can post; edit my own plain ones; delete my own, or
 * anyone's as an Admin; nothing on cards, system messages or once deleted.
 */
export function actionsFor(row: ChatMessage | ThreadReply, meId: string | undefined, canPost: boolean, admin = false) {
  const system = 'system' in row && Boolean(row.system)
  if (!canPost || row.deletedAt || system) return { react: false, edit: false, remove: false }
  const card = ('commentId' in row && Boolean(row.commentId)) || ('taskEvent' in row && Boolean(row.taskEvent))
  // The rules are can()'s (spec §9); only who it is matters here, so the role is all an Admin needs.
  const ctx = { userId: meId ?? '', role: admin ? ('admin' as const) : ('member' as const), authorId: row.senderId }
  return { react: true, edit: !card && meId != null && can('message.edit', ctx), remove: !card && meId != null && can('message.delete', ctx) }
}

/** Whether deleting asks first (spec 6.3): when it has replies or files not deleted already; otherwise it goes at once, with Undo. */
export const deleteNeedsConfirm = (row: ChatMessage | ThreadReply) => ('threadCount' in row && row.threadCount > 0) || row.attachments.some((a) => !a.deletedAt)

/** My newest message I may edit (oldest-first list): what Up in an empty composer opens (spec 6.3). */
export function lastEditable(messages: ChatMessage[], meId: string | undefined): ChatMessage | undefined {
  return [...messages].reverse().find((row) => actionsFor(row, meId, true).edit)
}
