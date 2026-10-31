import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useRemoveTime } from '@/api/time'
import type { TimeEntry } from '@/api/types'
import { ConfirmDeleteSheet } from '@/components/ConfirmDeleteSheet'
import { MenuPanel } from '@/components/ui/Menu'
import { AddTimeSheet } from '@/pages/time/AddTimeSheet'

const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm text-fg-secondary hover:bg-surface-muted'

/** Whether I may fix or delete an entry: mine (or anyone's, with time.editOthers), once it has stopped. */
export const canChangeEntry = (entry: TimeEntry, meId: string, editOthers: boolean) => entry.endedAt !== null && (entry.userId === meId || editOthers)

/** The ⋯ on a time entry: Edit entry (the Add time form, filled in) and Delete entry. `editing` opens the form from outside. */
export function EntryActions({ entry, editing = false, onEditingChange }: { entry: TimeEntry; editing?: boolean; onEditingChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const remove = useRemoveTime()
  const showEdit = edit || editing
  const closeEdit = () => {
    setEdit(false)
    onEditingChange?.(false)
  }
  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Entry actions"
        title="Entry actions"
        className="flex size-8 items-center justify-center rounded-lg text-fg-tertiary hover:bg-surface-muted hover:text-fg"
      >
        <MoreHorizontal className="size-4" />
      </button>
      <MenuPanel open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} label="Entry actions" className="p-1.5 sm:w-52">
        <button
          type="button"
          role="menuitem"
          className={item}
          onClick={() => {
            setOpen(false)
            setEdit(true)
          }}
        >
          <Pencil className="size-4 shrink-0" /> Edit entry
        </button>
        <button
          type="button"
          role="menuitem"
          className={`${item} text-red-600 dark:text-red-400`}
          onClick={() => {
            setOpen(false)
            setConfirming(true)
          }}
        >
          <Trash2 className="size-4 shrink-0" /> Delete entry
        </button>
      </MenuPanel>
      {showEdit && <AddTimeSheet entry={entry} onClose={closeEdit} />}
      <ConfirmDeleteSheet
        open={confirming}
        title="Delete this entry?"
        description="Its hours and cost come off the project."
        actionLabel="Delete entry"
        onConfirm={() => remove.mutateAsync(entry.id)}
        onClose={() => setConfirming(false)}
      />
    </div>
  )
}
