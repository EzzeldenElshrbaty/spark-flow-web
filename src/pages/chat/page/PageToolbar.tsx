import { $isListNode, INSERT_CHECK_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, REMOVE_LIST_COMMAND } from '@lexical/list'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $createHeadingNode, $isHeadingNode, type HeadingTagType } from '@lexical/rich-text'
import { $setBlocksType } from '@lexical/selection'
import {
  $deleteTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $insertTableColumnAtSelection,
  $insertTableRowAtSelection,
  $isTableCellNode,
  $isTableNode,
  INSERT_TABLE_COMMAND,
} from '@lexical/table'
import { $findMatchingParent } from '@lexical/utils'
import { IconBold, IconChevronDown, IconItalic, IconListCheck, IconSquareCheck, IconTable, type TablerIcon } from '@tabler/icons-react'
import clsx from 'clsx'
import { $createParagraphNode, $getSelection, $isElementNode, $isRangeSelection, $isRootOrShadowRoot, FORMAT_TEXT_COMMAND, type LexicalNode } from 'lexical'
import { useEffect, useState, type KeyboardEvent } from 'react'
import { IconButton } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Menu, MenuItem } from '@/components/sf/Menu'
import { isRtl } from '@/components/sf/layers'
import { MAX_TABLE_COLUMNS, MAX_TABLE_ROWS } from '@/lib/pageBody'

type Style = 'paragraph' | HeadingTagType | 'bullet' | 'number' | 'check'
const STYLE_NAMES: Record<Exclude<Style, 'check' | 'h4' | 'h5' | 'h6'>, string> = {
  paragraph: 'Normal text',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  bullet: 'Bulleted list',
  number: 'Numbered list',
}
/** `rows` and `columns`: the size of the table the caret is in (0 outside one). */
type State = { style: Style; bold: boolean; italic: boolean; inTable: boolean; rows: number; columns: number }
const EMPTY: State = { style: 'paragraph', bold: false, italic: false, inTable: false, rows: 0, columns: 0 }

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl'

function $toolbarState(): State {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return EMPTY
  const anchor = selection.anchor.getNode()
  const top = $findMatchingParent(anchor, (n: LexicalNode) => $isRootOrShadowRoot(n.getParent())) ?? anchor
  const inTable = Boolean($findMatchingParent(anchor, $isTableCellNode))
  // Inside a table, the block is the cell's paragraph, not the table.
  const block = inTable ? ($findMatchingParent(anchor, (n) => $isTableCellNode(n.getParent())) ?? anchor) : top
  const style: Style = $isListNode(block) ? (block.getListType() as 'bullet' | 'number' | 'check') : $isHeadingNode(block) ? block.getTag() : 'paragraph'
  const table = inTable ? $findMatchingParent(anchor, $isTableNode) : null
  const firstRow = table?.getFirstChild()
  const columns = firstRow && $isElementNode(firstRow) ? firstRow.getChildrenSize() : 0
  return { style, bold: selection.hasFormat('bold'), italic: selection.hasFormat('italic'), inTable, rows: table?.getChildrenSize() ?? 0, columns }
}

// One Tab stop for the row; arrow keys, Home and End move along it (as the message toolbar).
const STOP = 'data-toolbar-stop'
const phoneSize = 'max-md:size-11'

/**
 * The page's formatting row (chat spec 6.14 §6.2): Text style, Bold, Italic, Checklist, Table (its own menu inside a
 * table) and Link a task. It sits under the page bar and sticks to the top of the page while it scrolls; on phones it
 * scrolls sideways and its buttons are 44 px.
 */
export function PageToolbar({ onLinkTask }: { onLinkTask: () => void }) {
  const [editor] = useLexicalComposerContext()
  const [state, setState] = useState<State>(EMPTY)
  const [active, setActive] = useState(0)
  useEffect(() => editor.registerUpdateListener(({ editorState }) => editorState.read(() => setState($toolbarState()))), [editor])

  const run = (fn: () => void) => {
    fn()
    editor.focus()
  }
  const setStyle = (style: Exclude<Style, 'check' | 'h4' | 'h5' | 'h6'>) =>
    run(() => {
      if (style === 'bullet' || style === 'number') {
        editor.dispatchCommand(state.style === style ? REMOVE_LIST_COMMAND : style === 'bullet' ? INSERT_UNORDERED_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND, undefined)
        return
      }
      editor.update(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return
        if (state.style === 'bullet' || state.style === 'number' || state.style === 'check') editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
        $setBlocksType(selection, () => (style === 'paragraph' ? $createParagraphNode() : $createHeadingNode(style)))
      })
    })
  const inTable = (fn: () => void) => run(() => editor.update(fn))

  const stop = (i: number) => ({ tabIndex: i === active ? 0 : -1, onFocus: () => setActive(i), [STOP]: '' })
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>(`[${STOP}]`)]
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (index < 0) return
    const [back, forward] = isRtl(event.currentTarget) ? ['ArrowRight', 'ArrowLeft'] : ['ArrowLeft', 'ArrowRight']
    const to = event.key === forward ? index + 1 : event.key === back ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null
    if (to === null) return
    event.preventDefault()
    items[(to + items.length) % items.length]!.focus()
  }
  const button = (i: number, label: string, icon: TablerIcon, pressed: boolean | undefined, onClick: () => void, shortcut?: string[]) => (
    <IconButton
      label={label}
      icon={icon}
      pressed={pressed}
      shortcut={shortcut}
      className={phoneSize}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => run(onClick)}
      {...stop(i)}
    />
  )
  const menuButton = (i: number, label: string, icon: TablerIcon | null, triggerProps: object) => (
    <button
      type="button"
      {...triggerProps}
      {...stop(i)}
      aria-label={icon ? label : undefined}
      title={icon ? label : undefined}
      className={clsx(
        'sf-focus sf-ui inline-flex h-sf-control flex-none cursor-pointer items-center gap-1 rounded-sf-md px-2 text-sf-text-secondary hover:bg-sf-surface-hover hover:text-sf-text max-md:h-11',
        icon && 'max-md:min-w-11 max-md:justify-center',
      )}
    >
      {icon ? <Icon icon={icon} /> : <span className="whitespace-nowrap">{label}</span>}
      <Icon icon={IconChevronDown} size={16} />
    </button>
  )

  const rowRoom = state.rows >= MAX_TABLE_ROWS ? { disabled: true, hint: `${MAX_TABLE_ROWS} rows at most` } : {}
  const columnRoom = state.columns >= MAX_TABLE_COLUMNS ? { disabled: true, hint: `${MAX_TABLE_COLUMNS} columns at most` } : {}

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      onKeyDown={onKeyDown}
      className="sticky top-0 z-10 flex items-center gap-0.5 overflow-x-auto border-b border-sf-line bg-sf-surface px-4 py-1 md:px-6"
    >
      <Menu label="Text style" trigger={(props) => menuButton(0, STYLE_NAMES[state.style as keyof typeof STYLE_NAMES] ?? 'Normal text', null, props)}>
        {(Object.keys(STYLE_NAMES) as (keyof typeof STYLE_NAMES)[]).map((style) => (
          <MenuItem key={style} checked={state.style === style} onSelect={() => setStyle(style)}>
            {STYLE_NAMES[style]}
          </MenuItem>
        ))}
      </Menu>
      <span aria-hidden className="mx-1 h-4 w-px flex-none bg-sf-line" />
      {button(1, 'Bold', IconBold, state.bold, () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold'), [mod, 'B'])}
      {button(2, 'Italic', IconItalic, state.italic, () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic'), [mod, 'I'])}
      <span aria-hidden className="mx-1 h-4 w-px flex-none bg-sf-line" />
      {button(3, 'Checklist', IconListCheck, state.style === 'check', () =>
        editor.dispatchCommand(state.style === 'check' ? REMOVE_LIST_COMMAND : INSERT_CHECK_LIST_COMMAND, undefined),
      )}
      {state.inTable ? (
        <Menu label="Table" trigger={(props) => menuButton(4, 'Table', IconTable, props)}>
          {/* At the page's limits the adds say why, rather than let the save refuse the page (polish pass). */}
          <MenuItem {...rowRoom} onSelect={() => inTable(() => $insertTableRowAtSelection(false))}>Add row above</MenuItem>
          <MenuItem {...rowRoom} onSelect={() => inTable(() => $insertTableRowAtSelection(true))}>Add row below</MenuItem>
          <MenuItem {...columnRoom} onSelect={() => inTable(() => $insertTableColumnAtSelection(false))}>Add column before</MenuItem>
          <MenuItem {...columnRoom} onSelect={() => inTable(() => $insertTableColumnAtSelection(true))}>Add column after</MenuItem>
          <MenuItem onSelect={() => inTable(() => $deleteTableRowAtSelection())}>Delete row</MenuItem>
          <MenuItem onSelect={() => inTable(() => $deleteTableColumnAtSelection())}>Delete column</MenuItem>
          <MenuItem
            danger
            onSelect={() =>
              inTable(() => {
                const selection = $getSelection()
                const table = $isRangeSelection(selection) ? $findMatchingParent(selection.anchor.getNode(), $isTableNode) : null
                table?.remove()
              })
            }
          >
            Delete table
          </MenuItem>
        </Menu>
      ) : (
        button(4, 'Table', IconTable, undefined, () => editor.dispatchCommand(INSERT_TABLE_COMMAND, { rows: '3', columns: '3', includeHeaders: { rows: true, columns: false } }))
      )}
      {button(5, 'Link a task', IconSquareCheck, undefined, onLinkTask)}
    </div>
  )
}
