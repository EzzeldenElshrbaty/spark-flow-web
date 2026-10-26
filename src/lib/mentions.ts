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

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'user'; userId: string; name: string }
  | { kind: 'task'; key: string }
  | { kind: 'project'; key: string }
  | { kind: 'all' }

export type KnownIds = { userIds: Set<string>; taskKeys: Set<string>; projectKeys: Set<string>; nameOf: (id: string) => string }

/**
 * Text split into plain parts and mentions, for rendering as chips. Only mentions of people, tasks and projects that
 * exist become chips (spec §7: chips come from parsed ids); the rest stays text, with `@[Name](id)` shown as `@Name`.
 */
export function segments(content: string, known: KnownIds): Segment[] {
  const out: Segment[] = []
  const text = (t: string) => {
    if (!t) return
    const last = out.at(-1)
    if (last?.kind === 'text') last.text += t
    else out.push({ kind: 'text', text: t })
  }
  let from = 0
  for (const match of content.matchAll(MENTION)) {
    const [whole, all, userId, taskKey, projectKey] = match
    text(content.slice(from, match.index))
    from = match.index + whole.length
    if (all) out.push({ kind: 'all' })
    else if (userId) {
      if (known.userIds.has(userId)) out.push({ kind: 'user', userId, name: known.nameOf(userId) })
      else text(`@${whole.slice(2, whole.indexOf(']'))}`)
    } else if (taskKey) {
      if (known.taskKeys.has(taskKey)) out.push({ kind: 'task', key: taskKey })
      else text(whole)
    } else if (known.projectKeys.has(projectKey)) out.push({ kind: 'project', key: projectKey })
    else text(whole)
  }
  text(content.slice(from))
  return out
}
