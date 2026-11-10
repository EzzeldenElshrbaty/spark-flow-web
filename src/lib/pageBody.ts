import { MAX_NODES, inlineText, spend, validBlock, validInlines, type Block, type Budget, type Inline } from '@/lib/messageBody'

/**
 * A channel's page (chat spec 6.14): chat's blocks plus headings, checklists and tables. The mock and the editor
 * share these rules; the page renders it as elements, never as HTML.
 */
export type PageBlock =
  | Block
  | { type: 'h1' | 'h2' | 'h3'; children: Inline[] }
  | { type: 'check'; items: { checked: boolean; children: Inline[] }[] }
  | { type: 'table'; rows: Inline[][][] }

export type PageBody = PageBlock[]

/** How much a page may hold. */
export const MAX_PAGE_TEXT = 50_000
export const MAX_PAGE_BLOCKS = 2_000
export const MAX_TABLE_COLUMNS = 10
export const MAX_TABLE_ROWS = 100

/** One person edits at a time: their hold lasts this long after their last keystroke. */
export const PAGE_HOLD_MS = 60_000
/** One person's saves within this long of their first count as one version. */
export const PAGE_RUN_MS = 600_000
export const PAGE_VERSIONS_KEPT = 100
/** The editor saves this long after the last change. */
export const PAGE_SAVE_AFTER_MS = 1_000
/** While someone types, the editor renews their hold at most this often. */
export const PAGE_CLAIM_EVERY_MS = 5_000

type Limits = { text: number; nodes: number; blocks: number; columns: number; rows: number }
const STRICT: Limits = { text: MAX_PAGE_TEXT, nodes: MAX_NODES, blocks: MAX_PAGE_BLOCKS, columns: MAX_TABLE_COLUMNS, rows: MAX_TABLE_ROWS }
const LOOSE: Limits = { text: Infinity, nodes: Infinity, blocks: Infinity, columns: Infinity, rows: Infinity }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
// A page names people, never everyone: @channel and @here belong to messages.
const noGroups = (list: Inline[] | null) => (list && list.every((n) => n.type !== 'all' && n.type !== 'here') ? list : null)

function validPageBlock(b: unknown, budget: Budget, limits: Limits): PageBlock | null {
  if (!isRecord(b)) return null
  switch (b.type) {
    case 'h1':
    case 'h2':
    case 'h3': {
      const children = noGroups(validInlines(b.children, budget, limits.text))
      return children && { type: b.type, children }
    }
    case 'check': {
      if (!Array.isArray(b.items) || !spend(budget, b.items.length)) return null
      const items = b.items.map((item) => {
        if (!isRecord(item) || typeof item.checked !== 'boolean') return null
        const children = noGroups(validInlines(item.children, budget, limits.text))
        return children && { checked: item.checked, children }
      })
      return items.every(Boolean) ? { type: 'check', items: items as { checked: boolean; children: Inline[] }[] } : null
    }
    case 'table': {
      const rows = b.rows
      if (!Array.isArray(rows) || rows.length === 0 || rows.length > limits.rows || !spend(budget, rows.length)) return null
      const width = Array.isArray(rows[0]) ? rows[0].length : 0
      if (width === 0 || width > limits.columns) return null
      const out = rows.map((row) => {
        if (!Array.isArray(row) || row.length !== width || !spend(budget, row.length)) return null
        const cells = row.map((cell) => noGroups(validInlines(cell, budget, limits.text)))
        return cells.every(Boolean) ? (cells as Inline[][]) : null
      })
      return out.every(Boolean) ? { type: 'table', rows: out as Inline[][][] } : null
    }
    default: {
      const block = validBlock(b, false, budget, limits.text)
      return block && (pageInlines([block]).some((n) => n.type === 'all' || n.type === 'here') ? null : block)
    }
  }
}

function checkPage(value: unknown, limits: Limits): PageBody | null {
  const budget: Budget = { left: limits.nodes }
  if (!Array.isArray(value) || value.length > limits.blocks || !spend(budget, value.length)) return null
  const blocks = value.map((b) => validPageBlock(b, budget, limits))
  if (!blocks.every(Boolean)) return null
  const body = blocks as PageBody
  return pageText(body).length <= limits.text ? body : null
}

/**
 * A page from a client, checked node by node: only the known blocks, inlines and marks, no @channel or @here, tables
 * with rows of one width, within the limits above. Null when it isn't one.
 */
export const validPage = (value: unknown): PageBody | null => checkPage(value, STRICT)

/** Whether a page is refused only for being past a limit (so the refusal can say "too long"). */
export const pageTooLong = (value: unknown): boolean => checkPage(value, STRICT) === null && checkPage(value, LOOSE) !== null

/** A block as plain text: a table's cells a tab apart and its rows a line apart, check items with their box. */
export function blockText(block: PageBlock): string {
  switch (block.type) {
    case 'h1':
    case 'h2':
    case 'h3':
      return inlineText(block.children)
    case 'check':
      return block.items.map((item) => `${item.checked ? '☑' : '☐'} ${inlineText(item.children)}`).join('\n')
    case 'table':
      return block.rows.map((row) => row.map(inlineText).join('\t')).join('\n')
    case 'p':
      return inlineText(block.children)
    case 'quote':
      return block.children.map(blockText).join('\n')
    case 'code':
      return block.text
    default:
      return block.items.map(inlineText).join('\n')
  }
}

/** The page as plain text, one block a line: what search and a mention's excerpt read. */
export const pageText = (body: PageBody): string => body.map(blockText).join('\n')

function pageInlines(body: PageBody): Inline[] {
  const of = (b: PageBlock): Inline[] => {
    switch (b.type) {
      case 'p':
      case 'h1':
      case 'h2':
      case 'h3':
        return b.children
      case 'quote':
        return b.children.flatMap(of)
      case 'code':
        return []
      case 'check':
        return b.items.flatMap((item) => item.children)
      case 'table':
        return b.rows.flat(2)
      default:
        return b.items.flat()
    }
  }
  return body.flatMap(of)
}

/** A page as chat blocks (headings as paragraphs, checklists and table cells as list items), for what reads inlines only. */
export const pageAsBody = (body: PageBody): Block[] =>
  body.map((b): Block => {
    switch (b.type) {
      case 'h1':
      case 'h2':
      case 'h3':
        return { type: 'p', children: b.children }
      case 'check':
        return { type: 'ul', items: b.items.map((item) => item.children) }
      case 'table':
        return { type: 'ul', items: b.rows.flat() }
      default:
        return b
    }
  })

/** The people a page names, each once, in reading order. */
export const pageMentions = (body: PageBody): string[] => [...new Set(pageInlines(body).flatMap((n) => (n.type === 'user' ? [n.id] : [])))]
