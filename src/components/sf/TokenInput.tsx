import { IconAlertCircle, IconMail, IconUsersGroup, IconX } from '@tabler/icons-react'
import clsx from 'clsx'
import { useId, useRef, useState, type ReactNode } from 'react'
import { Avatar } from './Avatar'
import { Tag } from './Badge'
import { IconButton } from './Button'
import { Icon } from './Icon'

/** A chip: a person shows an avatar; an email a mail icon and the Guest tag (spec 6.10); anything else is plain. */
export type Token = { id: string; label: string; kind?: 'person' | 'email' }
/** A suggestion can also be a group (a team), which adds its people. */
export type Suggestion = { id: string; label: string; kind?: 'person' | 'email' | 'group'; description?: string }

function KindMark({ token }: { token: Suggestion }) {
  if (token.kind === 'person') return <Avatar id={token.id} name={token.label} size="sm" decorative />
  if (token.kind === 'email') return <Icon icon={IconMail} size={16} className="mx-0.5 flex-none text-sf-text-secondary" />
  if (token.kind === 'group') return <Icon icon={IconUsersGroup} size={16} className="mx-0.5 flex-none text-sf-text-secondary" />
  return null
}

/**
 * Chips plus a text field (spec 6.13, "Names or emails"). Enter or a comma adds the highlighted suggestion,
 * or the typed text through `onCommit`; Backspace in an empty field removes the last chip. Suggestions are
 * a listbox driven by aria-activedescendant, so focus stays in the field.
 */
export function TokenInput({
  label,
  tokens,
  onRemove,
  onAdd,
  onCommit,
  query,
  onQueryChange,
  suggestions = [],
  placeholder,
  help,
  error,
}: {
  label: string
  tokens: Token[]
  onRemove: (id: string) => void
  onAdd: (token: Suggestion) => void
  /** Typed text with no suggestion picked, e.g. a raw email. */
  onCommit?: (text: string) => void
  query: string
  onQueryChange: (query: string) => void
  suggestions?: Suggestion[]
  placeholder?: string
  help?: ReactNode
  error?: string
}) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [active, setActive] = useState(0)
  const [focused, setFocused] = useState(false)
  const listOpen = focused && query.trim() !== '' && suggestions.length > 0
  const current = listOpen ? suggestions[Math.min(active, suggestions.length - 1)] : undefined

  const pick = (s: Suggestion) => {
    onAdd(s)
    onQueryChange('')
    setActive(0)
    inputRef.current?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && listOpen) setActive((a) => (a + 1) % suggestions.length)
    else if (event.key === 'ArrowUp' && listOpen) setActive((a) => (a - 1 + suggestions.length) % suggestions.length)
    else if (event.key === 'Enter' || event.key === ',') {
      if (current) pick(current)
      else if (query.trim() && onCommit) {
        onCommit(query.trim())
        onQueryChange('')
      } else if (event.key === 'Enter') return
    } else if (event.key === 'Backspace' && query === '' && tokens.length > 0) {
      onRemove(tokens[tokens.length - 1].id)
      return
    } else if (event.key === 'Escape' && listOpen) {
      onQueryChange('')
    } else return
    event.preventDefault()
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-sf text-[13px]/[18px] font-medium text-sf-text">
        {label}
      </label>
      <div className="relative">
        <div
          onClick={() => inputRef.current?.focus()}
          className={clsx(
            'sf-ui flex min-h-sf-input flex-wrap items-center gap-1 rounded-sf-md border bg-sf-surface p-1 text-sf-text',
            error
              ? 'border-sf-error'
              : 'border-sf-line-strong focus-within:border-sf-focus focus-within:shadow-[0_0_0_3px_var(--surface-mention)]',
          )}
        >
          {tokens.map((t) => (
            <span
              key={t.id}
              // A long address shortens with an ellipsis, so its × stays in the field on a phone; the × still names it in full.
              className="inline-flex h-7 max-w-full min-w-0 items-center gap-1 rounded-sf-md border border-sf-line bg-sf-surface-hover ps-1 pe-0.5 font-sf text-[13px]/[18px] font-medium text-sf-text"
            >
              <KindMark token={t} />
              <span className="min-w-0 truncate">{t.label}</span>
              {t.kind === 'email' && <Tag tone="accent">Guest</Tag>}
              <IconButton
                label={`Remove ${t.label}`}
                icon={IconX}
                size="xs"
                tooltip={false}
                // A 44px touch target on phones (spec 6.16) around the 24px ×.
                className="relative max-md:after:absolute max-md:after:-inset-2.5"
                onClick={(event) => {
                  event.stopPropagation()
                  onRemove(t.id)
                  inputRef.current?.focus()
                }}
              />
            </span>
          ))}
          <input
            ref={inputRef}
            id={id}
            role="combobox"
            aria-expanded={listOpen}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-activedescendant={current ? `${id}-${current.id}` : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={error || help ? `${id}-help` : undefined}
            value={query}
            placeholder={tokens.length === 0 ? placeholder : undefined}
            onChange={(event) => {
              onQueryChange(event.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="h-7 min-w-[120px] flex-1 border-0 bg-transparent px-2 text-sf-text outline-none placeholder:text-sf-text-muted"
          />
        </div>
        <div
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          hidden={!listOpen}
          className="absolute top-full z-[var(--z-menu)] mt-1 flex w-[380px] max-w-full flex-col rounded-sf-lg bg-sf-surface-raised py-2 shadow-sf-menu"
        >
          {suggestions.map((s) => (
            <div
              key={s.id}
              id={`${id}-${s.id}`}
              role="option"
              aria-selected={s === current}
              // Keep focus in the field while picking with the mouse.
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => pick(s)}
              className="sf-ui mx-2 flex min-h-9 cursor-pointer items-center gap-2 rounded-sf-md px-2 py-1 text-sf-text hover:bg-sf-surface-hover aria-selected:bg-sf-surface-hover"
            >
              <KindMark token={s} />
              <span className="font-medium">{s.label}</span>
              {s.description && <span className="text-[13px] text-sf-text-secondary">{s.description}</span>}
            </div>
          ))}
        </div>
      </div>
      {/* An error is a new alert node, so a screen reader says it; help text is read with the field only. */}
      {error ? (
        <p key="error" id={`${id}-help`} role="alert" className="sf-meta m-0 flex items-center gap-1 text-sf-accent">
          <Icon icon={IconAlertCircle} size={16} />
          {error}
        </p>
      ) : (
        help && (
          <p key="help" id={`${id}-help`} className="sf-meta m-0 text-sf-text-secondary">
            {help}
          </p>
        )
      )}
    </div>
  )
}
