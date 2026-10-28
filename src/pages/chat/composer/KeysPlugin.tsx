import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_NORMAL,
  FORMAT_TEXT_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  PASTE_COMMAND,
} from 'lexical'
import { useEffect, type RefObject } from 'react'
import { coarsePointer } from '@/pages/chat/composerKeys'

/**
 * The composer's keys (spec 6.8): Enter sends; Shift+Enter starts a new line (a new item in a list); never while the
 * autocomplete is open or an IME is composing (Arabic input). On a touch screen Enter makes a new line and Send sends.
 * ⌘/Ctrl+Shift+X strikes through and ⌘/Ctrl+K edits a link (B, I and U come with the editor). Paste keeps plain
 * structure: the text and its lines, not the source's styling; addresses become links when sent.
 */
export function KeysPlugin({
  onSend,
  menuOpen,
  onLink,
  onEscape,
  onUpEmpty,
}: {
  onSend: () => void
  menuOpen: RefObject<boolean>
  onLink: () => void
  /** Escape (when no list is open): cancel an edit. */
  onEscape?: () => void
  /** Up in an empty box: edit my last message (spec 6.8). */
  onUpEmpty?: () => void
}) {
  const [editor] = useLexicalComposerContext()
  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          KEY_ENTER_COMMAND,
          (event) => {
            if (menuOpen.current) return false
            if (event && (event.isComposing || event.keyCode === 229)) return false
            if (event?.shiftKey) {
              event.preventDefault()
              return editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined)
            }
            if (coarsePointer()) return false
            event?.preventDefault()
            onSend()
            return true
          },
          COMMAND_PRIORITY_NORMAL,
        ),
        editor.registerCommand(
          KEY_DOWN_COMMAND,
          (event) => {
            const mod = event.metaKey || event.ctrlKey
            if (mod && event.shiftKey && event.key.toLowerCase() === 'x') {
              event.preventDefault()
              return editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')
            }
            if (mod && !event.shiftKey && event.key.toLowerCase() === 'k') {
              event.preventDefault()
              onLink()
              return true
            }
            return false
          },
          COMMAND_PRIORITY_NORMAL,
        ),
        editor.registerCommand(
          KEY_ESCAPE_COMMAND,
          (event) => {
            if (menuOpen.current || !onEscape) return false
            event.preventDefault()
            onEscape()
            return true
          },
          COMMAND_PRIORITY_NORMAL,
        ),
        editor.registerCommand(
          KEY_ARROW_UP_COMMAND,
          (event) => {
            if (menuOpen.current || !onUpEmpty || editor.getEditorState().read(() => $getRoot().getTextContent().trim() !== '')) return false
            event.preventDefault()
            onUpEmpty()
            return true
          },
          COMMAND_PRIORITY_NORMAL,
        ),
        editor.registerCommand(
          PASTE_COMMAND,
          (event) => {
            const data = 'clipboardData' in event ? event.clipboardData : null
            const text = data?.getData('text/plain')
            // Files (pasted images) are for the attachment tray, which comes with Phase 2.
            if (!text || (data?.files.length ?? 0) > 0) return false
            event.preventDefault()
            editor.update(() => {
              const selection = $getSelection()
              if ($isRangeSelection(selection)) selection.insertRawText(text)
            })
            return true
          },
          COMMAND_PRIORITY_NORMAL,
        ),
      ),
    [editor, menuOpen, onSend, onLink, onEscape, onUpEmpty],
  )
  return null
}
