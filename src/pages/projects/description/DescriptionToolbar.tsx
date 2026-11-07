import { $createCodeNode } from '@lexical/code'
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, REMOVE_LIST_COMMAND } from '@lexical/list'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $createQuoteNode } from '@lexical/rich-text'
import { $setBlocksType } from '@lexical/selection'
import { Bold, Code, Italic, Link, List, ListOrdered, Paperclip, Quote, SquareCode, Strikethrough, Underline, type LucideIcon } from 'lucide-react'
import { $createParagraphNode, $getSelection, $isRangeSelection, FORMAT_TEXT_COMMAND, type TextFormatType } from 'lexical'
import { useEffect, useRef, useState } from 'react'
import { acceptedFiles } from '@/lib/fileTypes'
import { $formatState, type FormatState } from '@/pages/chat/composer/FormatBar'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'

/**
 * The description's toolbar (spec 5.1): bold, italic, underline, strikethrough · link · bulleted, numbered list ·
 * quote, code, code block · attach files. Each shows pressed while it applies at the caret, and keeps the caret in the
 * editor. On a phone the row scrolls sideways.
 */
export function DescriptionToolbar({ onLink, onFiles }: { onLink: () => void; onFiles: (files: File[]) => void }) {
  const [editor] = useLexicalComposerContext()
  const [state, setState] = useState<FormatState>({ formats: new Set(), block: 'paragraph', link: false })
  const pickRef = useRef<HTMLInputElement>(null)
  useEffect(() => editor.registerUpdateListener(({ editorState }) => editorState.read(() => setState($formatState()))), [editor])

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

  const button = (label: string, Icon: LucideIcon, pressed: boolean | null, run: () => void, keys?: string) => (
    <button
      type="button"
      aria-label={label}
      title={keys ? `${label} (${keys})` : label}
      {...(pressed !== null && { 'aria-pressed': pressed })}
      // Keep the caret (and the selection) in the editor.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        run()
        if (pressed !== null) editor.focus()
      }}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-surface-muted hover:text-fg aria-pressed:bg-surface-muted aria-pressed:text-fg"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  )
  const sep = <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-line" />
  return (
    <div role="toolbar" aria-label="Formatting" className="flex items-center gap-0.5 overflow-x-auto border-b border-line-subtle px-1 py-1">
      {button('Bold', Bold, state.formats.has('bold'), () => format('bold'), `${mod}B`)}
      {button('Italic', Italic, state.formats.has('italic'), () => format('italic'), `${mod}I`)}
      {button('Underline', Underline, state.formats.has('underline'), () => format('underline'), `${mod}U`)}
      {button('Strikethrough', Strikethrough, state.formats.has('strikethrough'), () => format('strikethrough'), `${mod}Shift+X`)}
      {sep}
      {button('Link', Link, state.link, onLink, `${mod}K`)}
      {sep}
      {button('Bulleted list', List, state.block === 'bullet', () => list('bullet'))}
      {button('Numbered list', ListOrdered, state.block === 'number', () => list('number'))}
      {sep}
      {button('Quote', Quote, state.block === 'quote', () => setBlock('quote'))}
      {button('Code', Code, state.formats.has('code'), () => format('code'))}
      {button('Code block', SquareCode, state.block === 'code', () => setBlock('code'))}
      {sep}
      {button('Attach files', Paperclip, null, () => pickRef.current?.click())}
      <input
        ref={pickRef}
        type="file"
        multiple
        accept={acceptedFiles}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const picked = [...(e.target.files ?? [])]
          e.target.value = ''
          if (picked.length) onFiles(picked)
        }}
      />
    </div>
  )
}
