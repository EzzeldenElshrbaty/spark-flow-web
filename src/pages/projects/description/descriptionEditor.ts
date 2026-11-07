import { $insertNodeToNearestRoot } from '@lexical/utils'
import { $createParagraphNode, $getRoot, $getSelection, $isRangeSelection, type Klass, type LexicalNode } from 'lexical'
import { $appendBlock, $blockOf, COMPOSER_NODES, EntityNode } from '@/pages/chat/composer/bodyEditor'
import { appendInlines, type Block, type DescBody, type Inline } from '@/lib/messageBody'
import { $createFileNode, $isFileNode, FileNode, type DescFile } from './FileNode'

/** The nodes the description editor knows: chat's formatting, no pills, and the task's files. */
export const DESCRIPTION_NODES: Klass<LexicalNode>[] = [...COMPOSER_NODES.filter((node) => node !== EntityNode), FileNode]

/** A description holds text and links only: a task key the chat would make a chip stays the text it is. */
function plain(inlines: Inline[]): Inline[] {
  const out: Inline[] = []
  for (const n of inlines) appendInlines(out, [n.type === 'task' ? { type: 'text', text: n.key } : n])
  return out
}
function plainBlock(b: Block): Block {
  if (b.type === 'p') return { type: 'p', children: plain(b.children) }
  if (b.type === 'quote') return { type: 'quote', children: b.children.map(plainBlock) }
  if (b.type === 'code') return b
  return { type: b.type, items: b.items.map(plain) }
}

/** What's in the editor, as a description: its blocks and, on lines of their own, its files. Empty lines left out. */
export function $descriptionFromEditor(): DescBody {
  const body: DescBody = []
  for (const node of $getRoot().getChildren()) {
    if ($isFileNode(node)) body.push({ type: 'file', id: node.getFile().id })
    else {
      const block = $blockOf(node)
      if (block) body.push(plainBlock(block))
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

/** Puts a file where the caret is (splitting its line), or at the end when there's no caret. */
export function $insertFile(file: DescFile) {
  const node = $createFileNode(file)
  if ($isRangeSelection($getSelection())) $insertNodeToNearestRoot(node)
  else $getRoot().append(node)
  $roomAfterLastFile()
}

/** Takes a file out of the description, wherever it shows. */
export function $removeFile(id: string) {
  for (const node of $getRoot().getChildren()) if ($isFileNode(node) && node.getFile().id === id) node.remove()
}
