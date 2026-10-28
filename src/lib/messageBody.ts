import type { Mention } from '@/api/types'
import { graphemes, isEmojiGrapheme } from '@/lib/emojiText'

/**
 * A message's body as structured rich text (spec §7): blocks of inline runs with marks and entities. The server
 * stores it next to the plain `content`; the page renders it as elements, never as HTML.
 */
export type Mark = 'b' | 'i' | 'u' | 's' | 'code'

export type Inline =
  | { type: 'text'; text: string; marks?: Mark[] }
  | { type: 'link'; href: string; text: string }
  | { type: 'user'; id: string; name: string }
  | { type: 'all' }
  | { type: 'channel'; id: string; name: string }
  | { type: 'task'; key: string }
  | { type: 'project'; key: string }

export type Block =
  | { type: 'p'; children: Inline[] }
  | { type: 'quote'; children: Block[] }
  | { type: 'ul' | 'ol'; items: Inline[][] }
  | { type: 'code'; text: string }

export type Body = Block[]

/** A Flow task key (spec 6.3): letters, then letters or digits, a dash and a number. */
export const TASK_KEY = /\b[A-Z][A-Z0-9]+-\d+\b/

// One alternative per inline element, leftmost first; at the same place the earlier alternative wins.
const INLINE = new RegExp(
  [
    '`(?<code>[^`\\n]+)`',
    '(?<![\\w.@])@\\[(?<userName>[^\\]]+)\\]\\((?<userId>[\\w-]+)\\)',
    '(?<![\\w#])#\\[(?<channelName>[^\\]]+)\\]\\((?<channelId>[\\w-]+)\\)',
    '(?<![\\w.@])@(?<all>all)\\b',
    '(?<![\\w.@])@(?<atTask>[A-Z][A-Z0-9]+-\\d+)\\b',
    '(?<![\\w.@])@(?<project>[A-Z]{2,5})\\b(?!-)',
    '(?<url>https?:\\/\\/[^\\s<>]+[^\\s<>.,;:!?)\\]\'"])',
    `(?<task>${TASK_KEY.source})`,
    // A mark needs a word right inside it and no word right outside it, so 2 * 3 and snake_case stay text.
    '(?<![\\w*])\\*(?<b>[^\\s*](?:[^*\\n]*[^\\s*])?)\\*(?![\\w*])',
    '(?<![\\w_])_(?<i>[^\\s_](?:[^_\\n]*[^\\s_])?)_(?![\\w_])',
    '(?<![\\w~])~(?<s>[^\\s~](?:[^~\\n]*[^\\s~])?)~(?![\\w~])',
  ].join('|'),
  'gu',
)

const MARK_ORDER: readonly Mark[] = ['b', 'i', 'u', 's', 'code']
/** Marks in one order, so the same formatting always reads the same however it was typed. */
const canonical = (marks: Mark[]) => MARK_ORDER.filter((m) => marks.includes(m))

function pushText(out: Inline[], text: string, given: Mark[]) {
  if (!text) return
  const marks = canonical(given)
  const last = out.at(-1)
  const same = (a?: Mark[]) => (a ?? []).join() === marks.join()
  if (last?.type === 'text' && same(last.marks)) last.text += text
  else out.push(marks.length ? { type: 'text', text, marks: [...marks] } : { type: 'text', text })
}

function parseInline(src: string, marks: Mark[] = []): Inline[] {
  const out: Inline[] = []
  let from = 0
  for (const m of src.matchAll(INLINE)) {
    const g = m.groups!
    pushText(out, src.slice(from, m.index), marks)
    from = m.index + m[0].length
    if (g.code !== undefined) pushText(out, g.code, [...marks, 'code'])
    else if (g.userId) out.push({ type: 'user', id: g.userId, name: g.userName })
    else if (g.channelId) out.push({ type: 'channel', id: g.channelId, name: g.channelName })
    else if (g.all) out.push({ type: 'all' })
    else if (g.atTask) out.push({ type: 'task', key: g.atTask })
    else if (g.project) out.push({ type: 'project', key: g.project })
    else if (g.url) out.push({ type: 'link', href: g.url, text: g.url })
    else if (g.task) out.push({ type: 'task', key: g.task })
    else {
      const mark: Mark = g.b !== undefined ? 'b' : g.i !== undefined ? 'i' : 's'
      for (const node of parseInline(g.b ?? g.i ?? g.s, [...marks, mark])) {
        if (node.type === 'text') pushText(out, node.text, node.marks ?? [])
        else out.push(node)
      }
    }
  }
  pushText(out, src.slice(from), marks)
  return out
}

const AUTO = new RegExp(`(?<url>https?:\\/\\/[^\\s<>]+[^\\s<>.,;:!?)\\]'"])|(?<task>${TASK_KEY.source})`, 'gu')

/**
 * Plain text as inlines, with web addresses as links and task keys as references, the way the parser reads them
 * (the composer sends what people typed through this). Text marked as code stays text.
 */
export function autoInlines(text: string, marks: Mark[] = []): Inline[] {
  const out: Inline[] = []
  if (marks.includes('code')) {
    pushText(out, text, marks)
    return out
  }
  let from = 0
  for (const m of text.matchAll(AUTO)) {
    pushText(out, text.slice(from, m.index), marks)
    from = m.index + m[0].length
    if (m.groups!.url) out.push({ type: 'link', href: m.groups!.url, text: m.groups!.url })
    else out.push({ type: 'task', key: m.groups!.task })
  }
  pushText(out, text.slice(from), marks)
  return out
}

/** Adds inlines to a list, joining text runs with the same marks. */
export function appendInlines(out: Inline[], nodes: Inline[]) {
  for (const n of nodes) {
    if (n.type === 'text') pushText(out, n.text, n.marks ?? [])
    else out.push(n)
  }
}

const FENCE = /^\s*```/
const QUOTE = /^> ?/
const BULLET = /^\s*[-*] /
const NUMBER = /^\s*\d+[.)] /
const startsBlock = (line: string) => FENCE.test(line) || QUOTE.test(line) || BULLET.test(line) || NUMBER.test(line)

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
    } else if (FENCE.test(line)) {
      const code: string[] = []
      for (i++; i < lines.length && !FENCE.test(lines[i]); i++) code.push(lines[i])
      i++ // the closing fence (an unclosed one runs to the end)
      blocks.push({ type: 'code', text: code.join('\n') })
    } else if (QUOTE.test(line)) {
      const inner: string[] = []
      for (; i < lines.length && QUOTE.test(lines[i]); i++) inner.push(lines[i].replace(QUOTE, ''))
      blocks.push({ type: 'quote', children: parseBlocks(inner.join('\n')) })
    } else if (BULLET.test(line) || NUMBER.test(line)) {
      const marker = BULLET.test(line) ? BULLET : NUMBER
      const items: Inline[][] = []
      for (; i < lines.length && marker.test(lines[i]); i++) items.push(parseInline(lines[i].replace(marker, '')))
      blocks.push({ type: marker === BULLET ? 'ul' : 'ol', items })
    } else {
      const para: string[] = []
      for (; i < lines.length && lines[i].trim() && !(para.length && startsBlock(lines[i])); i++) para.push(lines[i])
      blocks.push({ type: 'p', children: parseInline(para.join('\n')) })
    }
  }
  return blocks
}

/** The body for a message's text: the composer's markdown (spec 6.8 autoformat) and mention syntax. */
export function parseBody(content: string): Body {
  return parseBlocks(content.trim())
}

function inlineText(nodes: Inline[]): string {
  return nodes
    .map((n) =>
      n.type === 'text' || n.type === 'link' ? n.text : n.type === 'user' ? `@${n.name}` : n.type === 'all' ? '@all' : n.type === 'channel' ? `#${n.name}` : n.type === 'task' ? n.key : `@${n.key}`,
    )
    .join('')
}

/** The body as plain text, one block a line: what search and notifications read (spec §7 body_text). */
export function bodyText(body: Body): string {
  return body
    .map((b) => (b.type === 'p' ? inlineText(b.children) : b.type === 'quote' ? bodyText(b.children) : b.type === 'code' ? b.text : b.items.map(inlineText).join('\n')))
    .join('\n')
}

const JUMBO_MAX = 23

/** Whether a message is emoji and nothing else (up to 23), shown large (spec 6.3). */
export function isJumbo(body: Body): boolean {
  if (body.length !== 1 || body[0].type !== 'p') return false
  const nodes = body[0].children
  if (!nodes.every((n) => n.type === 'text' && !n.marks)) return false
  const text = nodes.map((n) => (n.type === 'text' ? n.text : '')).join('').replace(/\s+/g, '')
  const all = graphemes(text)
  return all.length > 0 && all.length <= JUMBO_MAX && all.every(isEmojiGrapheme)
}

const MARKS: readonly Mark[] = ['b', 'i', 'u', 's', 'code']
const ID = /^[\w-]{1,100}$/
const MAX_BLOCKS = 2000
const MAX_TEXT = 40_000

const isText = (v: unknown, max = MAX_TEXT): v is string => typeof v === 'string' && v.length <= max
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isWebAddress = (href: unknown) => {
  if (!isText(href, 2048)) return false
  try {
    return ['http:', 'https:'].includes(new URL(href).protocol)
  } catch {
    return false
  }
}

function validInline(n: unknown): Inline | null {
  if (!isRecord(n)) return null
  switch (n.type) {
    case 'text': {
      if (!isText(n.text)) return null
      if (n.marks === undefined) return { type: 'text', text: n.text }
      if (!Array.isArray(n.marks) || !n.marks.every((m) => MARKS.includes(m as Mark))) return null
      const marks = [...new Set(n.marks as Mark[])]
      return marks.length ? { type: 'text', text: n.text, marks } : { type: 'text', text: n.text }
    }
    case 'link':
      return isWebAddress(n.href) && isText(n.text, 2048) ? { type: 'link', href: n.href as string, text: n.text } : null
    case 'user':
      return isText(n.id) && ID.test(n.id) && isText(n.name, 200) ? { type: 'user', id: n.id, name: n.name } : null
    case 'all':
      return { type: 'all' }
    case 'channel':
      return isText(n.id) && ID.test(n.id) && isText(n.name, 200) ? { type: 'channel', id: n.id, name: n.name } : null
    case 'task':
      return isText(n.key) && new RegExp(`^${TASK_KEY.source.replaceAll('\\b', '')}$`).test(n.key) ? { type: 'task', key: n.key } : null
    case 'project':
      return isText(n.key) && /^[A-Z]{2,5}$/.test(n.key) ? { type: 'project', key: n.key } : null
    default:
      return null
  }
}

function validInlines(list: unknown): Inline[] | null {
  if (!Array.isArray(list)) return null
  const out = list.map(validInline)
  return out.every(Boolean) ? (out as Inline[]) : null
}

function validBlock(b: unknown, inQuote: boolean): Block | null {
  if (!isRecord(b)) return null
  switch (b.type) {
    case 'p': {
      const children = validInlines(b.children)
      return children && { type: 'p', children }
    }
    case 'code':
      return isText(b.text) ? { type: 'code', text: b.text } : null
    case 'ul':
    case 'ol': {
      if (!Array.isArray(b.items)) return null
      const items = b.items.map(validInlines)
      return items.every(Boolean) ? { type: b.type, items: items as Inline[][] } : null
    }
    case 'quote': {
      // Quotes don't nest (the composer can't make one inside another).
      if (inQuote || !Array.isArray(b.children)) return null
      const children = b.children.map((c) => validBlock(c, true))
      return children.every(Boolean) ? { type: 'quote', children: children as Block[] } : null
    }
    default:
      return null
  }
}

/**
 * A body from a client, checked node by node (spec §7): only the known blocks, inlines and marks, links only to web
 * addresses, ids that look like ids; anything it doesn't know is dropped. Null when it isn't a body at all.
 */
export function validBody(value: unknown): Body | null {
  if (!Array.isArray(value) || value.length > MAX_BLOCKS) return null
  const blocks = value.map((b) => validBlock(b, false))
  return blocks.every(Boolean) ? (blocks as Body) : null
}

/** Every inline of a body, in reading order. */
function inlinesOf(body: Body): Inline[] {
  const of = (b: Block): Inline[] => (b.type === 'p' ? b.children : b.type === 'quote' ? b.children.flatMap(of) : b.type === 'code' ? [] : b.items.flat())
  return body.flatMap(of)
}

/** The people, everyone, projects and tasks a body names (for notifications and the bell), each once, in order. */
export function mentionsOf(body: Body): Mention[] {
  const seen = new Set<string>()
  const out: Mention[] = []
  for (const n of inlinesOf(body)) {
    const m: Mention | null =
      n.type === 'user' ? { kind: 'user', id: n.id } : n.type === 'all' ? { kind: 'all', id: 'all' } : n.type === 'project' ? { kind: 'project', id: n.key } : n.type === 'task' ? { kind: 'task', id: n.key } : null
    if (m && !seen.has(`${m.kind}:${m.id}`)) {
      seen.add(`${m.kind}:${m.id}`)
      out.push(m)
    }
  }
  return out
}

/** The task keys a body names, each once, in order. */
export const bodyTaskKeys = (body: Body): string[] => [...new Set(inlinesOf(body).flatMap((n) => (n.type === 'task' ? [n.key] : [])))]
