/**
 * Search's query language (spec 6.12): words, "quoted phrases", and the operators from:@name, in:#channel or
 * in:@name (a DM), has:file|link|pin|reaction, is:thread, after:YYYY-MM-DD and before:YYYY-MM-DD. The address holds the
 * query as typed; the chips rewrite it with `withFilter` / `withoutFilter`. Matching is shared by the mock index and the
 * page's highlights: each word must start a word, a phrase matches as written, case and accents are ignored.
 */

export type HasFilter = 'file' | 'link' | 'pin' | 'reaction'
export type FilterKey = 'from' | 'in' | 'has' | 'is' | 'after' | 'before'
export type ParsedQuery = {
  words: string[]
  phrases: string[]
  /** Handles without the @; anyone of them. */
  from: string[]
  in: { kind: 'channel' | 'dm'; name: string } | null
  has: HasFilter | null
  thread: boolean
  after: string | null
  before: string | null
}

export const HAS: readonly HasFilter[] = ['file', 'link', 'pin', 'reaction']
const DATE = /^\d{4}-\d{2}-\d{2}$/
const HANDLE = /^@[^\s@#]+$/

type Token = { raw: string; key?: FilterKey; value?: string; phrase?: string }

/** What a `key:value` means, or null when it isn't one of the operators (then it is just a word). */
function operator(raw: string): Pick<Token, 'key' | 'value'> | null {
  const colon = raw.indexOf(':')
  if (colon < 1) return null
  const key = raw.slice(0, colon).toLowerCase()
  const value = raw.slice(colon + 1)
  const ok =
    (key === 'from' && HANDLE.test(value)) ||
    (key === 'in' && (/^#[^\s#]+$/.test(value) || HANDLE.test(value))) ||
    (key === 'has' && (HAS as readonly string[]).includes(value.toLowerCase())) ||
    (key === 'is' && value.toLowerCase() === 'thread') ||
    ((key === 'after' || key === 'before') && DATE.test(value))
  return ok ? { key: key as FilterKey, value: key === 'has' || key === 'is' ? value.toLowerCase() : value } : null
}

/** The query as tokens, in order: a "phrase" (an unclosed quote runs to the end; empty quotes are dropped), an operator, or a word. */
function tokenize(q: string): Token[] {
  const tokens: Token[] = []
  for (const m of q.matchAll(/"([^"]*)(?:"|$)|\S+/g)) {
    if (m[1] === undefined) tokens.push({ raw: m[0], ...operator(m[0]) })
    else if (m[1].trim()) tokens.push({ raw: m[0].endsWith('"') && m[0].length > 1 ? m[0] : `${m[0]}"`, phrase: m[1].trim() })
  }
  return tokens
}

export function parseQuery(q: string): ParsedQuery {
  const out: ParsedQuery = { words: [], phrases: [], from: [], in: null, has: null, thread: false, after: null, before: null }
  for (const t of tokenize(q)) {
    if (t.phrase !== undefined) {
      if (t.phrase) out.phrases.push(t.phrase)
    } else if (!t.key) out.words.push(t.raw)
    else if (t.key === 'from') out.from.push(t.value!.slice(1))
    else if (t.key === 'in') out.in = { kind: t.value!.startsWith('#') ? 'channel' : 'dm', name: t.value!.slice(1) }
    else if (t.key === 'has') out.has = t.value as HasFilter
    else if (t.key === 'is') out.thread = true
    else out[t.key] = t.value!
  }
  return out
}

/** The query with this filter set (one of its kind: any other goes), the rest kept as typed. */
export function withFilter(q: string, key: FilterKey, value: string): string {
  return [...tokenize(q).filter((t) => t.key !== key).map((t) => t.raw), `${key}:${value}`].join(' ')
}

/** The query without this kind of filter. */
export function withoutFilter(q: string, key: FilterKey): string {
  return tokenize(q)
    .filter((t) => t.key !== key)
    .map((t) => t.raw)
    .join(' ')
}

/** A filter's value as typed (`#backend`, `@nour`, `file`), or null: what a chip shows. */
export function filterOf(q: string, key: FilterKey): string | null {
  return tokenize(q).find((t) => t.key === key)?.value ?? null
}

/**
 * Lower case without accents or Arabic marks (never by locale: a Turkish "I" stays "i"), with where each of its
 * characters starts and ends in the original (a character that unfolds to several maps them all to itself).
 */
function folded(text: string): { text: string; at: number[]; end: number[] } {
  let out = ''
  const at: number[] = []
  const end: number[] = []
  let i = 0
  for (const ch of text) {
    const f = ch.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    for (let k = 0; k < f.length; k++) {
      at.push(i)
      end.push(i + ch.length)
    }
    out += f
    i += ch.length
  }
  return { text: out, at, end }
}
const fold = (s: string) => folded(s).text
const startsWord = (text: string, i: number) => i === 0 || !/[\p{L}\p{N}]/u.test(text[i - 1])

/** Where a needle starts words in the folded text. */
function hits(hay: string, needle: string): number[] {
  const found: number[] = []
  if (!needle) return found
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) if (startsWord(hay, i)) found.push(i)
  return found
}

const needles = (q: ParsedQuery) => [...q.words, ...q.phrases].map(fold).filter(Boolean)

/** Whether a text has every word and phrase of the query; a query of filters alone matches any text. */
export function matches(text: string, q: ParsedQuery): boolean {
  const hay = fold(text)
  return needles(q).every((n) => hits(hay, n).length > 0)
}

/** How well a text matches: each match counts, a phrase three times (it is worth more than its words apart). */
export function relevance(text: string, q: ParsedQuery): number {
  const hay = fold(text)
  return q.words.reduce((n, w) => n + hits(hay, fold(w)).length, 0) + q.phrases.reduce((n, p) => n + 3 * hits(hay, fold(p)).length, 0)
}

export type Range = [start: number, end: number]

/** The parts of the original text to highlight, in order, overlaps merged. */
export function matchRanges(text: string, q: ParsedQuery): Range[] {
  const { text: hay, at, end } = folded(text)
  const ranges: Range[] = needles(q)
    .flatMap((n) => hits(hay, n).map((i): Range => [at[i], end[i + n.length - 1]]))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const merged: Range[] = []
  for (const r of ranges) {
    const last = merged.at(-1)
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([...r])
  }
  return merged
}

/** At most `size` characters around the first match, with … where it was cut, and the ranges moved along. */
export function excerpt(text: string, ranges: Range[], size = 240): { text: string; ranges: Range[] } {
  if (text.length <= size) return { text, ranges }
  const first = ranges[0]?.[0] ?? 0
  let start = Math.max(0, Math.min(first - Math.floor(size / 3), text.length - size))
  // Never cut a surrogate pair (an emoji) in half.
  if (/[\uDC00-\uDFFF]/.test(text[start] ?? '')) start += 1
  let end = Math.min(text.length, start + size)
  if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end -= 1
  const head = start > 0 ? '…' : ''
  const body = text.slice(start, end)
  const shift = head.length - start
  return {
    text: `${head}${body}${end < text.length ? '…' : ''}`,
    // A highlight that crosses a cut keeps its part inside.
    ranges: ranges.filter(([s, e]) => e > start && s < end).map(([s, e]): Range => [Math.max(s, start) + shift, Math.min(e, end) + shift]),
  }
}

/** from:@nour: someone whose first name or email name starts with it. */
export function personMatches(person: { name: string; email?: string | null }, handle: string): boolean {
  const h = fold(handle)
  if (!h) return false
  const first = fold(person.name.split(/\s+/)[0] ?? '')
  const local = fold((person.email ?? '').split('@')[0])
  return first.startsWith(h) || (local !== '' && local.startsWith(h))
}
