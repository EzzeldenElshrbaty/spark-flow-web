import clsx from 'clsx'
import { AtSign, Folder, ListChecks, SendHorizontal, Users } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { inputClass } from '@/components/ui/Field'
import { activeMention, insertMention, keepDismissed, mentionOptions, type MentionOption } from '@/lib/mentionQuery'
import { popupPlacement } from '@/lib/popupPlacement'
import { useMentionDirectory } from '@/lib/useMentionDirectory'

const MAX_ROWS = 8
const LIST_HEIGHT = 288 // max-h-72

function optionLabel(o: MentionOption) {
  if (o.kind === 'all') return { icon: <Users className="size-4" />, main: '@all', sub: 'Everyone here' }
  if (o.kind === 'user') return { icon: <Avatar name={o.name} size="sm" />, main: o.name, sub: o.title }
  if (o.kind === 'project') return { icon: <Folder className="size-4" />, main: o.key, sub: o.name }
  return { icon: <ListChecks className="size-4" />, main: o.key, sub: o.title }
}

/**
 * Writing box for chat, threads and task comments. Enter sends, Shift+Enter starts a new line. Typing `@` offers
 * people, projects, tasks and @all (a list, not a menu: it filters as you type); choosing one inserts the mention the
 * server reads. The text clears only once it is saved; a failure shows as a sentence underneath.
 */
export function Composer({
  placeholder,
  submitLabel,
  pendingLabel,
  onSubmit,
  error,
  extra,
  quiet = false,
  allowEmpty = false,
  initialText = '',
  onCancel,
}: {
  placeholder: string
  submitLabel: string
  pendingLabel: string
  onSubmit: (text: string) => Promise<unknown>
  error?: Error | null
  /** Controls beside the text (the Comment | Bug switch, files). */
  extra?: ReactNode
  /** A secondary Send, where the page already has its one primary button. */
  quiet?: boolean
  /** Send with no text (a bug that is only a screenshot). */
  allowEmpty?: boolean
  /** The text to start from (editing a message); the box takes focus with the caret at the end. */
  initialText?: string
  /** Shows Cancel and makes Escape cancel (editing a message). */
  onCancel?: () => void
}) {
  const { users, projects, tasks } = useMentionDirectory()
  const [text, setText] = useState(initialText)
  const [caret, setCaret] = useState(initialText.length)
  const [pending, setPending] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const listId = useId()

  const mention = activeMention(text, caret)
  const options = mention && dismissedAt !== mention.start ? mentionOptions(mention.query, { users, projects, tasks }) : []
  const open = options.length > 0
  const active = Math.min(highlight, Math.max(0, options.length - 1))
  const rows = Math.min(MAX_ROWS, Math.max(1, text.split('\n').length))
  // Above the box when there's room; in a short scrolling panel (a task with no comments yet) it opens below instead.
  const [side, setSide] = useState<'above' | 'below'>('above')
  useLayoutEffect(() => {
    const el = ref.current
    if (!open || !el) return
    const box = el.getBoundingClientRect()
    let parent = el.parentElement
    while (parent && !/(auto|scroll|hidden)/.test(getComputedStyle(parent).overflowY)) parent = parent.parentElement
    const area = parent ? parent.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
    setSide(popupPlacement({ above: box.top - area.top, below: area.bottom - box.bottom }, LIST_HEIGHT))
  }, [open])

  const sync = () => {
    const el = ref.current
    if (!el) return
    setCaret(el.selectionStart)
    setDismissedAt((d) => keepDismissed(d, activeMention(el.value, el.selectionStart)?.start ?? null))
  }
  const choose = (option: MentionOption) => {
    if (!mention) return
    const next = insertMention(text, { start: mention.start, caret }, option)
    setText(next.text)
    setCaret(next.caret)
    setHighlight(0)
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(next.caret, next.caret)
    })
  }
  const submit = async () => {
    if ((!text.trim() && !allowEmpty) || pending) return
    setPending(true)
    try {
      await onSubmit(text)
      setText('')
      setCaret(0)
      setDismissedAt(null)
    } catch {
      // The caller shows the error; the text stays so nothing typed is lost.
    } finally {
      setPending(false)
    }
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((active + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        choose(options[active]!)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setDismissedAt(mention!.start)
        return
      }
    }
    if (e.key === 'Escape' && onCancel) {
      e.preventDefault()
      onCancel()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <div className="relative">
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Mention"
          className={clsx('absolute inset-x-0 z-30 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-xl', side === 'above' ? 'bottom-full mb-2' : 'top-full mt-2')}
        >
          {options.map((o, i) => {
            const { icon, main, sub } = optionLabel(o)
            return (
              <li
                key={`${o.kind}:${'id' in o ? o.id : 'key' in o ? o.key : 'all'}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // mousedown, not click: the textarea keeps focus and the caret stays where it was.
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(o)
                }}
                onMouseEnter={() => setHighlight(i)}
                className={clsx('flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm', i === active ? 'bg-surface-muted text-fg' : 'text-fg-secondary')}
              >
                <span className="flex size-6 shrink-0 items-center justify-center text-fg-muted">{icon}</span>
                <span className="min-w-0 flex-1 truncate">
                  <bdi className="font-medium text-fg">{main}</bdi>
                  {sub && <span className="text-fg-muted"> · {sub}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <div className="rounded-xl border border-line bg-surface p-2 shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-accent-soft">
        <textarea
          ref={ref}
          rows={rows}
          autoFocus={Boolean(onCancel)}
          onFocus={(e) => onCancel && e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          onChange={(e) => {
            setText(e.target.value)
            setCaret(e.target.selectionStart)
            // A dismissed list stays shut for the same @word; once that @word is gone, or an @ starts elsewhere, it opens again.
            const next = activeMention(e.target.value, e.target.selectionStart)?.start ?? null
            setDismissedAt((d) => keepDismissed(d, next))
          }}
          onKeyDown={onKeyDown}
          onKeyUp={sync}
          onClick={sync}
          onBlur={() => mention && setDismissedAt(mention.start)}
          className={clsx(inputClass, 'resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus:ring-0')}
        />
        <div className="flex flex-wrap items-center gap-2 px-1 pt-1">
          <span className="hidden items-center gap-1 text-xs text-fg-muted sm:inline-flex">
            <AtSign className="size-3.5" /> to mention · Shift+Enter for a new line
          </span>
          {extra}
          {onCancel && (
            <Button variant="ghost" className="ms-auto" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
          )}
          <Button variant={quiet ? 'secondary' : 'primary'} className={onCancel ? undefined : 'ms-auto'} onClick={() => void submit()} disabled={pending || (!text.trim() && !allowEmpty)}>
            <SendHorizontal className="size-4 rtl:-scale-x-100" /> {pending ? pendingLabel : submitLabel}
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-red-600 dark:text-red-400">
          {error.message}
        </p>
      )}
    </div>
  )
}
