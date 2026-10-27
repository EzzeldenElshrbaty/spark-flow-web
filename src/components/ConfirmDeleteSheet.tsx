import { useMutation } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Button } from '@/components/ui/Button'
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
  onConfirm: () => Promise<unknown>
  onClose: () => void
}) {
  const run = useMutation({ mutationFn: onConfirm, onSuccess: onClose })
  const { reset } = run
  // Each opening starts clean: an old failure doesn't greet the next try.
  useEffect(() => {
    if (open) reset()
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
      {run.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {run.error.message}
        </p>
      )}
    </Sheet>
  )
}
