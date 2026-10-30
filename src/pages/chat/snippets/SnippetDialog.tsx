import { IconChevronDown } from '@tabler/icons-react'
import clsx from 'clsx'
import { useId, useRef, useState } from 'react'
import type { CodeLanguage } from '@/api/types'
import { Button } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Menu, MenuItem } from '@/components/sf/Menu'
import { Modal } from '@/components/sf/Modal'
import { CODE_LANGUAGES, languageLabel } from '@/lib/codeTokens'

export type NewSnippet = { title: string; language: CodeLanguage; content: string; message: string }

const TITLE_MAX = 120
const field = 'sf-ui h-sf-input w-full min-w-0 rounded-sf-md border border-sf-line-strong bg-sf-surface px-3 text-sf-text outline-none focus:border-sf-focus focus:shadow-[0_0_0_3px_var(--surface-mention)] max-md:h-11'
const label = 'sf-small mb-1 block font-medium text-sf-text'

/**
 * Create a text snippet (spec 6.9, the "Text snippet" artboard): Title, Type, Content with line numbers and an optional
 * Message, "Shares to #channel", Cancel and Create snippet. 720px wide; the scrim never closes it. A failure is said
 * under the fields and everything typed stays.
 */
export function SnippetDialog({
  where,
  initialContent,
  max,
  onCreate,
  onClose,
}: {
  /** "#backend", or a person's name in a DM. */
  where: string
  initialContent: string
  max: number
  onCreate: (snippet: NewSnippet) => Promise<unknown>
  onClose: () => void
}) {
  const ids = useId()
  const [title, setTitle] = useState('')
  const [language, setLanguage] = useState<CodeLanguage>('text')
  const [content, setContent] = useState(initialContent)
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const gutter = useRef<HTMLDivElement>(null)
  const lines = Math.max(1, content.split(/\r?\n/).length)
  const left = max - content.length
  const ok = content.trim() !== '' && left >= 0 && !pending

  const create = () => {
    if (!ok) return
    setPending(true)
    setError(null)
    onCreate({ title: title.trim(), language, content, message }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'The snippet wasn’t created. Try again.')
      setPending(false)
    })
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Create a text snippet"
      footer={
        <>
          <span className="sf-small me-auto text-sf-text-secondary">Shares to {where}</span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ok} onClick={create}>
            {pending ? 'Creating…' : 'Create snippet'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)_200px] gap-4 max-sm:grid-cols-1">
        <div>
          <label htmlFor={`${ids}-title`} className={label}>
            Title
          </label>
          <input id={`${ids}-title`} className={field} value={title} maxLength={TITLE_MAX} placeholder="Untitled" onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <span className={label} aria-hidden>
            Type
          </span>
          <Menu
            label="Snippet type"
            trigger={(props) => (
              <button type="button" aria-label={`Type: ${languageLabel(language)}`} {...props} className={clsx(field, 'sf-focus flex cursor-pointer items-center justify-between text-start')}>
                {languageLabel(language)}
                <Icon icon={IconChevronDown} size={16} className="text-sf-text-secondary" />
              </button>
            )}
          >
            {CODE_LANGUAGES.map((l) => (
              <MenuItem key={l.id} checked={l.id === language} onSelect={() => setLanguage(l.id)}>
                {l.label}
              </MenuItem>
            ))}
          </Menu>
        </div>
      </div>
      <div className="mt-4">
        <label htmlFor={`${ids}-content`} className={label}>
          Content
        </label>
        {/* Line numbers beside the text, scrolled with it; the editor itself is plain (the card highlights). */}
        <div className="flex max-h-72 min-h-36 overflow-hidden rounded-sf-md border border-sf-line-strong bg-sf-surface-sunken focus-within:border-sf-focus focus-within:shadow-[0_0_0_3px_var(--surface-mention)]">
          <div ref={gutter} aria-hidden className="sf-code flex-none overflow-hidden py-3 ps-3 pe-2 text-end text-sf-text-muted select-none">
            {Array.from({ length: lines }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <textarea
            id={`${ids}-content`}
            value={content}
            spellCheck={false}
            wrap="off"
            aria-invalid={left < 0 || undefined}
            onChange={(e) => {
              setContent(e.target.value)
              setError(null)
            }}
            onScroll={(e) => {
              if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop
            }}
            className="sf-code min-w-0 flex-1 resize-none bg-transparent py-3 pe-3 text-sf-text outline-none"
          />
        </div>
        {left < 1000 && <p className={clsx('sf-meta mt-1 text-end tabular-nums', left < 0 ? 'font-semibold text-sf-error' : 'text-sf-text-muted')}>{left}</p>}
      </div>
      <div className="mt-4">
        <label htmlFor={`${ids}-message`} className={label}>
          Message <span className="font-normal text-sf-text-muted">(optional)</span>
        </label>
        <input id={`${ids}-message`} className={field} value={message} placeholder={`Add a message to ${where}`} onChange={(e) => setMessage(e.target.value)} />
      </div>
      {error && (
        <p role="alert" className="sf-small mt-3 text-sf-error">
          {error}
        </p>
      )}
    </Modal>
  )
}
