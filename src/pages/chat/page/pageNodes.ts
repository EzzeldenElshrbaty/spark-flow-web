import { $createListItemNode, $createListNode, $isListItemNode, $isListNode, type ListNode } from '@lexical/list'
import { CHECK_LIST, HEADING, type Transformer } from '@lexical/markdown'
import { $createHeadingNode, $isHeadingNode } from '@lexical/rich-text'
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableCellHeaderStates,
  TableCellNode,
  TableNode,
  TableRowNode,
} from '@lexical/table'
import { $createParagraphNode, $getRoot, type Klass, type LexicalNode } from 'lexical'
import { appendInlines, type Block, type Inline } from '@/lib/messageBody'
import type { PageBlock, PageBody } from '@/lib/pageBody'
import { $appendBlock, $blockOf, COMPOSER_NODES, inlineNodes } from '@/pages/chat/composer/bodyEditor'
import { COMPOSER_TRANSFORMERS } from '@/pages/chat/composer/markdown'

/** The nodes a channel's page knows (chat spec 6.14): the composer's, plus tables. Check lists are ListNodes. */
export const PAGE_NODES: Klass<LexicalNode>[] = [...COMPOSER_NODES, TableNode, TableRowNode, TableCellNode]

/** The composer's shortcuts plus `#`–`###` for headings and `[ ]` / `[x]` for checklists (before `-` makes a list). */
export const PAGE_TRANSFORMERS: Transformer[] = [HEADING, CHECK_LIST, ...COMPOSER_TRANSFORMERS]

const LEVELS = { h1: 'h1', h2: 'h2', h3: 'h3' } as const

/** A node's text as inlines, the composer's way (task keys and addresses found); empty when it holds nothing. */
const inlinesIn = (node: LexicalNode): Inline[] => {
  const block = $blockOf(node)
  return block?.type === 'p' ? block.children : []
}

/** Any block as one run of inlines, its lines a line break apart: what a table cell keeps of a list, quote or code. */
function flatInlines(block: Block): Inline[] {
  const lines: Inline[][] =
    block.type === 'p' ? [block.children] : block.type === 'code' ? [[{ type: 'text', text: block.text }]] : block.type === 'quote' ? block.children.map(flatInlines) : block.items
  const out: Inline[] = []
  lines.forEach((line, i) => appendInlines(out, i > 0 ? [{ type: 'text', text: '\n' }, ...line] : line))
  return out
}

/** A check list's items, nested ones flattened into it (a page has one level); empty items left out. */
function checkItems(list: ListNode): { checked: boolean; children: Inline[] }[] {
  return list.getChildren().flatMap((item) => {
    if (!$isListItemNode(item)) return []
    const nested = item.getChildren().find($isListNode)
    if (nested) return checkItems(nested)
    const children = inlinesIn(item)
    return children.length ? [{ checked: item.getChecked() ?? false, children }] : []
  })
}

/**
 * A cell's paragraphs as one run of inlines, a line apart (empty ones left out); an empty cell is an empty run. A list,
 * quote or code block made in a cell (markdown shortcuts work there) keeps its text as lines.
 */
function cellInlines(cell: TableCellNode): Inline[] {
  const out: Inline[] = []
  cell
    .getChildren()
    .map((child) => {
      const block = $blockOf(child)
      return block ? flatInlines(block) : []
    })
    .filter((run) => run.length > 0)
    .forEach((run, i) => appendInlines(out, i > 0 ? [{ type: 'text', text: '\n' }, ...run] : run))
  return out
}

function $pageBlockOf(node: LexicalNode): PageBlock | null {
  if ($isHeadingNode(node)) {
    const children = inlinesIn(node)
    const tag = node.getTag()
    return children.length ? { type: tag in LEVELS ? LEVELS[tag as keyof typeof LEVELS] : 'h3', children } : null
  }
  if ($isListNode(node) && node.getListType() === 'check') {
    const items = checkItems(node)
    return items.length ? { type: 'check', items } : null
  }
  if ($isTableNode(node)) {
    const rows = node.getChildren().filter($isTableRowNode).map((row) => row.getChildren().filter($isTableCellNode).map(cellInlines))
    return rows.length ? { type: 'table', rows } : null
  }
  return $blockOf(node)
}

/** What's in the editor, as a page. Empty paragraphs, headings and items are left out. */
export function $pageFromEditor(): PageBody {
  return $getRoot()
    .getChildren()
    .flatMap((node) => $pageBlockOf(node) ?? [])
}

/** Replaces what's in the editor with a page; the first row of a table is its header. */
export function $editorFromPage(body: PageBody) {
  const root = $getRoot().clear()
  for (const b of body) {
    switch (b.type) {
      case 'h1':
      case 'h2':
      case 'h3':
        root.append($createHeadingNode(b.type).append(...inlineNodes(b.children)))
        break
      case 'check':
        root.append($createListNode('check').append(...b.items.map((item) => $createListItemNode(item.checked).append(...inlineNodes(item.children)))))
        break
      case 'table': {
        const header = (r: number) => (r === 0 ? TableCellHeaderStates.ROW : TableCellHeaderStates.NO_STATUS)
        const rows = b.rows.map((row, r) => $createTableRowNode().append(...row.map((cell) => $createTableCellNode(header(r)).append($createParagraphNode().append(...inlineNodes(cell))))))
        root.append($createTableNode().append(...rows))
        break
      }
      default:
        $appendBlock(root, b)
    }
  }
  if (root.getChildrenSize() === 0) root.append($createParagraphNode())
}
