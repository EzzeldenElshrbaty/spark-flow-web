import type { Mention } from '@/api/types'

const TICKET_KEY = /\b[A-Z]{2,5}-\d+\b/g

/** Ticket keys such as NEX-104 in a piece of text: unique, in order of first appearance. */
export function parseTicketKeys(content: string): string[] {
  return [...new Set(content.match(TICKET_KEY) ?? [])]
}

// @all, @[Display Name](userId) from the composer, @NEX-104 (a task) or @NEX (a project). Not part of an e-mail address.
/** The mention syntax (spec §3): global, so use matchAll or reset lastIndex. */
export const MENTION = /(?<![\w.@])@(?:(all)\b|\[[^\]]+\]\(([\w-]+)\)|([A-Z]{2,5}-\d+)\b|([A-Z]{2,5})\b(?!-))/g

/** The mentions in a message, as the server works them out: each once, in order of first appearance. */
export function parseMentions(content: string): Mention[] {
  const seen = new Set<string>()
  const found: Mention[] = []
  for (const [, all, userId, taskKey, projectKey] of content.matchAll(MENTION)) {
    const mention: Mention = all
      ? { kind: 'all', id: 'all' }
      : userId
        ? { kind: 'user', id: userId }
        : taskKey
          ? { kind: 'task', id: taskKey }
          : { kind: 'project', id: projectKey }
    const key = `${mention.kind}:${mention.id}`
    if (!seen.has(key)) {
      seen.add(key)
      found.push(mention)
    }
  }
  return found
}
