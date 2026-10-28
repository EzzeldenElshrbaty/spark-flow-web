import clsx from 'clsx'
import { CircleDot, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useDeleteMessage, useReact, useRestoreMessage } from '@/api/chat'
import type { ChatTarget } from '@/api/types'
import { IconTrash } from '@tabler/icons-react'
import { Button as SfButton } from '@/components/sf/Button'
import { Modal } from '@/components/sf/Modal'
import { useToast } from '@/components/sf/Toast'
import { MenuPanel } from '@/components/ui/Menu'
import { REACTIONS } from '@/lib/reactions'
import { useRole } from '@/lib/useRole'

export const menuItemClass = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm text-fg-secondary hover:bg-surface-muted'

/**
 * The ⋯ on a message or reply: a row of reactions, then Edit and Delete for my own, then whatever the page adds
 * (Create task). Shown on hover or focus on desktop, always on phones.
 */
export function MessageActions({
  target,
  can,
  confirmDelete = false,
  onEdit,
  onMarkUnread,
  extra,
}: {
  target: ChatTarget
  can: { react: boolean; edit: boolean; remove: boolean }
  /** Ask before deleting (it has replies or files); otherwise it goes at once, with Undo (spec 6.3). */
  confirmDelete?: boolean
  onEdit: () => void
  /** Mark unread (U), on someone else's message in the channel's list. */
  onMarkUnread?: () => void
  /** More menu items; each gets the close function so it can shut the menu. */
  extra?: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { persona } = useRole()
  const react = useReact(persona.id)
  const remove = useDeleteMessage()
  const restore = useRestoreMessage()
  const toast = useToast()
  // Once deleted, the row goes and takes this ⋯ with it: focus moves on (after the confirm dialog has put it back).
  const [deleted, setDeleted] = useState(0)
  useEffect(() => {
    if (deleted) focusAfterDelete(triggerRef.current)
  }, [deleted])
  /** Deletes, then offers Undo for 5s; an Undo that comes too late says so. */
  const deleteNow = () =>
    remove.mutateAsync(target).then(() => {
      setConfirming(false)
      setDeleted((n) => n + 1)
      toast({
        message: 'Message deleted',
        icon: IconTrash,
        action: { label: 'Undo', onAction: () => restore.mutate(target, { onError: (e) => toast({ message: (e as Error).message }) }) },
      })
    })
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
        {onMarkUnread && (
          <button
            type="button"
            role="menuitem"
            aria-keyshortcuts="U"
            className={menuItemClass}
            onClick={() => {
              close()
              onMarkUnread()
            }}
          >
            <CircleDot className="size-4 shrink-0" /> Mark unread
            <span aria-hidden className="ms-auto text-xs text-fg-muted">
              U
            </span>
          </button>
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
              if (confirmDelete) setConfirming(true)
              else void deleteNow().catch(() => {})
            }}
          >
            <Trash2 className="size-4 shrink-0" /> Delete message
          </button>
        )}
        {more}
      </MenuPanel>
      {(react.error || (!confirming && remove.error)) && (
        <p role="alert" className="absolute end-0 top-full z-10 mt-1 w-56 rounded-lg bg-surface p-2 text-xs text-red-600 shadow-lg ring-1 ring-line dark:text-red-400">
          {(react.error ?? remove.error)?.message}
        </p>
      )}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete message?"
        description="Replies in its thread stay. Its files are deleted with it."
        footer={
          <>
            <SfButton onClick={() => setConfirming(false)}>Cancel</SfButton>
            <SfButton variant="danger" disabled={remove.isPending} onClick={() => void deleteNow().catch(() => {})}>
              {remove.isPending ? 'Deleting…' : 'Delete message'}
            </SfButton>
          </>
        }
      >
        {remove.error && <p className="sf-small text-sf-error">{remove.error.message}</p>}
      </Modal>
    </div>
  )
}

/**
 * Where focus goes once a message is deleted (spec 10): the next message's ⋯, else the one before, else the list.
 * Not when focus has already gone somewhere else.
 */
function focusAfterDelete(trigger: HTMLElement | null) {
  const active = document.activeElement
  if (!trigger || (active && active !== document.body && active !== trigger)) return
  const item = trigger.closest('li')
  const siblings = (dir: 'nextElementSibling' | 'previousElementSibling') => {
    for (let li = item?.[dir] ?? null; li; li = li[dir]) {
      const found = li.querySelector<HTMLElement>('[aria-label="Message actions"]')
      if (found) return found
    }
    return null
  }
  ;(siblings('nextElementSibling') ?? siblings('previousElementSibling') ?? trigger.closest<HTMLElement>('[role="log"]'))?.focus()
}
