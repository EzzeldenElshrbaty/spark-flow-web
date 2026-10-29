import type { User } from '@/api/types'

export type MentionOption =
  | { kind: 'all' } // @channel
  | { kind: 'here' }
  | { kind: 'user'; id: string; name: string; title: string }
  | { kind: 'project'; key: string; name: string }
  | { kind: 'task'; key: string; title: string }

const MAX_QUERY = 30
const MAX_OPTIONS = 8

/** The `@query` being typed at the caret: the `@` starts a word (or follows "("), and no space comes after it. */
export function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const start = before.lastIndexOf('@')
  if (start < 0) return null
  const query = before.slice(start + 1)
  if (/\s/.test(query) || query.length > MAX_QUERY) return null
  if (start > 0 && !/[\s(]/.test(before[start - 1])) return null
  return { start, query }
}

/** Whether any word of `text` (or the whole of it) starts with `query`, ignoring case. */
const matches = (query: string, ...texts: string[]) => {
  const q = query.toLowerCase()
  return texts.some((t) => t.toLowerCase().startsWith(q) || t.toLowerCase().split(/[\s·-]+/).some((w) => w.startsWith(q)))
}

/** What the `@` popup offers: @channel and @here, then people, projects and tasks that match; at most 8. */
export function mentionOptions(query: string, from: { users: User[]; projects: { key: string; name: string }[]; tasks: { key: string; title: string }[] }): MentionOption[] {
  const options: MentionOption[] = []
  const q = query.toLowerCase()
  // "al" still finds @channel: it was @all before (spec 6.8 names it @channel).
  if ('channel'.startsWith(q) || 'all'.startsWith(q)) options.push({ kind: 'all' })
  if ('here'.startsWith(q)) options.push({ kind: 'here' })
  for (const u of from.users) if (matches(query, u.name)) options.push({ kind: 'user', id: u.id, name: u.name, title: u.title })
  for (const p of from.projects) if (matches(query, p.key, p.name)) options.push({ kind: 'project', key: p.key, name: p.name })
  for (const t of from.tasks) if (matches(query, t.key, t.title)) options.push({ kind: 'task', key: t.key, title: t.title })
  return options.slice(0, MAX_OPTIONS)
}

const tokenOf = (option: MentionOption) =>
  option.kind === 'all' ? '@channel' : option.kind === 'here' ? '@here' : option.kind === 'user' ? `@[${option.name}](${option.id})` : `@${option.key}`

/** Puts the chosen mention in place of the `@query`, followed by one space, with the caret after it. */
export function insertMention(text: string, at: { start: number; caret: number }, option: MentionOption): { text: string; caret: number } {
  const token = tokenOf(option)
  const rest = text.slice(at.caret)
  const spaced = /^\s/.test(rest) ? token : `${token} `
  return { text: text.slice(0, at.start) + spaced + rest, caret: at.start + token.length + 1 }
}

/** A list closed (Escape, blur) at one @word stays closed while that @word is typed; any other @ opens it again. */
export const keepDismissed = (dismissed: number | null, start: number | null) => (start !== null && start === dismissed ? dismissed : null)

/** What the `#` popup offers (spec 6.8): channels whose name starts with the query, then ones that contain it; at most 8. */
export function channelOptions<C extends { id: string; name: string }>(query: string, channels: C[]): C[] {
  const q = query.toLowerCase()
  const starts = channels.filter((c) => c.name.toLowerCase().startsWith(q))
  const contains = channels.filter((c) => !starts.includes(c) && c.name.toLowerCase().includes(q))
  return [...starts, ...contains].slice(0, MAX_OPTIONS)
}
