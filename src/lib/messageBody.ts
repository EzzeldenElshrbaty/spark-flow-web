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

function pushText(out: Inline[], text: string, marks: Mark[]) {
  if (!text) return
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
const PICTOGRAPH = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u

/** Whether a message is emoji and nothing else (up to 23), shown large (spec 6.3). */
export function isJumbo(body: Body): boolean {
  if (body.length !== 1 || body[0].type !== 'p') return false
  const nodes = body[0].children
  if (!nodes.every((n) => n.type === 'text' && !n.marks)) return false
  const text = nodes.map((n) => (n.type === 'text' ? n.text : '')).join('').replace(/\s+/g, '')
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((s) => s.segment)
  return graphemes.length > 0 && graphemes.length <= JUMBO_MAX && graphemes.every((g) => PICTOGRAPH.test(g))
}
