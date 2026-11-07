import { $isLinkNode, $toggleLink, $createLinkNode } from '@lexical/link'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { $findMatchingParent, mergeRegister } from '@lexical/utils'
import {
  $createTextNode,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_NORMAL,
  DROP_COMMAND,
  FORMAT_TEXT_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  PASTE_COMMAND,
  type BaseSelection,
  type EditorState,
  type LexicalEditor,
} from 'lexical'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState, type Ref } from 'react'
import type { Attachment } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { inputClass } from '@/components/ui/Field'
import { pastedName } from '@/lib/fileTypes'
import type { DescBody } from '@/lib/messageBody'
import { webAddress } from '@/lib/webAddress'
import { COMPOSER_TRANSFORMERS } from '@/pages/chat/composer/markdown'
import { DescriptionToolbar } from './DescriptionToolbar'
import { $descriptionFromEditor, $editorFromDescription, $insertFile, $removeFile, DESCRIPTION_NODES } from './descriptionNodes'
import type { DescFile } from './FileNode'

/** What the task sheet does to the editor: put an uploaded file where the caret is, or take one out. */
export type DescriptionEditorHandle = { insertFile(file: Attachment): void; removeFile(id: string): void }

type Props = {
  initial: DescBody
  /** The task's files when the sheet opened, for the file blocks of `initial`. */
  files: Attachment[]
  readOnly: boolean
  label: string
  onChange: (body: DescBody) => void
  /** Files dropped, pasted or picked: the sheet uploads them, then puts each in with `insertFile`. */
  onFiles: (files: File[]) => void
  /** ⌘/Ctrl+Enter: save the task. */
  onSubmit: () => void
}

/** Project pages' look for the editor's nodes (no `.sf` chat tokens here). */
const THEME = {
  paragraph: 'm-0',
  quote: 'm-0 border-s-4 border-line ps-3 text-fg-secondary',
  list: { ul: 'm-0 list-disc ps-6', ol: 'm-0 list-decimal ps-6', listitem: '' },
  code: 'm-0 block whitespace-pre-wrap rounded-md border border-line bg-surface-sunken px-3 py-2 font-mono text-xs',
  link: 'text-accent underline',
  text: {
    bold: 'font-semibold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'line-through',
    underlineStrikethrough: '[text-decoration:underline_line-through]',
    code: 'rounded border border-line bg-surface-sunken px-1 font-mono text-[0.85em]',
  },
}

const descFile = ({ id, title, name, mimeType, size }: Attachment): DescFile => ({ id, title, name, mimeType, size })

/**
 * A task's description (spec 5.1): formatted text with the task's files in it, in a bordered box like the other
 * fields. Paste is plain text; files dropped, pasted or picked go to `onFiles`. Read-only for someone who may only move
 * the task.
 */
const DescriptionEditor = forwardRef(function DescriptionEditor(props: Props, ref: Ref<DescriptionEditorHandle>) {
  const config = {
    namespace: 'flow-description',
    nodes: DESCRIPTION_NODES,
    theme: THEME,
    editable: !props.readOnly,
    onError: (e: Error) => {
      throw e
    },
    editorState: () => $editorFromDescription(props.initial, new Map(props.files.map((f) => [f.id, descFile(f)]))),
  }
  return (
    <LexicalComposer initialConfig={config}>
      <Inner {...props} handle={ref} />
    </LexicalComposer>
  )
})
export default DescriptionEditor

function Inner({ readOnly, label, onChange, onFiles, onSubmit, handle }: Props & { handle: Ref<DescriptionEditorHandle> }) {
  const [editor] = useLexicalComposerContext()
  const [linking, setLinking] = useState<{ url: string; selection: BaseSelection | null } | null>(null)

  useImperativeHandle(handle, () => ({
    insertFile: (file) => editor.update(() => $insertFile(descFile(file))),
    removeFile: (id) => editor.update(() => $removeFile(id)),
  }))
  useEffect(() => editor.setEditable(!readOnly), [editor, readOnly])

  const openLink = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      const link = $isRangeSelection(selection) ? $findMatchingParent(selection.anchor.getNode(), $isLinkNode) : null
      setLinking({ url: link && $isLinkNode(link) ? link.getURL() : '', selection: selection?.clone() ?? null })
    })
  }, [editor])

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          KEY_ENTER_COMMAND,
          (event) => {
            if (!event || !(event.metaKey || event.ctrlKey) || event.isComposing) return false
            event.preventDefault()
            onSubmit()
            return true
          },
          COMMAND_PRIORITY_NORMAL,
        ),
        editor.registerCommand(
          KEY_DOWN_COMMAND,
          (event) => {
            const mod = event.metaKey || event.ctrlKey
            // ⌘/Ctrl B, I, U (Lexical leaves these keys to the app).
            const formatKey = ({ b: 'bold', i: 'italic', u: 'underline' } as const)[event.key.toLowerCase() as 'b' | 'i' | 'u']
            if (mod && !event.shiftKey && !event.altKey && formatKey) {
              event.preventDefault()
              return editor.dispatchCommand(FORMAT_TEXT_COMMAND, formatKey)
            }
            if (mod && event.shiftKey && event.key.toLowerCase() === 'x') {
              event.preventDefault()
              return editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')
            }
            if (mod && !event.shiftKey && event.key.toLowerCase() === 'k') {
              event.preventDefault()
              openLink()
              return true
            }
            return false
          },
          COMMAND_PRIORITY_NORMAL,
        ),
        // Paste is plain text (as chat); files pasted alone (a screenshot) go up instead.
        editor.registerCommand(
          PASTE_COMMAND,
          (event) => {
            const data = 'clipboardData' in event ? event.clipboardData : null
            const files = [...(data?.files ?? [])]
            const hasText = [...(data?.types ?? [])].some((type) => type === 'text/plain' || type === 'text/html')
            if (files.length > 0 && !hasText) {
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
        editor.registerCommand(
          DROP_COMMAND,
          (event) => {
            const files = [...(event.dataTransfer?.files ?? [])]
            if (files.length === 0) return false
            event.preventDefault()
            onFiles(files)
            return true
          },
          COMMAND_PRIORITY_HIGH,
        ),
      ),
    [editor, onSubmit, onFiles, openLink],
  )

  const change = useCallback((state: EditorState) => onChange(state.read(() => $descriptionFromEditor())), [onChange])

  return (
    <div
      className="rounded-lg border border-line bg-surface focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-accent-soft"
      onDragOver={(e) => {
        if (!readOnly && [...e.dataTransfer.types].includes('Files')) e.preventDefault()
      }}
      onDrop={(e) => {
        // Dropped beside the text (on the toolbar or the box's edge): the editor's own drop takes the rest.
        if (readOnly || e.defaultPrevented || e.dataTransfer.files.length === 0) return
        e.preventDefault()
        onFiles([...e.dataTransfer.files])
      }}
    >
      {!readOnly && <DescriptionToolbar onLink={openLink} onFiles={onFiles} />}
      {linking && <LinkRow editor={editor} linking={linking} onDone={() => setLinking(null)} />}
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            aria-label={label}
            className="max-h-[50vh] min-h-28 overflow-auto px-3 py-2 text-sm text-fg outline-none max-sm:text-base [&>*+*]:mt-2"
          />
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
      <ListPlugin />
      <LinkPlugin validateUrl={(url) => webAddress(url) !== null} />
      <MarkdownShortcutPlugin transformers={COMPOSER_TRANSFORMERS} />
      <OnChangePlugin onChange={change} ignoreSelectionChange />
    </div>
  )
}

/** The link row under the toolbar: a web address (http or https only), Add link and Remove link. */
function LinkRow({ editor, linking, onDone }: { editor: LexicalEditor; linking: { url: string; selection: BaseSelection | null }; onDone: () => void }) {
  const [url, setUrl] = useState(linking.url)
  const [invalid, setInvalid] = useState(false)
  const close = () => {
    onDone()
    editor.focus()
  }
  const apply = (target: string | null) => {
    editor.update(() => {
      if (linking.selection) $setSelection(linking.selection.clone())
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return
      if (target && selection.isCollapsed() && !linking.url) $insertNodes([$createLinkNode(target).append($createTextNode(target))])
      else $toggleLink(target)
    })
    close()
  }
  const add = () => {
    // Only a web address someone typed with http or https, or none (https is assumed then).
    const typed = url.trim()
    const target = /^[a-z][a-z\d+.-]*:/i.test(typed) && !/^https?:/i.test(typed) ? null : webAddress(typed)
    if (target) apply(target)
    else setInvalid(true)
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line-subtle px-3 py-2">
      <input
        autoFocus
        type="url"
        aria-label="Web address"
        placeholder="Web address"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value)
          setInvalid(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            close()
          }
        }}
        aria-invalid={invalid}
        className={`${inputClass} h-8 min-w-0 flex-1 py-1`}
      />
      <Button variant="secondary" onClick={add}>
        Add link
      </Button>
      {linking.url && (
        <Button variant="ghost" onClick={() => apply(null)}>
          Remove link
        </Button>
      )}
      {invalid && <p className="basis-full text-xs text-red-600 dark:text-red-400">Use a web address that starts with http:// or https://</p>}
    </div>
  )
}
