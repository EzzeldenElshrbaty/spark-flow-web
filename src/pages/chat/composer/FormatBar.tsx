import { $createCodeNode, $isCodeNode } from '@lexical/code'
import { $isLinkNode } from '@lexical/link'
import { $isListNode, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, REMOVE_LIST_COMMAND } from '@lexical/list'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $createQuoteNode, $isQuoteNode } from '@lexical/rich-text'
import { $setBlocksType } from '@lexical/selection'
import { $findMatchingParent } from '@lexical/utils'
import {
  IconBlockquote,
  IconBold,
  IconCode,
  IconItalic,
  IconLink,
  IconList,
  IconListNumbers,
  IconSourceCode,
  IconStrikethrough,
  IconUnderline,
  type TablerIcon,
} from '@tabler/icons-react'
import { $createParagraphNode, $getSelection, $isRangeSelection, $isRootOrShadowRoot, FORMAT_TEXT_COMMAND, type LexicalNode, type TextFormatType } from 'lexical'
import { useEffect, useState } from 'react'
import { IconButton } from '@/components/sf/Button'

type Block = 'paragraph' | 'bullet' | 'number' | 'quote' | 'code'
type State = { formats: Set<TextFormatType>; block: Block; link: boolean }

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl'

/** What's on at the caret: the text formats, the block it's in, whether it's in a link. */
function $state(): State {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return { formats: new Set(), block: 'paragraph', link: false }
  const formats = new Set((['bold', 'italic', 'underline', 'strikethrough', 'code'] as TextFormatType[]).filter((f) => selection.hasFormat(f)))
  const anchor = selection.anchor.getNode()
  const top = $findMatchingParent(anchor, (n: LexicalNode) => $isRootOrShadowRoot(n.getParent())) ?? anchor
  const block: Block = $isListNode(top) ? (top.getListType() === 'number' ? 'number' : 'bullet') : $isQuoteNode(top) ? 'quote' : $isCodeNode(top) ? 'code' : 'paragraph'
  const link = Boolean($findMatchingParent(anchor, $isLinkNode))
  return { formats, block, link }
}

/**
 * The formatting row (spec 6.8): bold, italic, underline, strikethrough | link | numbered list, bulleted list |
 * quote, code, code block. Each shows pressed while it applies at the caret; the buttons keep the caret in the editor.
 */
export function FormatBar({ onLink }: { onLink: () => void }) {
  const [editor] = useLexicalComposerContext()
  const [state, setState] = useState<State>({ formats: new Set(), block: 'paragraph', link: false })
  useEffect(() => editor.registerUpdateListener(({ editorState }) => editorState.read(() => setState($state()))), [editor])

  const format = (f: TextFormatType) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, f)
  const setBlock = (block: 'quote' | 'code') =>
    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return
      const off = state.block === block
      $setBlocksType(selection, () => (off ? $createParagraphNode() : block === 'quote' ? $createQuoteNode() : $createCodeNode()))
    })
  const list = (kind: 'bullet' | 'number') =>
    editor.dispatchCommand(state.block === kind ? REMOVE_LIST_COMMAND : kind === 'bullet' ? INSERT_UNORDERED_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND, undefined)

  const button = (label: string, icon: TablerIcon, pressed: boolean, run: () => void, shortcut?: string[]) => (
    <IconButton
      label={label}
      icon={icon}
      size="sm"
      tone="muted"
      pressed={pressed}
      shortcut={shortcut}
      // Keep the caret (and the selection) in the editor.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        run()
        editor.focus()
      }}
    />
  )
  const sep = <span aria-hidden className="mx-1 h-4 w-px bg-sf-line" />
  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 px-1 pt-1">
      {button('Bold', IconBold, state.formats.has('bold'), () => format('bold'), [mod, 'B'])}
      {button('Italic', IconItalic, state.formats.has('italic'), () => format('italic'), [mod, 'I'])}
      {button('Underline', IconUnderline, state.formats.has('underline'), () => format('underline'), [mod, 'U'])}
      {button('Strikethrough', IconStrikethrough, state.formats.has('strikethrough'), () => format('strikethrough'), [mod, 'Shift', 'X'])}
      {sep}
      {button('Link', IconLink, state.link, onLink, [mod, 'K'])}
      {sep}
      {button('Numbered list', IconListNumbers, state.block === 'number', () => list('number'))}
      {button('Bulleted list', IconList, state.block === 'bullet', () => list('bullet'))}
      {sep}
      {button('Quote', IconBlockquote, state.block === 'quote', () => setBlock('quote'))}
      {button('Code', IconCode, state.formats.has('code'), () => format('code'))}
      {button('Code block', IconSourceCode, state.block === 'code', () => setBlock('code'))}
    </div>
  )
}
