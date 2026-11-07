import { $findMatchingParent, $insertNodeToNearestRoot } from '@lexical/utils'
import { $createParagraphNode, $getNodeByKey, $getRoot, $getSelection, $isRangeSelection, $isRootOrShadowRoot, type Klass, type LexicalNode } from 'lexical'
import { $appendBlock, $blockOf, COMPOSER_NODES, EntityNode, type InlineReader } from '@/pages/chat/composer/bodyEditor'
import { autoInlines, type DescBody, type Inline, type Mark } from '@/lib/messageBody'
import { $createFileNode, $isFileNode, FileNode, type DescFile } from './FileNode'

/** The nodes the description editor knows: chat's formatting, no pills, and the task's files. */
export const DESCRIPTION_NODES: Klass<LexicalNode>[] = [...COMPOSER_NODES.filter((node) => node !== EntityNode), FileNode]

const link = (href: string, text: string, marks: Mark[]): Inline => (marks.length ? { type: 'link', href, text, marks } : { type: 'link', href, text })

/**
 * A description holds text and links only, and keeps their marks: a task key the chat would make a chip stays the
 * text it is, and a web address typed in bold is a bold link.
 */
const DESCRIPTION_READER: InlineReader = {
  text: (text, marks) => autoInlines(text, marks).map((n) => (n.type === 'task' ? { type: 'text', text: n.key, marks } : n.type === 'link' ? link(n.href, n.text, marks) : n)),
  link,
}

/** What's in the editor, as a description: its blocks and, on lines of their own, its files. Empty lines left out. */
export function $descriptionFromEditor(): DescBody {
  const body: DescBody = []
  for (const node of $getRoot().getChildren()) {
    if ($isFileNode(node)) body.push({ type: 'file', id: node.getFile().id })
    else {
      const block = $blockOf(node, DESCRIPTION_READER)
      if (block) body.push(block)
    }
  }
  return body
}

/** A file at the end of the editor gets an empty line after it, so there's somewhere to type. */
function $roomAfterLastFile() {
  const root = $getRoot()
  if (root.getChildrenSize() === 0 || $isFileNode(root.getLastChild())) root.append($createParagraphNode())
}

/** Replaces what's in the editor with a description; a file it doesn't have (`files`) is left out. */
export function $editorFromDescription(body: DescBody, files: ReadonlyMap<string, DescFile>) {
  const root = $getRoot().clear()
  for (const b of body) {
    if (b.type !== 'file') $appendBlock(root, b)
    else {
      const file = files.get(b.id)
      if (file) root.append($createFileNode(file))
    }
  }
  $roomAfterLastFile()
}

/** Where the caret is, as the key of its top-level block (for a file that arrives later); null when there's none. */
export function $caretPlace(): string | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return null
  const anchor = selection.anchor.getNode()
  return ($findMatchingParent(anchor, (n) => $isRootOrShadowRoot(n.getParent())) ?? null)?.getKey() ?? null
}

/**
 * Puts a file in the description. With `after` (a top-level node's key, from `$caretPlace` when the file was added) it
 * goes right after that line, or at the end if the line is gone; without, where the caret is now (splitting its line),
 * or at the end when there's no caret. Returns the file node, so the next file for the same place can follow it.
 */
export function $insertFile(file: DescFile, after?: string | null): LexicalNode {
  const node = $createFileNode(file)
  if (after !== undefined) {
    const line = after ? $getNodeByKey(after) : null
    if (line?.isAttached() && $isRootOrShadowRoot(line.getParent())) line.insertAfter(node)
    else $getRoot().append(node)
  } else if ($isRangeSelection($getSelection())) $insertNodeToNearestRoot(node)
  else $getRoot().append(node)
  $roomAfterLastFile()
  return node
}

/** Takes a file out of the description, wherever it shows. */
export function $removeFile(id: string) {
  for (const node of $getRoot().getChildren()) if ($isFileNode(node) && node.getFile().id === id) node.remove()
}
