import { $applyNodeReplacement, DecoratorNode, type LexicalNode, type NodeKey, type SerializedLexicalNode, type Spread } from 'lexical'
import type { ReactNode } from 'react'
import type { Attachment } from '@/api/types'
import { DescriptionFile } from './DescriptionFile'

/** What a description needs of one of the task's files to show it. */
export type DescFile = Pick<Attachment, 'id' | 'title' | 'name' | 'mimeType' | 'size'>

type SerializedFileNode = Spread<{ file: DescFile }, SerializedLexicalNode>

/** One of the task's files in its description, on a line of its own: a picture, or a chip. Deleted whole. */
export class FileNode extends DecoratorNode<ReactNode> {
  __file: DescFile

  static getType() {
    return 'description-file'
  }
  static clone(node: FileNode) {
    return new FileNode(node.__file, node.__key)
  }
  static importJSON(json: SerializedFileNode) {
    return $createFileNode(json.file)
  }
  constructor(file: DescFile, key?: NodeKey) {
    super(key)
    this.__file = file
  }
  exportJSON(): SerializedFileNode {
    return { ...super.exportJSON(), file: this.__file, type: 'description-file', version: 1 }
  }
  createDOM() {
    const div = document.createElement('div')
    div.className = 'my-2'
    return div
  }
  updateDOM() {
    return false
  }
  isInline() {
    return false
  }
  getFile() {
    return this.getLatest().__file
  }
  decorate() {
    return <DescriptionFile file={this.__file} />
  }
}

export function $createFileNode(file: DescFile): FileNode {
  return $applyNodeReplacement(new FileNode(file))
}
export const $isFileNode = (node: LexicalNode | null | undefined): node is FileNode => node instanceof FileNode
