import type { Channel, User } from '@/api/types'

/**
 * Flowbot (spec 5.1 Apps): the app that delivers reminders and notices in a DM with each person. It is not a person,
 * so it is in no user list; its DM has it as a member and its messages have it as their sender.
 */
export const FLOWBOT_ID = 'app-flowbot'
export const FLOWBOT_NAME = 'Flowbot'

export const isFlowbot = (id: string): boolean => id === FLOWBOT_ID

/** Whether a channel is someone's DM with Flowbot. */
export const isFlowbotDm = (channel: Pick<Channel, 'kind' | 'memberIds'>): boolean => channel.kind === 'dm' && channel.memberIds.includes(FLOWBOT_ID)

/** The line shown instead of the composer in Flowbot's DM, and the server's refusal there. */
export const FLOWBOT_READ_ONLY = 'Flowbot sends reminders here. It can’t read replies.'

/** What the UI calls whoever sent a message: Flowbot, a person, or "Unknown person". */
export function senderName(id: string, users: Pick<User, 'id' | 'name'>[]): string {
  if (isFlowbot(id)) return FLOWBOT_NAME
  return users.find((u) => u.id === id)?.name ?? 'Unknown person'
}
