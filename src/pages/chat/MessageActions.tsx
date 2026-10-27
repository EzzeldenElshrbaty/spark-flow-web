import clsx from 'clsx'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { useDeleteMessage, useReact } from '@/api/chat'
import type { ChatTarget } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { MenuPanel } from '@/components/ui/Menu'
import { Sheet } from '@/components/ui/Sheet'
import { REACTIONS } from '@/lib/reactions'

export const menuItemClass = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm text-fg-secondary hover:bg-surface-muted'

/**
 * The ⋯ on a message or reply: a row of reactions, then Edit and Delete for my own, then whatever the page adds
 * (Create task). Shown on hover or focus on desktop, always on phones.
 */
export function MessageActions({
  target,
  can,
  onEdit,
  extra,
}: {
  target: ChatTarget
  can: { react: boolean; edit: boolean; remove: boolean }
  onEdit: () => void
  /** More menu items; each gets the close function so it can shut the menu. */
  extra?: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const react = useReact()
  const remove = useDeleteMessage()
  const close = () => setOpen(false)
  const more = extra?.(close)
  if (!can.react && !can.edit && !can.remove && !more) return null
  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Message actions"
        title="Message actions"
        className={clsx(
          'flex size-8 items-center justify-center rounded-lg text-fg-tertiary transition hover:bg-surface-muted hover:text-fg',
          !open && 'sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100',
        )}
      >
        <MoreHorizontal className="size-4" />
      </button>
      <MenuPanel open={open} onClose={close} triggerRef={triggerRef} label="Message actions" className="p-1.5 sm:w-60">
        {can.react && (
          <div className="flex flex-wrap gap-1 px-1.5 pb-1.5 pt-1" role="group" aria-label="Add reaction">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="menuitem"
                aria-label={`Add reaction ${emoji}`}
                onClick={() => {
                  close()
                  react.mutate({ target, emoji })
                }}
                className="flex size-9 items-center justify-center rounded-lg text-lg hover:bg-surface-muted"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        {can.edit && (
          <button
            type="button"
            role="menuitem"
            className={menuItemClass}
            onClick={() => {
              close()
              onEdit()
            }}
          >
            <Pencil className="size-4 shrink-0" /> Edit message
          </button>
        )}
        {can.remove && (
          <button
            type="button"
            role="menuitem"
            className={clsx(menuItemClass, 'text-red-600 dark:text-red-400')}
            onClick={() => {
              close()
              setConfirming(true)
            }}
          >
            <Trash2 className="size-4 shrink-0" /> Delete message
          </button>
        )}
        {more}
      </MenuPanel>
      {react.error && (
        <p role="alert" className="absolute end-0 top-full z-10 mt-1 w-56 rounded-lg bg-surface p-2 text-xs text-red-600 shadow-lg ring-1 ring-line dark:text-red-400">
          {react.error.message}
        </p>
      )}
      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete message?"
        description="This can't be undone. Replies in its thread stay."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(target, { onSuccess: () => setConfirming(false) })}>
              {remove.isPending ? 'Deleting…' : 'Delete message'}
            </Button>
          </>
        }
      >
        {remove.error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {remove.error.message}
          </p>
        )}
      </Sheet>
    </div>
  )
}
