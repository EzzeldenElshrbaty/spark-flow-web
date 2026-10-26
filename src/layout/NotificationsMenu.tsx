import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Bell, Info, type LucideIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { MenuPanel } from '../components/ui/Menu'
import { roundButtonClass, roundButtonFill } from '../components/ui/styles'
import { timeAgo } from '../lib/format'
import { useRole } from '../lib/useRole'
import { notificationsApi, type AppNotification, type NotificationKind } from '../api/notifications'

const kindStyle: Record<NotificationKind, { icon: LucideIcon; tone: string }> = {
  update: { icon: Info, tone: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
}

/** The bell in the top bar: unread count, and the list as a dropdown (a bottom sheet on phones). */
export function NotificationsMenu() {
  const { persona } = useRole()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const key = ['notifications', persona.id]
  // Refreshed every minute and on every open, like a push from the server would; quietly, without the top loading bar.
  const { data } = useQuery({ queryKey: key, queryFn: () => notificationsApi.list(persona.id), refetchInterval: 120_000, meta: { silent: true } })
  const markRead = useMutation({
    mutationFn: (ids: string[]) => notificationsApi.markRead(persona.id, ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  })

  const unread = data?.unread ?? 0
  const items = (data?.items ?? []).filter((item) => !unreadOnly || !item.read)

  const pick = (item: AppNotification) => {
    if (!item.read) markRead.mutate([item.id])
    setOpen(false)
    navigate(item.link)
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!open) queryClient.invalidateQueries({ queryKey: key })
          setOpen((value) => !value)
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className={clsx(roundButtonClass, roundButtonFill, 'text-fg-tertiary')}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        title="Notifications"
      >
        <Bell className="size-[18px]" />
        {/* Unread count on the circle's top-right edge. */}
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white ring-2 ring-surface">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <MenuPanel open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} label="Notifications" className="sm:w-96">
        <div className="sticky top-0 z-10 border-b border-line-subtle bg-surface px-4 pb-2 pt-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-fg">Notifications</p>
            <button
              type="button"
              disabled={!unread}
              onClick={() => markRead.mutate((data?.items ?? []).filter((item) => !item.read).map((item) => item.id))}
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

        {!data ? (
          <p className="px-4 py-8 text-center text-sm text-fg-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-fg-muted">{unreadOnly ? 'You’re all caught up.' : 'No notifications yet.'}</p>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {items.map((item) => {
              const { icon: Icon, tone } = kindStyle[item.kind]
              return (
                <li key={item.id}>
                  <button type="button" role="menuitem" onClick={() => pick(item)} className={clsx('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-muted', !item.read && 'bg-accent-soft/40')}>
                    <span className={clsx('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', tone)}>
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={clsx('truncate text-sm', item.read ? 'text-fg-secondary' : 'font-semibold text-fg')}>{item.title}</span>
                        <span className="shrink-0 text-[11px] text-fg-muted">{timeAgo(item.at)}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-fg-muted">{item.text}</span>
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
