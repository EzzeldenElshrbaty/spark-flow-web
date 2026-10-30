import type { Channel, SearchRequest, User } from '@/api/types'
import { personMatches, type ParsedQuery } from '@/lib/searchQuery'

export type ResolvedSearch = {
  /** What to ask the server (without tab, sort and cursor); null when nothing should be asked. */
  request: Omit<SearchRequest, 'tab' | 'sort' | 'cursor' | 'tz'> | null
  /** Sentences for what a filter names that isn't there: shown under the box instead of results. */
  problems: string[]
}

/** Words and phrases as the server reads them. */
const textOf = (q: ParsedQuery) => [...q.words, ...q.phrases.map((p) => `"${p}"`)].join(' ')

/**
 * The query with its names turned into ids (§8 sends people and channels by id): from:@nour is everyone the handle
 * fits (`personMatches`), in:#name a channel I can see by name, in:@name my 1:1 conversation with that person.
 */
export function resolveSearch(q: ParsedQuery, { users, channels, meId }: { users: User[]; channels: Channel[]; meId: string }): ResolvedSearch {
  const problems: string[] = []
  const from = q.from.flatMap((handle) => {
    const found = users.filter((u) => personMatches(u, handle)).map((u) => u.id)
    if (found.length === 0) problems.push(`No one matches @${handle}.`)
    return found
  })
  let inId: string | null = null
  if (q.in?.kind === 'channel') {
    const name = q.in.name.toLowerCase()
    inId = channels.find((c) => c.kind === 'channel' && c.name?.toLowerCase() === name)?.id ?? null
    if (!inId) problems.push(`No channel is called #${q.in.name}.`)
  } else if (q.in?.kind === 'dm') {
    const handle = q.in.name
    // The exact handle first (the header's 🔍 writes one), else the one person it starts.
    const others = users.filter((u) => u.id !== meId)
    const exact = others.filter((u) => handleOf(u) === handle.toLowerCase())
    const fits = exact.length ? exact : others.filter((u) => personMatches(u, handle))
    const person = fits.length === 1 ? fits[0] : undefined
    if (fits.length > 1) problems.push(`More than one person matches @${handle}.`)
    else if (!person) problems.push(`No one matches @${handle}.`)
    else {
      inId = channels.find((c) => c.kind === 'dm' && c.memberIds.length === 2 && c.memberIds.includes(meId) && c.memberIds.includes(person.id))?.id ?? null
      if (!inId) problems.push(`You have no conversation with ${person.name}.`)
    }
  }
  const asked = textOf(q) !== '' || q.from.length > 0 || q.in !== null || q.has !== null || q.thread || q.after !== null || q.before !== null
  if (problems.length || !asked) return { request: null, problems }
  return { request: { q: textOf(q), from: [...new Set(from)], in: inId, has: q.has, thread: q.thread, after: q.after, before: q.before }, problems }
}

/** The handle a chip or a scope writes for a person: their email name, else their first name. */
export const handleOf = (user: Pick<User, 'name' | 'email'>) => (user.email?.split('@')[0] || user.name.split(/\s+/)[0]).toLowerCase()

/**
 * What the channel header's search and ⌘F start Search with (spec 6.1): `in:#name ` for a channel, `in:@handle ` for
 * a 1:1 conversation, with a space for the words to follow; null for a group conversation, which `in:` can't name.
 */
export function channelScope(channel: Channel, users: User[], meId: string): string | null {
  if (channel.kind === 'channel') return channel.name ? `in:#${channel.name} ` : null
  const others = channel.memberIds.filter((id) => id !== meId)
  const other = others.length === 1 ? users.find((u) => u.id === others[0]) : undefined
  return other ? `in:@${handleOf(other)} ` : null
}
