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
import { pastedName } from '@/lib/fileTypes'

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
  onUpload,
  onFiles,
}: {
  onSend: () => void
  menuOpen: RefObject<boolean>
  onLink: () => void
  /** Escape (when no list is open): cancel an edit. */
  onEscape?: () => void
  /** Up in an empty box: edit my last message (spec 6.8). */
  onUpEmpty?: () => void
  /** ⌘/Ctrl+U: Upload from your computer (spec 6.8), in a box that takes files; elsewhere it underlines. */
  onUpload?: () => void
  /** Files pasted into a box that takes files (spec 6.9); a pasted image is named after when it was pasted. */
  onFiles?: (files: File[]) => void
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
            if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'u' && onUpload) {
              event.preventDefault()
              onUpload()
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
            // With a modifier it's another key (Alt+↑ is the previous channel): the page's.
            if (event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return false
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
            const files = [...(data?.files ?? [])]
            if (files.length > 0) {
              // Files (pasted images) go to the tray, where the box takes them; otherwise the editor ignores them.
              if (!onFiles) return false
              event.preventDefault()
              const at = new Date()
              onFiles(files.map((f) => (f.type.startsWith('image/') && /^image\.\w+$/i.test(f.name) ? new File([f], pastedName(f.type, at), { type: f.type }) : f)))
              return true
            }
            const text = data?.getData('text/plain')
            if (!text) return false
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
    [editor, menuOpen, onSend, onLink, onEscape, onUpEmpty, onUpload, onFiles],
  )
  return null
}
