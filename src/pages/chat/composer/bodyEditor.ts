import { $createCodeNode, $isCodeNode, CodeNode } from '@lexical/code'
import { $createLinkNode, $isLinkNode, AutoLinkNode, LinkNode } from '@lexical/link'
import { $createListItemNode, $createListNode, $isListItemNode, $isListNode, ListItemNode, ListNode } from '@lexical/list'
import { $createQuoteNode, $isQuoteNode, HeadingNode, QuoteNode } from '@lexical/rich-text'
import {
  $applyNodeReplacement,
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isLineBreakNode,

  $isTextNode,
  TextNode,
  type EditorConfig,
  type ElementNode,
  type Klass,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
  type TextFormatType,
} from 'lexical'
import { appendInlines, autoInlines, type Block, type Body, type Inline, type Mark } from '@/lib/messageBody'

/** What a pill in the composer stands for: a person, everyone (@channel), whoever is active (@here), a channel or a project. */
export type Entity = Extract<Inline, { type: 'user' | 'all' | 'here' | 'channel' | 'project' }>

const label = (e: Entity) =>
  e.type === 'user' ? `@${e.name}` : e.type === 'all' ? '@channel' : e.type === 'here' ? '@here' : e.type === 'channel' ? `#${e.name}` : `@${e.key}`

type SerializedEntityNode = Spread<{ entity: Entity }, SerializedTextNode>

/** A mention or channel link in the composer: one token (deleted whole), shown as a pill. */
export class EntityNode extends TextNode {
  __entity: Entity

  static getType() {
    return 'entity'
  }
  static clone(node: EntityNode) {
    return new EntityNode(node.__entity, node.__key)
  }
  static importJSON(json: SerializedEntityNode) {
    return $createEntityNode(json.entity)
  }
  constructor(entity: Entity, key?: NodeKey) {
    super(label(entity), key)
    this.__entity = entity
  }
  exportJSON(): SerializedEntityNode {
    return { ...super.exportJSON(), entity: this.__entity, type: 'entity', version: 1 }
  }
  createDOM(config: EditorConfig) {
    const dom = super.createDOM(config)
    dom.className = 'rounded-sf-sm bg-sf-surface-mention px-0.5 font-medium text-sf-accent'
    return dom
  }
  isTextEntity() {
    return true
  }
  canInsertTextBefore() {
    return false
  }
  canInsertTextAfter() {
    return false
  }
  getEntity() {
    return this.getLatest().__entity
  }
}

export function $createEntityNode(entity: Entity): EntityNode {
  return $applyNodeReplacement(new EntityNode(entity).setMode('token'))
}
export const $isEntityNode = (node: LexicalNode | null | undefined): node is EntityNode => node instanceof EntityNode

/** The nodes the composer's editor knows. */
export const COMPOSER_NODES: Klass<LexicalNode>[] = [HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode, LinkNode, AutoLinkNode, EntityNode]

const FORMATS: [TextFormatType, Mark][] = [
  ['bold', 'b'],
  ['italic', 'i'],
  ['underline', 'u'],
  ['strikethrough', 's'],
  ['code', 'code'],
]

// ── Editor → body ────────────────────────────────────────────────────────

/** The inlines of an element's children: formatted text (with addresses and task keys found), links, pills, breaks. */
function inlinesOf(element: ElementNode): Inline[] {
  const out: Inline[] = []
  for (const child of element.getChildren()) {
    if ($isEntityNode(child)) out.push(child.getEntity())
    else if ($isTextNode(child)) appendInlines(out, autoInlines(child.getTextContent(), FORMATS.filter(([f]) => child.hasFormat(f)).map(([, m]) => m)))
    else if ($isLineBreakNode(child)) appendInlines(out, [{ type: 'text', text: '\n' }])
    else if ($isLinkNode(child)) {
      const text = child.getTextContent()
      if (text) out.push({ type: 'link', href: child.getURL(), text })
    } else if ($isElementNode(child)) appendInlines(out, inlinesOf(child))
  }
  return out
}

const blank = (inlines: Inline[]) => inlines.every((n) => n.type === 'text' && !n.text.trim())

/** The list's items, nested lists flattened into it (the body has one level). */
function itemsOf(list: ListNode): Inline[][] {
  const items: Inline[][] = []
  for (const item of list.getChildren()) {
    if (!$isListItemNode(item)) continue
    const nested = item.getChildren().find($isListNode)
    if (nested) items.push(...itemsOf(nested))
    else items.push(inlinesOf(item))
  }
  return items.filter((i) => !blank(i))
}

/** One of the editor's top-level nodes as a block; null when it holds nothing (an empty paragraph or item). */
export function $blockOf(node: LexicalNode): Block | null {
  if ($isCodeNode(node)) {
    const text = node.getTextContent()
    return text.trim() ? { type: 'code', text } : null
  }
  if ($isQuoteNode(node)) {
    const inlines = inlinesOf(node)
    return blank(inlines) ? null : { type: 'quote', children: [{ type: 'p', children: inlines }] }
  }
  if ($isListNode(node)) {
    const items = itemsOf(node)
    return items.length ? { type: node.getListType() === 'number' ? 'ol' : 'ul', items } : null
  }
  if ($isElementNode(node)) {
    const inlines = inlinesOf(node)
    return blank(inlines) ? null : { type: 'p', children: inlines }
  }
  return null
}

/** What's in the editor, as a message body. Empty paragraphs and items are left out. */
export function $bodyFromEditor(): Body {
  return $getRoot()
    .getChildren()
    .flatMap((node) => $blockOf(node) ?? [])
}

// ── Body → editor ────────────────────────────────────────────────────────

/** Text with its line breaks as break nodes. */
function textNodes(text: string, marks: Mark[] = []): LexicalNode[] {
  return text.split('\n').flatMap((line, i) => {
    const nodes: LexicalNode[] = i > 0 ? [$createLineBreakNode()] : []
    if (line) {
      const node = $createTextNode(line)
      for (const [format, mark] of FORMATS) if (marks.includes(mark)) node.toggleFormat(format)
      nodes.push(node)
    }
    return nodes
  })
}

function inlineNodes(inlines: Inline[]): LexicalNode[] {
  return inlines.flatMap((n): LexicalNode[] => {
    if (n.type === 'text') return textNodes(n.text, n.marks)
    if (n.type === 'link') return [$createLinkNode(n.href).append($createTextNode(n.text))]
    if (n.type === 'task') return [$createTextNode(n.key)]
    return [$createEntityNode(n)]
  })
}

/** A quote's blocks as one run of inlines (the editor's quote holds lines, not blocks). */
function quoteInlines(blocks: Block[]): Inline[] {
  const out: Inline[] = []
  blocks.forEach((b, i) => {
    if (i > 0) appendInlines(out, [{ type: 'text', text: '\n' }])
    if (b.type === 'p') appendInlines(out, b.children)
    else if (b.type === 'code') appendInlines(out, [{ type: 'text', text: b.text, marks: ['code'] }])
    else if (b.type === 'quote') appendInlines(out, quoteInlines(b.children))
    else b.items.forEach((item, j) => appendInlines(out, [...(j > 0 ? [{ type: 'text', text: '\n' } as Inline] : []), ...item]))
  })
  return out
}

/** Adds one block at the end of `root` as the editor's nodes. */
export function $appendBlock(root: ElementNode, b: Block) {
  if (b.type === 'p') root.append($createParagraphNode().append(...inlineNodes(b.children)))
  else if (b.type === 'quote') root.append($createQuoteNode().append(...inlineNodes(quoteInlines(b.children))))
  else if (b.type === 'code') root.append($createCodeNode().append(...textNodes(b.text)))
  else root.append($createListNode(b.type === 'ol' ? 'number' : 'bullet').append(...b.items.map((item) => $createListItemNode().append(...inlineNodes(item)))))
}

/** Replaces what's in the editor with a body (a draft coming back, a message being edited). */
export function $editorFromBody(body: Body) {
  const root = $getRoot().clear()
  for (const b of body) $appendBlock(root, b)
  if (root.getChildrenSize() === 0) root.append($createParagraphNode())
}

/** Whether the editor holds nothing to send. */
export const $isEditorEmpty = () => $bodyFromEditor().length === 0

