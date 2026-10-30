import { useId, useMemo, useState } from 'react'
import { Button } from '@/components/sf/Button'
import { Modal } from '@/components/sf/Modal'
import { toLocalInput } from '@/lib/format'
import { customRemindError, remindPresets } from '@/lib/remindTimes'

const field = 'sf-ui h-sf-input w-full min-w-0 rounded-sf-md border border-sf-line-strong bg-sf-surface px-3 text-sf-text outline-none focus:border-sf-focus focus:shadow-[0_0_0_3px_var(--surface-mention)] max-md:h-11'
const CUSTOM = 'custom'

/**
 * /remind (spec 6.8): What (the words typed after /remind) and When (the Remind me times, or Custom…), Cancel and Set
 * reminder. The time is picked, never read from the words. A refusal is said here and everything stays.
 */
export function RemindDialog({
  initialText,
  where,
  onSet,
  onClose,
}: {
  initialText: string
  /** "#backend": shown under the title. */
  where: string
  onSet: (text: string, at: Date) => Promise<unknown>
  onClose: () => void
}) {
  const ids = useId()
  const presets = useMemo(() => remindPresets(new Date()), [])
  const [text, setText] = useState(initialText)
  const [choice, setChoice] = useState(presets[0].label)
  const [custom, setCustom] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ok = text.trim() !== '' && !pending

  const set = () => {
    if (!ok) return
    let at = presets.find((p) => p.label === choice)?.at
    if (choice === CUSTOM) {
      const wrong = customRemindError(custom, new Date())
      if (wrong) return setError(wrong)
      at = new Date(custom)
    }
    setPending(true)
    setError(null)
    onSet(text.trim(), at!).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'The reminder wasn’t set. Try again.')
      setPending(false)
    })
  }

  const option = (value: string, label: string, hint?: string | null) => (
    <label key={value} className="sf-ui flex min-h-9 cursor-pointer items-center gap-2 rounded-sf-md px-2 text-sf-text hover:bg-sf-surface-hover max-md:min-h-11">
      <input type="radio" name={`${ids}-when`} value={value} checked={choice === value} onChange={() => setChoice(value)} className="size-4 accent-[var(--accent-fill)]" />
      {label}
      {hint && <span className="sf-meta ms-auto text-sf-text-muted">{hint}</span>}
    </label>
  )

  return (
    <Modal
      open
      onClose={onClose}
      title="Set a reminder"
      description={`Flowbot will remind you. Set in ${where}.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ok} onClick={set}>
            {pending ? 'Setting…' : 'Set reminder'}
          </Button>
        </>
      }
    >
      <label htmlFor={`${ids}-what`} className="sf-small mb-1 block font-medium text-sf-text">
        What
      </label>
      <input id={`${ids}-what`} className={field} value={text} maxLength={1000} placeholder="What to remind you about" onChange={(e) => setText(e.target.value)} />
      <fieldset className="mt-4 border-0 p-0">
        <legend className="sf-small mb-1 font-medium text-sf-text">When</legend>
        {presets.map((p) => option(p.label, p.label, p.hint))}
        {option(CUSTOM, 'Custom…')}
      </fieldset>
      {choice === CUSTOM && (
        <div className="mt-2">
          <label htmlFor={`${ids}-at`} className="sf-small mb-1 block font-medium text-sf-text">
            Date and time
          </label>
          <input
            id={`${ids}-at`}
            type="datetime-local"
            className={`${field} tabular-nums`}
            value={custom}
            min={toLocalInput(new Date())}
            onChange={(e) => {
              setCustom(e.target.value)
              setError(null)
            }}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="sf-small mt-3 text-sf-error">
          {error}
        </p>
      )}
    </Modal>
  )
}
