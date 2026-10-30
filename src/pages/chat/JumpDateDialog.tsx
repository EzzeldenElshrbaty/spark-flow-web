import { useId, useState } from 'react'
import { Button } from '@/components/sf/Button'
import { Modal } from '@/components/sf/Modal'

/** A local date as YYYY-MM-DD, as a date input reads it. */
const dayValue = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Jump to a specific date… (spec 6.2 date menu): a day up to today; the list opens from that day's first message, or
 * the newest one when nothing came after it.
 */
export function JumpDateDialog({ today = new Date(), onJump, onClose }: { today?: Date; onJump: (choice: { date: string }) => void; onClose: () => void }) {
  const id = useId()
  const max = dayValue(today)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const jump = () => {
    if (!value) return setError('Pick a day.')
    if (value > max) return setError('Pick a day up to today.')
    onJump({ date: value })
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Jump to a date"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={jump}>
            Jump
          </Button>
        </>
      }
    >
      <label htmlFor={id} className="sf-small mb-1 block font-medium text-sf-text">
        Date
      </label>
      <input
        id={id}
        type="date"
        max={max}
        value={value}
        aria-invalid={error ? true : undefined}
        onChange={(e) => (setValue(e.target.value), setError(null))}
        onKeyDown={(e) => e.key === 'Enter' && jump()}
        className="sf-ui h-sf-input min-w-0 rounded-sf-md border border-sf-line-strong bg-sf-surface px-3 text-sf-text tabular-nums outline-none focus:border-sf-focus focus:shadow-[0_0_0_3px_var(--surface-mention)] max-md:h-11"
      />
      {error && (
        <p role="alert" className="sf-small mt-2 text-sf-error">
          {error}
        </p>
      )}
    </Modal>
  )
}
