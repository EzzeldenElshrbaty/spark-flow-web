import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { TablePlugin } from '@lexical/react/LexicalTablePlugin'
import { $isListNode, ListNode } from '@lexical/list'
import { $isHeadingNode, HeadingNode } from '@lexical/rich-text'
import { $getNodeByKey, $getSelection, $isRangeSelection, COMMAND_PRIORITY_NORMAL, FORMAT_TEXT_COMMAND, KEY_DOWN_COMMAND } from 'lexical'
import { useEffect, useRef } from 'react'
import { webAddress } from '@/lib/webAddress'
import type { PageBody } from '@/lib/pageBody'
import { AutocompletePlugin, type ComposerDirectory } from '@/pages/chat/composer/AutocompletePlugin'
import { $editorFromPage, $pageFromEditor, PAGE_NODES, PAGE_TRANSFORMERS } from './pageNodes'
import { PageToolbar } from './PageToolbar'

export const PAGE_PLACEHOLDER = 'Start the channel’s page…'

/** The page's look in the editor, in chat's tokens; headings as the read-only view draws them. */
const THEME = {
  paragraph: 'sf-body m-0',
  heading: { h1: 'sf-title mt-4 first:mt-0', h2: 'sf-heading mt-4 first:mt-0', h3: 'sf-body-strong mt-3 first:mt-0' },
  quote: 'm-0 border-s-4 border-sf-line ps-3 text-sf-text-secondary',
  list: {
    ul: 'm-0 list-disc ps-6',
    ol: 'm-0 list-decimal ps-6',
    listitem: '',
    checklist: 'm-0 list-none ps-0',
    // A 20 px box drawn before the text; Lexical toggles it on a click there, Space flips it from the keyboard.
    listitemChecked:
      'relative list-none ps-8 text-sf-text-secondary line-through before:absolute before:start-1 before:top-0.5 before:size-5 before:cursor-pointer before:rounded-sf-sm before:border before:border-sf-accent-fill before:bg-sf-accent-fill before:content-["✓"] before:text-center before:text-[13px]/[18px] before:text-sf-on-accent before:no-underline',
    listitemUnchecked:
      'relative list-none ps-8 before:absolute before:start-1 before:top-0.5 before:size-5 before:cursor-pointer before:rounded-sf-sm before:border before:border-sf-line-strong before:bg-sf-surface before:content-[""]',
  },
  code: 'sf-code m-0 block rounded-sf-md border border-sf-line bg-sf-surface-sunken px-3 py-2 whitespace-pre-wrap',
  link: 'text-sf-accent underline',
  table: 'my-2 border-collapse',
  tableScrollableWrapper: 'my-2 overflow-x-auto',
  tableCell: 'border border-sf-line px-2 py-1 align-top text-start min-w-24',
  tableCellHeader: 'bg-sf-surface-sunken font-semibold',
  tableSelection: 'bg-sf-surface-selected',
  text: {
    bold: 'font-semibold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'line-through',
    underlineStrikethrough: '[text-decoration:underline_line-through]',
    code: 'sf-code rounded-sf-sm border border-sf-line bg-sf-surface-sunken px-1',
  },
}

type Props = {
  initial: PageBody
  editable: boolean
  directory: ComposerDirectory
  onChange: (body: PageBody) => void
  /** The editor lost focus: save now. */
  onBlur: () => void
}

/**
 * The channel's page as an editor (chat spec 6.14 §6.2): chat's formatting plus headings, checklists and tables, with
 * the composer's markdown shortcuts and its `@` list (no @channel or @here). The toolbar shows while it's editable.
 */
export function PageEditor(props: Props) {
  const config = {
    namespace: 'flow-page',
    nodes: PAGE_NODES,
    theme: THEME,
    editable: props.editable,
    onError: (e: Error) => {
      throw e
    },
    editorState: () => $editorFromPage(props.initial),
  }
  return (
    <LexicalComposer initialConfig={config}>
      <Inner {...props} />
    </LexicalComposer>
  )
}

function Inner({ editable, directory, onChange, onBlur }: Props) {
  const [editor] = useLexicalComposerContext()
  const box = useRef<HTMLDivElement>(null)
  const menuOpen = useRef(false)
  const onlyTasks = useRef(false)
  useEffect(() => editor.setEditable(editable), [editor, editable])

  // The `@` list opens above the block the caret is in, not above the whole page.
  const caretBlock = useRef<HTMLElement | null>(null)
  useEffect(() => {
    caretBlock.current ??= box.current
    return editor.registerUpdateListener(({ editorState }) =>
      editorState.read(() => {
        const selection = $getSelection()
        const top = $isRangeSelection(selection) ? selection.anchor.getNode().getTopLevelElement() : null
        const element = top && editor.getElementByKey(top.getKey())
        if (element) caretBlock.current = element
      }),
    )
  }, [editor])

  // Lexical makes a checklist's items checkboxes (role="checkbox" on each li): its list is a group of them, not a list.
  useEffect(
    () =>
      editor.registerMutationListener(ListNode, (mutations) =>
        editor.getEditorState().read(() => {
          for (const [key, mutation] of mutations) {
            const node = mutation === 'destroyed' ? null : $getNodeByKey(key)
            const dom = editor.getElementByKey(key)
            if (!$isListNode(node) || !dom) continue
            if (node.getListType() === 'check') dom.setAttribute('role', 'group')
            else dom.removeAttribute('role')
          }
        }),
      ),
    [editor],
  )

  // The screen's h1 is the channel's name: a page's Heading 1 reads as level 2, and so on (as the read-only view).
  useEffect(
    () =>
      editor.registerMutationListener(HeadingNode, (mutations) =>
        editor.getEditorState().read(() => {
          for (const [key, mutation] of mutations) {
            const node = mutation === 'destroyed' ? null : $getNodeByKey(key)
            const dom = editor.getElementByKey(key)
            if ($isHeadingNode(node) && dom) dom.setAttribute('aria-level', String(Number(node.getTag().slice(1)) + 1))
          }
        }),
      ),
    [editor],
  )

  // ⌘/Ctrl B and I (the toolbar's shortcuts).
  useEffect(
    () =>
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          const format = ({ b: 'bold', i: 'italic' } as const)[event.key.toLowerCase() as 'b' | 'i']
          if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey || !format) return false
          event.preventDefault()
          return editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)
        },
        COMMAND_PRIORITY_NORMAL,
      ),
    [editor],
  )

  /** Link a task: `@` at the caret (after a space), and the list offers tasks only. */
  const linkTask = () => {
    onlyTasks.current = true
    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return
      const before = selection.anchor.getNode().getTextContent().slice(0, selection.anchor.offset)
      selection.insertText(before === '' || /\s$/.test(before) ? '@' : ' @')
    })
  }

  return (
    <div ref={box} className="flex min-h-0 flex-1 flex-col">
      {editable && <PageToolbar onLinkTask={linkTask} />}
      <div className="relative mx-auto w-full max-w-[760px] px-4 py-4 md:px-6">
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              aria-label="Channel page"
              aria-placeholder={PAGE_PLACEHOLDER}
              ariaAutoComplete="list"
              placeholder={<span className="sf-body pointer-events-none absolute start-4 top-4 text-sf-text-muted md:start-6">{PAGE_PLACEHOLDER}</span>}
              onBlur={onBlur}
              className="sf-body min-h-40 break-words text-sf-text outline-none [overflow-wrap:anywhere] [&>*+*]:mt-1"
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>
      <HistoryPlugin />
      <ListPlugin />
      <CheckListPlugin />
      <TablePlugin hasCellMerge={false} hasCellBackgroundColor={false} hasHorizontalScroll />
      <LinkPlugin validateUrl={(url) => webAddress(url) !== null} />
      <MarkdownShortcutPlugin transformers={PAGE_TRANSFORMERS} />
      <OnChangePlugin onChange={(state) => state.read(() => onChange($pageFromEditor()))} ignoreSelectionChange />
      <AutocompletePlugin directory={directory} menuOpen={menuOpen} anchor={caretBlock} groups={false} onlyTasks={onlyTasks} />
    </div>
  )
}
