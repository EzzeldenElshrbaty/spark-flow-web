import { IconBell, IconBellOff, IconCircleDot, IconClipboardText, IconLink, IconPencil, IconTrash } from '@tabler/icons-react'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { useDeleteMessage, useRestoreMessage } from '@/api/chat'
import type { ChatTarget } from '@/api/types'
import { Button as SfButton } from '@/components/sf/Button'
import { Menu, MenuItem, MenuSeparator, type MenuTriggerProps } from '@/components/sf/Menu'
import { Modal } from '@/components/sf/Modal'
import { useToast } from '@/components/sf/Toast'

/** Marks the element a row's focus goes back to (after an edit or a delete): its toolbar's Tab stop. */
export const ROW_FOCUS = 'data-row-focus'

/** Whether I follow a thread, and the item that turns it on or off (spec 6.7): the same in every menu. */
export type Follow = { following: boolean; onToggle: () => void }
export function FollowItem({ following, onToggle }: Follow) {
  return (
    <MenuItem icon={following ? IconBellOff : IconBell} onSelect={onToggle}>
      {following ? 'Turn off notifications for replies' : 'Get notified about replies'}
    </MenuItem>
  )
}

/**
 * The ⋯ menu of a message or reply (spec 6.5), in its order: Get notified about replies (a thread's root) and Mark unread · — · whatever the page adds (Create task),
 * Copy link, Copy text · — · Edit and Delete for the author (or Delete for an Admin). On phones `lead` comes first:
 * what the toolbar would carry there. A separator only between groups that have something.
 */
export function MessageMenu({
  target,
  can,
  confirmDelete = false,
  onEdit,
  onMarkUnread,
  onCopyLink,
  onCopyText,
  follow,
  extra,
  lead,
  trigger,
  onDeleteError,
}: {
  target: ChatTarget
  can: { edit: boolean; remove: boolean }
  /** Ask before deleting (it has replies or files); otherwise it goes at once, with Undo (spec 6.3). */
  confirmDelete?: boolean
  onEdit: () => void
  /** Mark unread (U), on someone else's message in the channel's list. */
  onMarkUnread?: () => void
  onCopyLink?: () => void
  onCopyText?: () => void
  /** Following its thread: a top-level message's. */
  follow?: Follow
  /** More items from the page (Create task), as `MenuItem`s. */
  extra?: ReactNode
  /** Phones: the quick reactions, Add reaction and Reply in thread, first in the sheet. */
  lead?: ReactNode
  /** The More button, with its place in the toolbar. */
  trigger: (props: MenuTriggerProps) => ReactNode
  /** Why a delete was refused (null once it isn't), for the toolbar to say outside itself, where it stays in sight. */
  onDeleteError?: (message: string | null) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const remove = useDeleteMessage()
  const restore = useRestoreMessage()
  const toast = useToast()
  // Once deleted, the row goes and takes its toolbar with it: focus moves on (after the confirm dialog has put it back).
  const [deleted, setDeleted] = useState<{ from: HTMLElement | null; to: HTMLElement[] } | null>(null)
  useEffect(() => {
    if (deleted) focusAfterDelete(deleted.from, deleted.to)
  }, [deleted])
  /** Deletes, then offers Undo for 5s; an Undo that comes too late says so. */
  const deleteNow = (from: HTMLElement | null) => {
    // Where focus may go, found while the row is still in the list: in the channel the row leaves (and this menu
    // with it) as soon as the delete lands, before any effect here could run, so a timeout moves focus then.
    const to = landingAfter(from)
    return remove.mutateAsync(target).then(() => {
      setConfirming(false)
      setDeleted({ from, to })
      window.setTimeout(() => focusAfterDelete(from, to))
      toast({
        message: 'Message deleted',
        icon: IconTrash,
        action: { label: 'Undo', onAction: () => restore.mutate(target, { onError: (e) => toast({ message: (e as Error).message }) }) },
      })
    })
  }
  const failed = !confirming && remove.error ? remove.error.message : null
  useEffect(() => {
    onDeleteError?.(failed)
  }, [failed, onDeleteError])
  const wrap = useRef<HTMLDivElement>(null)
  // The More button: where focus is when a delete is chosen, and where the next row's focus is looked for from.
  const more = () => wrap.current?.querySelector<HTMLElement>('button') ?? null

  const groups = [
    [lead],
    [
      follow && <FollowItem {...follow} />,
      onMarkUnread && (
        <MenuItem icon={IconCircleDot} shortcut="U" onSelect={onMarkUnread}>
          Mark unread
        </MenuItem>
      ),
    ],
    [
      extra,
      onCopyLink && (
        <MenuItem icon={IconLink} shortcut="L" onSelect={onCopyLink}>
          Copy link
        </MenuItem>
      ),
      onCopyText && (
        <MenuItem icon={IconClipboardText} onSelect={onCopyText}>
          Copy text
        </MenuItem>
      ),
    ],
    [
      can.edit && (
        <MenuItem icon={IconPencil} shortcut="E" onSelect={onEdit}>
          Edit message
        </MenuItem>
      ),
      can.remove && (
        <MenuItem
          icon={IconTrash}
          danger
          onSelect={() => {
            if (confirmDelete) setConfirming(true)
            else void deleteNow(more()).catch(() => {})
          }}
        >
          Delete message
        </MenuItem>
      ),
    ],
  ]
    .map((group) => group.filter(Boolean))
    .filter((group) => group.length > 0)
  if (groups.length === 0) return null
  return (
    <div ref={wrap} className="relative">
      <Menu label="Message actions" trigger={trigger}>
        {groups.map((group, i) => (
          <Fragment key={i}>
            {i > 0 && <MenuSeparator />}
            {group.map((row, j) => (
              <Fragment key={j}>{row}</Fragment>
            ))}
          </Fragment>
        ))}
      </Menu>
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete message?"
        description="Replies in its thread stay. Its files go from this message but stay wherever else they're shared."
        footer={
          <>
            <SfButton onClick={() => setConfirming(false)}>Cancel</SfButton>
            <SfButton variant="danger" disabled={remove.isPending} onClick={() => void deleteNow(more()).catch(() => {})}>
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

/** Where focus may go once a message is deleted (spec 10), best first: the next message's toolbar, the one before, the list. */
function landingAfter(from: HTMLElement | null): HTMLElement[] {
  const item = from?.closest('li')
  const sibling = (dir: 'nextElementSibling' | 'previousElementSibling') => {
    for (let li = item?.[dir] ?? null; li; li = li[dir]) {
      const found = li.querySelector<HTMLElement>(`[${ROW_FOCUS}]`)
      if (found) return found
    }
    return null
  }
  return [sibling('nextElementSibling'), sibling('previousElementSibling'), from?.closest<HTMLElement>('[role="log"]') ?? null].filter((el): el is HTMLElement => el !== null)
}

/** After a delete: the next message's focus stop, else the one before, else the list; unless focus has moved on. */
function focusAfterDelete(from: HTMLElement | null, to: HTMLElement[]) {
  const active = document.activeElement
  if (!from || (active && active !== document.body && active !== from && active.isConnected)) return
  to.find((el) => el.isConnected)?.focus()
}
