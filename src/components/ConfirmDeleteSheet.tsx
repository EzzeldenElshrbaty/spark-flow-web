import { useMutation } from '@tanstack/react-query'
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
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description: string
  actionLabel: string
  pendingLabel?: string
  onConfirm: () => Promise<unknown>
  onClose: () => void
}) {
  const run = useMutation({ mutationFn: onConfirm, onSuccess: onClose })
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={run.isPending}>
            Cancel
          </Button>
          <Button variant="danger" disabled={run.isPending} onClick={() => run.mutate()}>
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
