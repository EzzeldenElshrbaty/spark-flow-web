import { $createLinkNode, $isLinkNode, $toggleLink } from '@lexical/link'
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin'
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
import { $findMatchingParent } from '@lexical/utils'
import { IconAt, IconLetterCase, IconMoodSmile, IconSend } from '@tabler/icons-react'
import clsx from 'clsx'
import { $createTextNode, $getSelection, $insertNodes, $isRangeSelection, $setSelection, type BaseSelection, type EditorState, type LexicalEditor } from 'lexical'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, IconButton } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Popover } from '@/components/sf/Popover'
import { bodyText, type Body } from '@/lib/messageBody'
import { EmojiPicker } from '@/pages/chat/EmojiPicker'
import { AutocompletePlugin, type ComposerDirectory } from '@/pages/chat/composer/AutocompletePlugin'
import { $bodyFromEditor, $editorFromBody, COMPOSER_NODES } from '@/pages/chat/composer/bodyEditor'
import { FormatBar } from '@/pages/chat/composer/FormatBar'
import { KeysPlugin } from '@/pages/chat/composer/KeysPlugin'
import { COMPOSER_TRANSFORMERS } from '@/pages/chat/composer/markdown'

export type { ComposerDirectory }

/** A message may be this long (spec 6.8); the counter shows in the last 1,000. */
export const MAX_LENGTH = 40_000
const COUNT_FROM = MAX_LENGTH - 1_000
const DRAFT_MS = 500
/** A draft that failed to save is tried again after this long (and with any change sooner). */
const DRAFT_RETRY_MS = 3000
const TYPING_EVERY_MS = 2000

const THEME = {
  paragraph: 'm-0',
  quote: 'm-0 border-s-4 border-sf-line ps-3 text-sf-text-secondary',
  list: { ul: 'm-0 list-disc ps-6', ol: 'm-0 list-decimal ps-6', listitem: '' },
  code: 'sf-code m-0 block rounded-sf-md border border-sf-line bg-sf-surface-sunken px-3 py-2 whitespace-pre-wrap',
  link: 'text-sf-accent underline',
  text: {
    bold: 'font-semibold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'line-through',
    underlineStrikethrough: '[text-decoration:underline_line-through]',
    code: 'sf-code rounded-sf-sm border border-sf-line bg-sf-surface-sunken px-1',
  },
}

/** A typed address as a link target: http or https, with https assumed when no scheme is given; null otherwise. */
export function linkTarget(typed: string): string | null {
  const text = typed.trim()
  if (!text) return null
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`
  try {
    const url = new URL(withScheme)
    return ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.') ? url.href : null
  } catch {
    return null
  }
}

/**
 * The rich composer (spec 6.8): formatting row, the editor, and an action row with the formatting toggle, emoji,
 * @, the new-line hint, the length counter and Send. Enter sends what's written as a structured body; the box
 * clears once it's sent and a failure stays for the page to show. It starts from `initialBody` (a draft) and hands
 * changes to `onDraft` 500ms after typing stops.
 */
export function RichComposer({
  mode = 'send',
  placeholder,
  initialBody,
  onSend,
  onCancel,
  onEditLast,
  onDraft,
  onTyping,
  error,
  directory,
}: {
  /** send: the channel's box; edit: a message's body being edited in place, with Cancel and Save (spec 6.3). */
  mode?: 'send' | 'edit'
  placeholder: string
  initialBody?: Body
  onSend: (body: Body) => Promise<unknown>
  /** Edit mode: Cancel and Escape. */
  onCancel?: () => void
  /** Send mode: Up in an empty box edits my last message. */
  onEditLast?: () => void
  /** Saves the draft; false (or a rejection) when it couldn't, which the composer says and retries. */
  onDraft?: (body: Body) => void | Promise<boolean>
  onTyping?: () => void
  error?: Error | null
  directory: ComposerDirectory
}) {
  const config = {
    namespace: 'flow-composer',
    nodes: COMPOSER_NODES,
    theme: THEME,
    onError: (e: Error) => {
      throw e
    },
    editorState: () => $editorFromBody(initialBody ?? []),
  }
  return (
    <LexicalComposer initialConfig={config}>
      <Inner
        mode={mode}
        placeholder={placeholder}
        initialBody={initialBody}
        onSend={onSend}
        onCancel={onCancel}
        onEditLast={onEditLast}
        onDraft={onDraft}
        onTyping={onTyping}
        error={error}
        directory={directory}
      />
    </LexicalComposer>
  )
}

function Inner({ mode = 'send', placeholder, initialBody, onSend, onCancel, onEditLast, onDraft, onTyping, error, directory }: Parameters<typeof RichComposer>[0]) {
  const editing = mode === 'edit'
  const [editor] = useLexicalComposerContext()
  const boxRef = useRef<HTMLDivElement>(null)
  const menuOpen = useRef(false)
  const [body, setBody] = useState<Body>(initialBody ?? [])
  const [formatting, setFormatting] = useState(true)
  const [pending, setPending] = useState(false)
  const [linking, setLinking] = useState<{ url: string; selection: BaseSelection | null } | null>(null)
  const draftTimer = useRef<number | undefined>(undefined)
  const [draftFailed, setDraftFailed] = useState(false)
  const typedAt = useRef(0)
  const latestBody = useRef<Body>(initialBody ?? [])

  /** Saves the latest draft; a failure is said near the box and tried again shortly. */
  const saveDraft = useCallback(async () => {
    if (!onDraft) return
    window.clearTimeout(draftTimer.current)
    const ok = await Promise.resolve(onDraft(latestBody.current)).catch(() => false)
    if (ok === false) {
      setDraftFailed(true)
      draftTimer.current = window.setTimeout(() => void saveDraft(), DRAFT_RETRY_MS)
    } else setDraftFailed(false)
  }, [onDraft])

  const length = bodyText(body).length
  const empty = body.length === 0
  const over = length > MAX_LENGTH
  const canSend = !empty && !over && !pending

  const latest = useRef({ canSend, body })
  latest.current = { canSend, body }

  const send = useCallback(() => {
    const { canSend: ok, body: now } = latest.current
    if (!ok) return
    setPending(true)
    onSend(now).then(
      () => {
        // An edit is closed by its message; a sent message empties the box.
        if (editing) return setPending(false)
        window.clearTimeout(draftTimer.current)
        editor.update(() => $editorFromBody([]))
        latestBody.current = []
        void saveDraft()
        setPending(false)
      },
      () => setPending(false),
    )
  }, [editor, onSend, saveDraft, editing])

  const onChange = (state: EditorState) => {
    const next = state.read(() => $bodyFromEditor())
    setBody(next)
    latestBody.current = next
    if (onDraft) {
      window.clearTimeout(draftTimer.current)
      draftTimer.current = window.setTimeout(() => void saveDraft(), DRAFT_MS)
    }
    if (onTyping && next.length > 0 && Date.now() - typedAt.current > TYPING_EVERY_MS) {
      typedAt.current = Date.now()
      onTyping()
    }
  }
  useEffect(() => () => window.clearTimeout(draftTimer.current), [])

  const openLink = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      const link = $isRangeSelection(selection) ? $findMatchingParent(selection.anchor.getNode(), $isLinkNode) : null
      setLinking({ url: link && $isLinkNode(link) ? link.getURL() : '', selection: selection?.clone() ?? null })
    })
  }, [editor])

  return (
    <div className="sf">
      <div
        ref={boxRef}
        className="group/composer rounded-sf-lg border border-sf-line-strong bg-sf-surface transition-colors duration-150 ease-sf focus-within:border-sf-text-secondary"
      >
        {formatting && <FormatBar onLink={openLink} />}
        {linking && <LinkBar editor={editor} linking={linking} onDone={() => setLinking(null)} />}
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                aria-label={placeholder}
                aria-placeholder={placeholder}
                placeholder={<span className="sf-body pointer-events-none absolute start-3 top-2 text-sf-text-muted">{placeholder}</span>}
                className="sf-body max-h-[40vh] min-h-[38px] overflow-auto px-3 py-2 text-sf-text outline-none [&>*+*]:mt-1"
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin validateUrl={(url) => linkTarget(url) !== null} />
        <MarkdownShortcutPlugin transformers={COMPOSER_TRANSFORMERS} />
        <OnChangePlugin onChange={onChange} ignoreSelectionChange />
        <KeysPlugin onSend={send} menuOpen={menuOpen} onLink={openLink} onEscape={editing ? onCancel : undefined} onUpEmpty={editing ? undefined : onEditLast} />
        {editing && <AutoFocusPlugin defaultSelection="rootEnd" />}
        <AutocompletePlugin directory={directory} menuOpen={menuOpen} anchor={boxRef} />
        <div className="flex items-center gap-0.5 px-1 pb-1">
          <IconButton label={formatting ? 'Hide formatting' : 'Show formatting'} icon={IconLetterCase} size="sm" tone="muted" pressed={formatting} onClick={() => setFormatting((f) => !f)} />
          <Popover
            label="Insert emoji"
            className="w-[352px] max-w-[calc(100vw-16px)] overflow-hidden"
            trigger={(props) => <IconButton label="Emoji" icon={IconMoodSmile} size="sm" tone="muted" {...props} />}
          >
            {(close) => (
              <EmojiPicker
                onPick={(emoji) => {
                  close()
                  editor.update(() => $insertNodes([$createTextNode(emoji)]))
                  editor.focus()
                }}
              />
            )}
          </Popover>
          <IconButton
            label="Mention someone"
            icon={IconAt}
            size="sm"
            tone="muted"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.update(() => $insertNodes([$createTextNode(' @')]))
              editor.focus()
            }}
          />
          {/* Send keeps the end corner to itself (spec 6.8: browser extensions sit there otherwise). */}
          <div className="ms-auto flex items-center gap-1">
          {editing ? (
            <span className="sf-meta hidden px-2 text-sf-text-muted sm:inline">Esc to cancel · Enter to save</span>
          ) : (
            !empty && <span className="sf-meta hidden px-2 text-sf-text-muted sm:inline">Shift + Enter for a new line</span>
          )}
          {length > COUNT_FROM && (
            <span className={clsx('sf-meta px-1 tabular-nums', over ? 'font-semibold text-sf-error' : 'text-sf-text-muted')} aria-live="polite">
              {MAX_LENGTH - length}
            </span>
          )}
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" disabled={!canSend} onClick={send}>
                {pending ? 'Saving…' : 'Save'}
              </Button>
            </>
          ) : (
          <button
            type="button"
            aria-label="Send"
            disabled={!canSend}
            onClick={send}
            className={clsx(
              'sf-focus inline-grid size-8 flex-none place-items-center rounded-sf-md',
              canSend ? 'bg-sf-accent-fill text-sf-on-accent hover:bg-sf-accent-fill-hover' : 'bg-transparent text-sf-text-muted',
            )}
          >
            <Icon icon={IconSend} size={18} flip />
          </button>
          )}
          </div>
        </div>
      </div>
      {draftFailed && <p className="sf-small mt-1 text-sf-text-muted">Draft not saved. Trying again…</p>}
      {over && <p className="sf-small mt-1 text-sf-error">Keep the message under 40,000 characters.</p>}
      {error && <p className="sf-small mt-1 text-sf-error">{error.message}</p>}
    </div>
  )
}

/** Editing a link (⌘K or the Link button): the address for the selected text, or a new link at the caret. */
function LinkBar({ editor, linking, onDone }: { editor: LexicalEditor; linking: { url: string; selection: BaseSelection | null }; onDone: () => void }) {
  const [url, setUrl] = useState(linking.url)
  const [invalid, setInvalid] = useState(false)
  const apply = (target: string | null) => {
    editor.update(() => {
      if (linking.selection) $setSelection(linking.selection.clone())
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return
      if (target && selection.isCollapsed() && !linking.url) $insertNodes([$createLinkNode(target).append($createTextNode(target))])
      else $toggleLink(target)
    })
    onDone()
    editor.focus()
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-sf-line px-3 py-2">
      <input
        autoFocus
        type="url"
        aria-label="Link address"
        placeholder="Paste or type a link"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value)
          setInvalid(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            const target = linkTarget(url)
            if (target) apply(target)
            else setInvalid(true)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onDone()
            editor.focus()
          }
        }}
        aria-invalid={invalid}
        className="sf-ui h-8 min-w-0 flex-1 rounded-sf-md border border-sf-line-strong bg-sf-surface px-2 text-sf-text outline-none focus:shadow-[var(--focus-ring)]"
      />
      <Button size="sm" onClick={() => (linkTarget(url) ? apply(linkTarget(url)) : setInvalid(true))}>
        Save link
      </Button>
      {linking.url && (
        <Button size="sm" variant="ghost" onClick={() => apply(null)}>
          Remove link
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          onDone()
          editor.focus()
        }}
      >
        Cancel
      </Button>
      {invalid && <p className="sf-small basis-full text-sf-error">Enter a web address, like spark-sys.com/docs.</p>}
    </div>
  )
}
