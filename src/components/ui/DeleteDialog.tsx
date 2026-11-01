import { useMutation } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, inputClass } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'

/**
 * Management deletes a lead, opportunity or client for good. The person types the record's number (or the client's
 * name) to confirm, so it never happens by a slip of the mouse. The API checks the same rules and says why when a
 * record has to be closed instead.
 */
export function DeleteDialog({
  title,
  description,
  confirmText,
  removes,
  onDelete,
  onClose,
  actionLabel = 'Delete for good',
  pendingLabel = 'Deleting…',
}: {
  title: string
  description: string
  /** What the person types: "L-1023", or the client's name. */
  confirmText: string
  /** What goes with it, one short line each. */
  removes: string[]
  /** Calls the API, then leaves the page (before everything reloads, so the deleted record isn't fetched again). */
  onDelete: (confirm: string) => Promise<unknown>
  onClose: () => void
  /** The confirm button, verb first; defaults to the delete wording. */
  actionLabel?: string
  pendingLabel?: string
}) {
  const [typed, setTyped] = useState('')
  const remove = useMutation({ mutationFn: () => onDelete(typed.trim()) })
  const matches = typed.trim().toLowerCase() === confirmText.trim().toLowerCase()
  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" form="delete-form" disabled={!matches || remove.isPending}>
            {remove.isPending ? pendingLabel : actionLabel}
          </Button>
        </>
      }
    >
      <form
        id="delete-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (matches) remove.mutate()
        }}
        className="space-y-4"
      >
        <div className="flex gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/15 dark:text-red-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">This can't be undone.</p>
            <ul className="mt-1 list-disc space-y-0.5 ps-4">
              {removes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
        <Field label={`Type ${confirmText} to confirm`} required error={(remove.error as Error | null)?.message}>
          <input className={inputClass} value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" autoFocus />
        </Field>
      </form>
    </Sheet>
  )
}
