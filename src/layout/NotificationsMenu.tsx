import clsx from 'clsx'
import { IconBell } from '@tabler/icons-react'
import { AtSign } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useMarkMentionsRead, useMyMentions } from '@/api/mentions'
import { useShownError } from '@/lib/useShownError'
import { useWorkspaces } from '@/api/workspaces'
import type { MentionItem } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { MenuPanel } from '@/components/ui/Menu'
import { Icon } from '@/components/sf/Icon'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { timeAgo } from '@/lib/format'
import { mentionLink } from '@/lib/mentionLink'
import { useRole } from '@/lib/useRole'

/** The bell in the top bar: mentions of me, with the unread count, as a dropdown (a bottom sheet on phones). */
export function NotificationsMenu() {
  const { persona } = useRole()
  const { workspace } = useCurrentWorkspace()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const mentions = useMyMentions(Boolean(persona.id))
  // Lasts through Try again and the polling refetches, so the error doesn't flip back to the skeleton.
  const mentionsError = useShownError(mentions)
  const markRead = useMarkMentionsRead()
  const workspaces = useWorkspaces().data ?? []
  const data = mentions.data

  const unread = (data ?? []).filter((item) => !item.read).length
  const items = (data ?? []).filter((item) => !unreadOnly || !item.read)

  const pick = (item: MentionItem) => {
    if (!item.read) markRead.mutate([item.id])
    setOpen(false)
    navigate(mentionLink(item, workspaces, workspace?.slug ?? ''))
  }

  return (
    // Phones hide the bell (spec 5.4): mentions are on Home and in the Activity row there.
    <div className="relative hidden shrink-0 md:block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!open) void mentions.refetch()
          setOpen((value) => !value)
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className="sf-focus relative inline-grid size-sf-control flex-none cursor-pointer place-items-center rounded-sf-full border border-sf-line text-sf-text-secondary transition-colors duration-150 ease-sf hover:bg-sf-surface-hover hover:text-sf-text"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        title="Notifications"
      >
        <Icon icon={IconBell} />
        {/* A red dot while something is unread; the count is in the label and the menu. */}
        {unread > 0 && (
          <span aria-hidden className="absolute end-[7px] top-1.5 size-2 rounded-sf-full bg-sf-accent-fill shadow-[0_0_0_2px_var(--surface)]" />
        )}
      </button>

      <MenuPanel open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} label="Notifications" className="sm:w-96">
        <div className="sticky top-0 z-10 border-b border-line-subtle bg-surface px-4 pb-2 pt-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-fg">Notifications</p>
            <button
              type="button"
              disabled={!unread}
              onClick={() => markRead.mutate((data ?? []).filter((item) => !item.read).map((item) => item.id))}
              className="text-xs font-medium text-accent hover:text-accent-strong disabled:text-fg-subtle"
            >
              Mark all as read
            </button>
          </div>
          <div className="mt-2 inline-flex rounded-lg border border-line p-0.5 text-xs" role="group" aria-label="Show">
            {(
              [
                [false, 'All'],
                [true, `Unread${unread ? ` (${unread})` : ''}`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={String(value)}
                type="button"
                role="menuitemradio"
                aria-checked={unreadOnly === value}
                onClick={() => setUnreadOnly(value)}
                className={clsx('rounded-md px-2.5 py-1', unreadOnly === value ? 'bg-surface-muted font-medium text-fg' : 'text-fg-muted hover:text-fg')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {!data && mentionsError ? (
          <div className="space-y-3 p-4 text-center" role="alert">
            <p className="text-sm text-fg-secondary">Mentions didn't load.</p>
            <Button variant="secondary" onClick={() => void mentions.refetch()} disabled={mentions.isFetching}>
              {mentions.isFetching ? 'Trying…' : 'Try again'}
            </Button>
          </div>
        ) : !data ? (
          <div className="space-y-3 p-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-muted" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-fg-muted">{unreadOnly ? 'You’re all caught up.' : 'No mentions yet.'}</p>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {items.map((item) => {
              return (
                <li key={item.id}>
                  <button type="button" role="menuitem" onClick={() => pick(item)} className={clsx('flex w-full items-start gap-3 px-4 py-3 text-start hover:bg-surface-muted', !item.read && 'bg-accent-soft/40')}>
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                      <AtSign className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={clsx('truncate text-sm', item.read ? 'text-fg-secondary' : 'font-semibold text-fg')}>{item.authorName} mentioned you</span>
                        <span className="shrink-0 text-[11px] text-fg-muted">{timeAgo(item.createdAt)}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-fg-muted">{item.excerpt}</span>
                    </span>
                    {!item.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-brand-500" aria-label="Unread" />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </MenuPanel>
    </div>
  )
}
