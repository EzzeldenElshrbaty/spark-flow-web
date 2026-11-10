import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useRemoveComment, useUpdateComment } from '@/api/comments'
import type { CommentView } from '@/api/types'
import { AttachmentView } from '@/components/AttachmentView'
import { ConfirmDeleteSheet } from '@/components/ConfirmDeleteSheet'
import { MentionText } from '@/components/MentionText'
import { Avatar } from '@/components/Avatar'
import { Badge } from '@/components/ui/Badge'
import { MenuPanel, menuItemClass } from '@/components/ui/Menu'
import { timeAgo } from '@/lib/format'
import { Composer } from '@/pages/chat/Composer'
import { IconButton } from '@/components/ui/IconButton'

/**
 * One comment or bug on a task. Its author (while they can post on the project) edits it in place or deletes it,
 * which leaves "This comment was deleted."; the card in the project's chat follows either way.
 */
export function CommentRow({ comment, author, mine }: { comment: CommentView; author: string; mine: boolean }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const update = useUpdateComment()
  const remove = useRemoveComment()
  const deleted = Boolean(comment.deletedAt)
  return (
    <li className="group flex gap-3">
      <Avatar name={author} size={24} decorative />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-sm">
            <span className="font-semibold text-fg">{author}</span>
            <span className="text-xs text-fg-muted">
              {timeAgo(comment.createdAt)}
              {comment.editedAt && !deleted && ' · edited'}
            </span>
            {comment.kind === 'bug' && !deleted && <Badge tone="danger">Bug</Badge>}
          </p>
          {mine && !deleted && !editing && (
            <div className="relative">
              <IconButton
                ref={triggerRef}
                label="Comment actions"
                icon={MoreHorizontal}
                size="sm"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                // Shown while its menu is open too: the menu is drawn outside the row (UX Phase 6, final review).
                className="sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 sm:aria-expanded:opacity-100"
              />
              <MenuPanel open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} label="Comment actions" className="p-1.5 sm:w-52">
                <button
                  type="button"
                  role="menuitem"
                  className={menuItemClass}
                  onClick={() => {
                    setOpen(false)
                    update.reset()
                    setEditing(true)
                  }}
                >
                  <Pencil className="size-4 shrink-0" /> Edit comment
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`${menuItemClass} text-red-600 dark:text-red-400`}
                  onClick={() => {
                    setOpen(false)
                    setConfirming(true)
                  }}
                >
                  <Trash2 className="size-4 shrink-0" /> Delete comment
                </button>
              </MenuPanel>
            </div>
          )}
        </div>
        {deleted ? (
          <p className="mt-0.5 text-sm italic text-fg-muted">This comment was deleted.</p>
        ) : editing ? (
          <div className="mt-1">
            <Composer
              quiet
              allowEmpty={comment.attachments.length > 0}
              placeholder="Edit comment"
              here={false}
              submitLabel="Save"
              pendingLabel="Saving…"
              initialText={comment.body}
              onCancel={() => setEditing(false)}
              error={update.error}
              onSubmit={(body) => update.mutateAsync({ id: comment.id, body }, { onSuccess: () => setEditing(false) })}
            />
          </div>
        ) : (
          <MentionText text={comment.body} className="mt-0.5 text-sm text-fg-secondary" />
        )}
        {!deleted && <AttachmentView attachments={comment.attachments} />}
      </div>
      <ConfirmDeleteSheet
        open={confirming}
        title="Delete this comment?"
        description="It also goes from the project’s chat. This can’t be undone."
        actionLabel="Delete comment"
        onConfirm={() => remove.mutateAsync(comment.id)}
        onClose={() => setConfirming(false)}
      />
    </li>
  )
}
