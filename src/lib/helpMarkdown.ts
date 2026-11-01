import type { Action, ProjectScoped } from '@/lib/permissions'

// Help chapters (Admin and help, slice 6): the small Markdown in `src/help/*.md`, parsed into blocks that
// `pages/help/HelpDoc.tsx` renders as elements. Nothing is ever turned into HTML: what the parser doesn't know stays text.

export const HELP_GROUPS = ['Getting started', 'Work', 'Chat', 'Manage', 'Settings'] as const
export type HelpGroup = (typeof HELP_GROUPS)[number]

export type HelpLink = { chapter: string; section: string | null } | { href: string }
export type Inline = { t: 'text'; v: string } | { t: 'b'; v: string } | { t: 'code'; v: string } | { t: 'link'; v: string; to: HelpLink }
export type HelpBlock =
  | { type: 'h2'; text: string; id: string }
  | { type: 'p'; inline: Inline[] }
  | { type: 'ul' | 'ol'; items: Inline[][] }
  | { type: 'tip'; inline: Inline[] }
  | { type: 'img'; src: string; alt: string; caption: string }

export type HelpChapter = {
  id: string
  title: string
  group: HelpGroup
  order: number
  summary: string
  /** Who it's for, when not everyone: a `can()` action. */
  needs: Exclude<Action, ProjectScoped> | null
  blocks: HelpBlock[]
  /** Title and body as plain text, for search. */
  text: string
}

/** A heading's anchor: lower case, words joined by "-". */
export const slugOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/
const TOKEN = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g

function linkTo(target: string): HelpLink | null {
  const help = /^help:([a-z0-9-]+)(?:#([a-z0-9-]+))?$/.exec(target)
  if (help) return { chapter: help[1]!, section: help[2] ?? null }
  if (/^https:\/\/[^\s]+$/.test(target)) return { href: target }
  return null
}

/** Bold, keys and links in a line; everything else, a link to anywhere else included, is text. */
export function parseInline(line: string): Inline[] {
  const out: Inline[] = []
  const text = (v: string) => {
    if (!v) return
    const last = out.at(-1)
    if (last?.t === 'text') last.v += v
    else out.push({ t: 'text', v })
  }
  let at = 0
  for (const match of line.matchAll(TOKEN)) {
    text(line.slice(at, match.index))
    at = match.index + match[0].length
    if (match[1] !== undefined) out.push({ t: 'b', v: match[1] })
    else if (match[2] !== undefined) out.push({ t: 'code', v: match[2] })
    else {
      const to = linkTo(match[4]!)
      if (to) out.push({ t: 'link', v: match[3]!, to })
      else text(match[0])
    }
  }
  text(line.slice(at))
  return out
}

const plain = (inline: Inline[]) => inline.map((i) => i.v).join('')

/** One chapter from its file: front matter, then the body as blocks. */
export function parseChapter(id: string, file: string): HelpChapter {
  const source = file.replace(/\r\n?/g, '\n')
  const front = /^---\n([\s\S]*?)\n---\n?/.exec(source)
  const meta = Object.fromEntries(
    (front?.[1] ?? '')
      .split('\n')
      .map((line) => /^(\w+):\s*(.*)$/.exec(line))
      .filter((m): m is RegExpExecArray => Boolean(m))
      .map((m) => [m[1]!, m[2]!.trim()]),
  )
  if (!meta.title || !meta.group || !meta.order || !meta.summary) throw new Error(`Help chapter ${id}: front matter needs title, group, order and summary.`)
  if (!Number.isFinite(Number(meta.order))) throw new Error(`Help chapter ${id}: order must be a number.`)
  if (!(HELP_GROUPS as readonly string[]).includes(meta.group)) throw new Error(`Help chapter ${id}: group must be one of ${HELP_GROUPS.join(', ')}.`)

  const blocks: HelpBlock[] = []
  const lines = source.slice(front![0].length).split('\n')
  let para: string[] = []
  // A list's items as written, parsed when the list ends (so a wrapped item stays one).
  let list: { type: 'ul' | 'ol'; lines: string[] } | null = null
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', inline: parseInline(para.join(' ')) })
    para = []
    if (list) blocks.push({ type: list.type, items: list.lines.map(parseInline) })
    list = null
  }
  for (const raw of lines) {
    const line = raw.trim()
    // An indented line under a list item goes on with it.
    if (list && line && /^\s/.test(raw) && !/^\s*(-|\d+\.)\s/.test(raw)) {
      list.lines[list.lines.length - 1] += ` ${line}`
      continue
    }
    if (!line) {
      flush()
      continue
    }
    const heading = /^##\s+(.+)$/.exec(line)
    const bullet = /^-\s+(.+)$/.exec(line)
    const numbered = /^\d+\.\s+(.+)$/.exec(line)
    const tip = /^>\s?(.*)$/.exec(line)
    const image = /^!\[([^\]]*)\]\(([a-z0-9-]+\.(?:jpg|png))(?:\s+"([^"]*)")?\)$/.exec(line)
    if (heading) {
      flush()
      blocks.push({ type: 'h2', text: heading[1]!, id: slugOf(heading[1]!) })
    } else if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol'
      if (para.length || (list && list.type !== type)) flush()
      list ??= { type, lines: [] }
      list.lines.push((bullet ?? numbered)![1]!)
    } else if (tip) {
      flush()
      blocks.push({ type: 'tip', inline: parseInline(tip[1]!) })
    } else if (image) {
      flush()
      blocks.push({ type: 'img', src: `/help/${image[2]}`, alt: image[1]!, caption: image[3] ?? '' })
    } else if (line.startsWith('![') && LINK.test(line.slice(1))) {
      // A picture from anywhere but /help is left out.
      flush()
    } else {
      if (list) flush()
      para.push(line)
    }
  }
  flush()

  const text = [meta.title, ...blocks.map((b) => (b.type === 'h2' ? b.text : b.type === 'img' ? b.caption : 'items' in b ? b.items.map(plain).join(' ') : plain(b.inline)))].join(' ')
  return {
    id,
    title: meta.title,
    group: meta.group as HelpGroup,
    order: Number(meta.order),
    summary: meta.summary,
    needs: (meta.needs as HelpChapter['needs']) || null,
    blocks,
    text,
  }
}
