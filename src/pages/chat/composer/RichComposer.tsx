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
import { IconAt, IconCalendarEvent, IconChevronDown, IconClock, IconCode, IconFiles, IconLetterCase, IconMoodSmile, IconPlus, IconSend, IconSlash, IconUpload, IconX } from '@tabler/icons-react'
import clsx from 'clsx'
import { $createTextNode, $getSelection, $insertNodes, $isRangeSelection, $setSelection, type BaseSelection, type EditorState, type LexicalEditor } from 'lexical'
import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Button, IconButton } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Menu, MenuItem, MenuSeparator } from '@/components/sf/Menu'
import { Popover } from '@/components/sf/Popover'
import { Tooltip } from '@/components/sf/Tooltip'
import { acceptedFiles } from '@/lib/fileTypes'
import { webAddress } from '@/lib/webAddress'
import { formatWhen } from '@/lib/format'
import { dismissedPreview, firstPreviewable, withoutPreview } from '@/lib/linkPreview'
import { bodyText, type Body } from '@/lib/messageBody'
import { schedulePresets } from '@/lib/remindTimes'
import { parseCommand, refusal, type ComposerSlash } from '@/lib/slashCommands'
import { EmojiPicker } from '@/pages/chat/EmojiPicker'
import { AutocompletePlugin, type ComposerDirectory } from '@/pages/chat/composer/AutocompletePlugin'
import { $bodyFromEditor, $editorFromBody, COMPOSER_NODES } from '@/pages/chat/composer/bodyEditor'
import { FormatBar } from '@/pages/chat/composer/FormatBar'
import { KeysPlugin } from '@/pages/chat/composer/KeysPlugin'
import { COMPOSER_TRANSFORMERS } from '@/pages/chat/composer/markdown'
import { CustomReminder } from '@/pages/chat/saved/RemindMenu'
import { countNotice } from './countNotice'
import { usePhone } from '@/components/sf/usePhone'

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

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** A box that takes files (spec 6.8, 6.9): its tray, where added files go, how many are ready, and why Send waits. */
export type ComposerFiles = {
  tray: ReactNode
  onAdd: (files: File[]) => void
  /** Files ready to send: with any, the box sends with no text. */
  ready: number
  /** Why Send waits ("Uploading 2 files…"), or null. */
  waiting: string | null
  /** Add from Flow files (spec 6.8): the page opens its picker. */
  fromFlow?: () => void
}

/** Whether a drag carries files (not text or a link being dragged). */
const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false

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
  autoFocus = false,
  showFormatting,
  files,
  allowEmpty = false,
  onSchedule,
  slash,
  onSnippet,
  linkPreview,
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
  /** Take focus on open, caret at the end (edit mode always does): after Alt+↑/↓ to this channel. */
  autoFocus?: boolean
  /** Whether the formatting row starts shown: the channel's box (spec 6.8), not a thread's (spec 6.7). Aa toggles it. */
  showFormatting?: boolean
  /** Files: the tray, + Attach (⌘/Ctrl+U), paste and drop. Without it the box is text only (an edit). */
  files?: ComposerFiles
  /** An empty box may still send or save (an edit of a message that has files). */
  allowEmpty?: boolean
  /** Send mode: the Send chevron's Schedule menu (spec 6.8) hands the body and the chosen time here. Text only. */
  onSchedule?: (body: Body, at: Date) => Promise<unknown>
  /** Send mode: the `/` shortcuts (spec 6.8): listed at the start of the box, run on Enter instead of sending. */
  slash?: ComposerSlash
  /** Text snippet (spec 6.9): the box's text goes into it; true once it's made, and the box empties. */
  onSnippet?: (text: string) => Promise<boolean>
  /**
   * The first link's preview above the box (spec 6.3), shown once typing pauses; `onRemove` (its ×) sends the message
   * without it. The composer decides which link and keeps the choice; the page renders the card.
   */
  linkPreview?: (url: string, onRemove: () => void) => ReactNode
}) {
  const phone = usePhone()
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
        autoFocus={autoFocus}
        // On a phone the formatting row waits for Aa, so the box keeps its room (UX Phase 5B, 5.2).
        showFormatting={showFormatting ?? !phone}
        files={files}
        allowEmpty={allowEmpty}
        onSchedule={onSchedule}
        slash={slash}
        onSnippet={onSnippet}
        linkPreview={linkPreview}
      />
    </LexicalComposer>
  )
}

/** How long typing pauses before the first link's preview is asked for (spec 6.3). */
const PREVIEW_PAUSE_MS = 600

/** `value` once it has held still for `ms`; null meanwhile, so the same value again waits again. */
function useSettled(value: string | null, ms: number): string | null {
  const [settled, setSettled] = useState<string | null>(null)
  // A new value drops the settled one during render (React's "adjust state on a prop change"), before any paint.
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    setSettled(null)
  }
  useEffect(() => {
    if (value === null) return
    const timer = window.setTimeout(() => setSettled(value), ms)
    return () => window.clearTimeout(timer)
  }, [value, ms])
  return settled === value ? value : null
}

function Inner({ mode = 'send', placeholder, initialBody, onSend, onCancel, onEditLast, onDraft, onTyping, error, directory, autoFocus, showFormatting = true, files, allowEmpty = false, onSchedule, slash, onSnippet, linkPreview }: Parameters<typeof RichComposer>[0]) {
  const editing = mode === 'edit'
  const [editor] = useLexicalComposerContext()
  const boxRef = useRef<HTMLDivElement>(null)
  const menuOpen = useRef(false)
  const [body, setBody] = useState<Body>(initialBody ?? [])
  const [formatting, setFormatting] = useState(showFormatting)
  const [pending, setPending] = useState(false)
  // When the last box I scheduled goes out: said under the box until I write again.
  const [scheduledFor, setScheduledFor] = useState<Date | null>(null)
  const [customTime, setCustomTime] = useState(false)
  // What the last shortcut said (or why it didn't run), under the box until I write again; and why one failed.
  const [notice, setNotice] = useState<string | null>(null)
  const [commandError, setCommandError] = useState<string | null>(null)
  const [linking, setLinking] = useState<{ url: string; selection: BaseSelection | null } | null>(null)
  const draftTimer = useRef<number | undefined>(undefined)
  const [draftFailed, setDraftFailed] = useState(false)
  const typedAt = useRef(0)
  const latestBody = useRef<Body>(initialBody ?? [])
  // A change not yet saved (waiting out the 500ms, or for a retry): leaving the channel saves it at once.
  const unsaved = useRef(false)
  const onDraftNow = useRef(onDraft)
  onDraftNow.current = onDraft
  const picker = useRef<HTMLInputElement>(null)
  // Files dragged over the box: entering and leaving its children fire too, so it counts.
  const [dropping, setDropping] = useState(false)
  const dragDepth = useRef(0)
  const openPicker = useCallback(() => picker.current?.click(), [])

  // The link whose card I took off (×): it goes out as `noPreview` on that link (with the message, a scheduled one,
  // the draft); an edit or a reopened draft starts with the choice it had. The ref is what the callbacks read.
  const [dismissed, setDismissed] = useState<string | null>(() => (initialBody ? dismissedPreview(initialBody) : null))
  const dismissedRef = useRef(dismissed)
  const dismiss = useCallback((url: string | null) => {
    dismissedRef.current = url
    setDismissed(url)
  }, [])

  /** Saves the latest draft; a failure is said near the box and tried again shortly. */
  const saveDraft = useCallback(async () => {
    if (!onDraft) return
    window.clearTimeout(draftTimer.current)
    unsaved.current = false
    const off = dismissedRef.current
    const ok = await Promise.resolve(onDraft(off ? withoutPreview(latestBody.current, off) : latestBody.current)).catch(() => false)
    if (ok === false) {
      unsaved.current = true
      setDraftFailed(true)
      draftTimer.current = window.setTimeout(() => void saveDraft(), DRAFT_RETRY_MS)
    } else setDraftFailed(false)
  }, [onDraft])

  const length = bodyText(body).length
  const empty = body.length === 0
  const over = length > MAX_LENGTH
  // With files ready an empty box sends them alone; while any go up (or failed), Send waits (spec 6.9).
  const canSend = (!empty || allowEmpty || (files?.ready ?? 0) > 0) && !over && !pending && !files?.waiting
  // A shortcut runs; it isn't sent, so it can't be scheduled.
  const command = slash ? parseCommand(body) : null
  // Scheduled messages are text only for now: not while files are added.
  const canSchedule = canSend && !empty && !command && (files?.ready ?? 0) === 0 && !files?.waiting

  const candidate = linkPreview ? firstPreviewable(body) : null
  const previewed = useSettled(candidate === dismissed ? null : candidate, PREVIEW_PAUSE_MS)

  const latest = useRef({ canSend, body })
  latest.current = { canSend, body }

  // A box whose message went out (or whose shortcut ran) empties, and its draft goes.
  const emptyBox = useCallback(() => {
    window.clearTimeout(draftTimer.current)
    editor.update(() => $editorFromBody([]))
    latestBody.current = []
    dismiss(null)
    void saveDraft()
  }, [editor, saveDraft, dismiss])

  // A shortcut (spec 6.8): one offered here runs, and what it says shows under the box; anything else says why not.
  const runCommand = useCallback(
    (now: Body) => {
      const parsed = parseCommand(now)
      if (!slash || !parsed) return
      if (!slash.commands.some((c) => c.name === parsed.name)) return setNotice(refusal(parsed.name, slash.refused))
      setPending(true)
      slash
        .run(parsed, now)
        .then((outcome) => (outcome.send ? onSend(outcome.send).then(() => outcome) : outcome))
        .then(
          (outcome) => {
            emptyBox()
            setNotice(outcome.notice ?? null)
            setPending(false)
          },
          (reason: unknown) => {
            setCommandError(reason instanceof Error ? reason.message : 'That shortcut didn’t run. Try again.')
            setPending(false)
          },
        )
    },
    [slash, onSend, emptyBox],
  )

  // Sends, or with `at` schedules (spec 6.8); either way a box that went out empties.
  const deliver = useCallback(
    (at?: Date) => {
      const { canSend: ok, body: typed } = latest.current
      if (!ok || (at && !onSchedule)) return
      const off = dismissedRef.current
      const now = off ? withoutPreview(typed, off) : typed
      if (!at && slash && parseCommand(now)) return runCommand(now)
      setPending(true)
      ;(at ? onSchedule!(now, at) : onSend(now)).then(
        () => {
          // An edit is closed by its message; a sent message empties the box.
          if (editing) return setPending(false)
          emptyBox()
          setPending(false)
          setScheduledFor(at ?? null)
        },
        () => setPending(false),
      )
    },
    [onSend, onSchedule, editing, slash, runCommand, emptyBox],
  )
  const send = useCallback(() => deliver(), [deliver])
  // What's in the box becomes the snippet's content; once it's made the box empties (Cancel leaves it).
  const snippet = useCallback(() => {
    void onSnippet?.(bodyText(latest.current.body)).then((created) => created && emptyBox())
  }, [onSnippet, emptyBox])

  /** Saves the draft once writing pauses (DRAFT_MS). */
  const scheduleDraft = () => {
    if (!onDraft) return
    unsaved.current = true
    window.clearTimeout(draftTimer.current)
    draftTimer.current = window.setTimeout(() => void saveDraft(), DRAFT_MS)
  }

  const onChange = (state: EditorState) => {
    const next = state.read(() => $bodyFromEditor())
    setBody(next)
    latestBody.current = next
    if (next.length > 0) {
      setNotice(null)
      setCommandError(null)
    }
    scheduleDraft()
    if (onTyping && next.length > 0 && Date.now() - typedAt.current > TYPING_EVERY_MS) {
      typedAt.current = Date.now()
      onTyping()
    }
  }
  useEffect(
    () => () => {
      window.clearTimeout(draftTimer.current)
      if (unsaved.current) void onDraftNow.current?.(latestBody.current)
    },
    [],
  )

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
        data-composer=""
        onDragEnter={
          files &&
          ((event) => {
            if (!carriesFiles(event)) return
            dragDepth.current += 1
            setDropping(true)
          })
        }
        onDragOver={files && ((event) => carriesFiles(event) && event.preventDefault())}
        onDragLeave={
          files &&
          ((event) => {
            if (!carriesFiles(event)) return
            dragDepth.current = Math.max(0, dragDepth.current - 1)
            if (dragDepth.current === 0) setDropping(false)
          })
        }
        onDrop={
          files &&
          ((event) => {
            if (!carriesFiles(event)) return
            event.preventDefault()
            dragDepth.current = 0
            setDropping(false)
            files.onAdd([...event.dataTransfer.files])
          })
        }
        className={clsx(
          'group/composer rounded-sf-lg border bg-sf-surface transition-colors duration-150 ease-sf',
          dropping ? 'border-sf-accent shadow-[0_0_0_3px_var(--surface-mention)]' : 'border-sf-line-strong focus-within:border-sf-text-secondary',
        )}
      >
        {files?.tray}
        {previewed &&
          linkPreview?.(previewed, () => {
            dismiss(previewed)
            scheduleDraft()
            editor.focus()
          })}
        {formatting && <FormatBar onLink={openLink} uploadKey={Boolean(files)} />}
        {linking && <LinkBar editor={editor} linking={linking} onDone={() => setLinking(null)} />}
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                aria-label={placeholder}
                aria-placeholder={placeholder}
                ariaAutoComplete="list"
                placeholder={<span className="sf-body pointer-events-none absolute start-3 top-2 text-sf-text-muted max-sm:text-[16px]">{placeholder}</span>}
                className="sf-body max-h-[50vh] min-h-[38px] overflow-auto px-3 py-2 text-sf-text outline-none [&>*+*]:mt-1"
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin validateUrl={(url) => webAddress(url) !== null} />
        <MarkdownShortcutPlugin transformers={COMPOSER_TRANSFORMERS} />
        <OnChangePlugin onChange={onChange} ignoreSelectionChange />
        <KeysPlugin
          onSend={send}
          menuOpen={menuOpen}
          onLink={openLink}
          onEscape={editing ? onCancel : undefined}
          onUpEmpty={editing ? undefined : onEditLast}
          onUpload={files ? openPicker : undefined}
          onFiles={files?.onAdd}
          onSnippet={onSnippet ? snippet : undefined}
        />
        {(editing || autoFocus) && <AutoFocusPlugin defaultSelection="rootEnd" />}
        <AutocompletePlugin directory={directory} menuOpen={menuOpen} anchor={boxRef} commands={slash?.commands} />
        <div className="flex items-center gap-0.5 ps-1 pe-2 pb-2">
          {files && (
            <>
              {/* + Attach (spec 6.8, .sf-plus): a round pill that inverts and turns into × while its menu is open. */}
              <Menu
                label="Attach"
                trigger={(props) => (
                  <Tooltip label="Attach">
                    <button
                      type="button"
                      aria-label="Attach"
                      {...props}
                      className={clsx(
                        'sf-focus inline-grid size-7 flex-none cursor-pointer place-items-center rounded-sf-full border-0 p-0 transition-colors duration-150 ease-sf',
                        props['aria-expanded'] ? 'bg-sf-text text-sf-surface' : 'bg-sf-surface-hover text-sf-text hover:bg-sf-line',
                      )}
                    >
                      <Icon icon={props['aria-expanded'] ? IconX : IconPlus} size={18} />
                    </button>
                  </Tooltip>
                )}
              >
                <MenuItem icon={IconUpload} hint={isMac ? '⌘U' : 'Ctrl+U'} onSelect={openPicker}>
                  Upload from your computer
                </MenuItem>
                {files.fromFlow && (
                  <MenuItem icon={IconFiles} onSelect={files.fromFlow}>
                    Add from Flow files
                  </MenuItem>
                )}
                {onSnippet && (
                  <MenuItem icon={IconCode} hint={isMac ? '⌘⇧↵' : 'Ctrl+Shift+Enter'} onSelect={snippet}>
                    Text snippet
                  </MenuItem>
                )}
              </Menu>
              <input
                ref={picker}
                type="file"
                multiple
                hidden
                accept={acceptedFiles}
                onChange={(event) => {
                  const picked = [...(event.target.files ?? [])]
                  event.target.value = ''
                  if (picked.length) files.onAdd(picked)
                }}
              />
            </>
          )}
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
          {slash && (
            <>
              <span aria-hidden className="mx-1 h-4 w-px flex-none bg-sf-line" />
              <IconButton
                label="Shortcuts"
                icon={IconSlash}
                size="sm"
                tone="muted"
                disabled={!empty}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.update(() => $insertNodes([$createTextNode('/')]))
                  editor.focus()
                }}
              />
            </>
          )}
          {/* Send keeps the end corner to itself (spec 6.8: browser extensions sit there otherwise). */}
          <div className="ms-auto flex items-center gap-1">
          {editing ? (
            <span className="sf-meta hidden px-2 text-sf-text-muted sm:inline">Esc to cancel · Enter to save</span>
          ) : dropping ? (
            <span className="sf-meta px-2 text-sf-accent">Drop to add files</span>
          ) : files?.waiting ? (
            <span className="sf-meta px-2 text-sf-text-muted">{files.waiting}</span>
          ) : (
            !empty && <span className="sf-meta hidden px-2 text-sf-text-muted sm:inline">Shift + Enter for a new line</span>
          )}
          {length > COUNT_FROM && (
            <span className={clsx('sf-meta px-1 tabular-nums', over ? 'font-semibold text-sf-error' : 'text-sf-text-muted')}>
              {MAX_LENGTH - length}
            </span>
          )}
          {/* Read at a few steps, not on every key (UX Phase 5A, 5.12). Always there, empty until a step, so screen
              readers hear the first one too (a status line made with its text may not be read; UX Phase 6). */}
          <span role="status" className="sr-only" data-length-status>
            {countNotice(MAX_LENGTH - length)}
          </span>
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
          <span className="inline-flex">
          <Tooltip label="Send" shortcut={['Enter']}>
            <button
              type="button"
              aria-label="Send"
              disabled={!canSend}
              onClick={send}
              className={clsx(
                'sf-focus inline-grid h-7 w-9 flex-none place-items-center rounded-sf-md',
                onSchedule && 'rounded-e-none',
                canSend ? 'cursor-pointer bg-sf-accent-fill text-sf-on-accent hover:bg-sf-accent-fill-hover' : 'cursor-not-allowed bg-transparent text-sf-text-muted',
              )}
            >
              <Icon icon={IconSend} size={16} flip />
            </button>
          </Tooltip>
          {onSchedule && <ScheduleMenu disabled={!canSchedule} onPick={(at) => deliver(at)} onCustom={() => setCustomTime(true)} />}
          </span>
          )}
          </div>
        </div>
      </div>
      {scheduledFor && empty && (
        <p role="status" className="sf-small mt-1 text-sf-text-muted">
          Scheduled for {formatWhen(scheduledFor.toISOString())}. It’s in Drafts & sent.
        </p>
      )}
      {onSchedule && <CustomReminder open={customTime} onClose={() => setCustomTime(false)} onPick={(at) => deliver(at)} title="Schedule message" action="Schedule" />}
      {notice && (
        <p role="status" className="sf-small mt-1 text-sf-text-muted">
          {notice}
        </p>
      )}
      {commandError && <p className="sf-small mt-1 text-sf-error">{commandError}</p>}
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
            const target = webAddress(url)
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
      <Button size="sm" onClick={() => (webAddress(url) ? apply(webAddress(url)) : setInvalid(true))}>
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

/** The Send chevron's Schedule menu (spec 6.8): Tomorrow at 9:00 AM, Monday at 9:00 AM, — Custom time…, — the note. */
function ScheduleMenu({ disabled, onPick, onCustom }: { disabled: boolean; onPick: (at: Date) => void; onCustom: () => void }) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return (
    <Menu
      label="Schedule message"
      trigger={(props) => (
        <Tooltip label="Schedule message">
          <button
            type="button"
            aria-label="Schedule message"
            disabled={disabled}
            {...props}
            className={clsx(
              'sf-focus inline-grid h-7 w-6 flex-none place-items-center rounded-sf-md rounded-s-none border-s',
              disabled
                ? 'cursor-not-allowed border-transparent bg-transparent text-sf-text-muted'
                : 'cursor-pointer border-sf-on-accent/25 bg-sf-accent-fill text-sf-on-accent hover:bg-sf-accent-fill-hover',
            )}
          >
            <Icon icon={IconChevronDown} size={16} />
          </button>
        </Tooltip>
      )}
    >
      <p aria-hidden className="sf-label m-0 px-3 pt-1.5 pb-1 text-sf-text-muted">
        Schedule message
      </p>
      {schedulePresets(new Date()).map((preset) => (
        <MenuItem key={preset.label} icon={IconClock} onSelect={() => onPick(preset.at)}>
          {preset.label}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem icon={IconCalendarEvent} onSelect={onCustom}>
        Custom time…
      </MenuItem>
      <MenuSeparator />
      <p className="sf-meta m-0 max-w-64 px-3 py-1.5 text-sf-text-muted">Times are in {zone}. Scheduled messages are in Drafts & sent.</p>
    </Menu>
  )
}
