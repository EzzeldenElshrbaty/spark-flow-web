import type { Reaction } from '@/api/types'

/** The quick reactions the ⋯ menu offers; the picker offers any emoji. */
export const REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '✅'] as const

/** At most this many different emoji on one message (spec 6.6). */
export const MAX_DISTINCT_REACTIONS = 50

/**
 * Puts me on (`on`) or takes me off an emoji (spec §8: PUT and DELETE are sets, so a retry changes nothing). The server
 * and the optimistic update both use it, so the screen shows what the server will store. An empty
 * emoji goes away; a new one past MAX_DISTINCT_REACTIONS is refused (null); taking one off never is.
 */
export function setReaction(reactions: Reaction[], emoji: string, userId: string, on: boolean): Reaction[] | null {
  const existing = reactions.find((r) => r.emoji === emoji)
  if (on && !existing) return reactions.length >= MAX_DISTINCT_REACTIONS ? null : [...reactions, { emoji, userIds: [userId] }]
  if (!existing || existing.userIds.includes(userId) === on) return reactions
  const userIds = on ? [...existing.userIds, userId] : existing.userIds.filter((id) => id !== userId)
  return reactions.map((r) => (r.emoji === emoji ? { ...r, userIds } : r)).filter((r) => r.userIds.length > 0)
}

/** At most this many people are named in a reaction's tooltip; the rest are counted. */
const NAMED = 2

/** Who reacted, as the tooltip says it (spec 6.6): "You and Hossam Gaber", "You, Hossam Gaber and 2 others". */
export function reactorsText(userIds: string[], meId: string | undefined, nameOf: (id: string) => string): string {
  const names = [...(meId && userIds.includes(meId) ? ['You'] : []), ...userIds.filter((id) => id !== meId).map(nameOf)]
  if (names.length <= 1) return names[0] ?? ''
  if (names.length <= NAMED + 1) return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  return `${names.slice(0, NAMED).join(', ')} and ${names.length - NAMED} others`
}
