import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, inputClass } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'

/**
 * "Delete …?" for things one person owns (a message, a comment, a time entry): no typing to confirm, which
 * DeleteDialog asks for records. The error stays in the sheet; it closes once the delete went through.
 */
export function ConfirmDeleteSheet({
  open,
  title,
  description,
  actionLabel,
  pendingLabel = 'Deleting…',
  tone = 'danger',
  askWhy = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description: string
  actionLabel: string
  pendingLabel?: string
  /** Red for what can't be undone; primary for what can (archiving). */
  tone?: 'danger' | 'primary'
  /** Asks "Why?" (optional, at most 200 characters), as archiving does (slice 4); onConfirm gets it. */
  askWhy?: boolean
  onConfirm: (reason: string) => Promise<unknown>
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const run = useMutation({ mutationFn: () => onConfirm(reason.trim()), onSuccess: onClose })
  const { reset } = run
  // Each opening starts clean: an old failure, or an old reason, doesn't greet the next try.
  useEffect(() => {
    if (open) {
      reset()
      setReason('')
    }
  }, [open, reset])
  // While it's working, it stays open (the ✕ and Cancel wait too).
  const close = () => {
    if (!run.isPending) onClose()
  }
  return (
    <Sheet
      open={open}
      onClose={close}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={run.isPending}>
            Cancel
          </Button>
          <Button variant={tone} disabled={run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? pendingLabel : actionLabel}
          </Button>
        </>
      }
    >
      {askWhy && (
        <Field label="Why?" hint={`Optional. Shown in Archived records. ${reason.length}/200`}>
          <textarea className={`${inputClass} min-h-20`} value={reason} maxLength={200} disabled={run.isPending} onChange={(e) => setReason(e.target.value)} />
        </Field>
      )}
      {run.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {run.error.message}
        </p>
      )}
    </Sheet>
  )
}
