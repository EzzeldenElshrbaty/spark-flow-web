import clsx from 'clsx'
import { IconArrowsExchange, IconAt, IconBell, IconMessage, IconUserCheck, type TablerIcon } from '@tabler/icons-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMarkMentionsRead, useMyMentions } from '@/api/mentions'
import { useShownError } from '@/lib/useShownError'
import { useWorkspaces } from '@/api/workspaces'
import type { MentionItem } from '@/api/types'
import { Button } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Popover } from '@/components/sf/Popover'
import { roundButton } from '@/layout/roundButton'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { timeAgo } from '@/lib/format'
import { mentionLink, notificationLine } from '@/lib/mentionLink'
import { paths } from '@/lib/paths'
import { useRole } from '@/lib/useRole'

/** Each kind of bell item's icon: a mention, or what someone did to a task of mine (UX Phase 2, 2.3). */
const SOURCE_ICONS: Record<MentionItem['source'], TablerIcon> = { message: IconAt, reply: IconAt, comment: IconAt, assigned: IconUserCheck, status: IconArrowsExchange, taskComment: IconMessage }

/**
 * The bell in the top bar: mentions of me and task news for me, with the unread count, in the redesign's panel (a
 * bottom sheet on phones); See all opens this workspace's Activity.
 */
export function NotificationsMenu() {
  const { persona } = useRole()
  const { workspace } = useCurrentWorkspace()
  const navigate = useNavigate()
  const [unreadOnly, setUnreadOnly] = useState(false)
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
    navigate(mentionLink(item, workspaces, workspace?.slug ?? ''))
  }

  return (
    // Phones hide the bell (spec 5.4): mentions are on My work and in the Activity row there.
    <div className="relative hidden shrink-0 md:block">
      <Popover
        label="Notifications"
        className="w-96 max-w-[calc(100vw-16px)]"
        trigger={(props) => (
          <button
            type="button"
            {...props}
            onClick={() => {
              if (!props['aria-expanded']) void mentions.refetch()
              props.onClick()
            }}
            className={clsx(roundButton, 'relative')}
            aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
            title="Notifications"
          >
            <Icon icon={IconBell} />
            {/* A red dot while something is unread; the count is in the label and the panel. */}
            {unread > 0 && (
              <span aria-hidden className="absolute end-[7px] top-1.5 size-2 rounded-sf-full bg-sf-accent-fill shadow-[0_0_0_2px_var(--surface)]" />
            )}
          </button>
        )}
      >
        {(close) => (
          <div className="flex max-h-[min(560px,80dvh)] flex-col">
            <div className="flex-none border-b border-sf-line px-4 pt-3 pb-2">
              <div className="flex items-center justify-between gap-3">
                <h2 className="sf-ui-medium m-0 text-sf-text">Notifications</h2>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!unread}
                  onClick={() => markRead.mutate((data ?? []).filter((item) => !item.read).map((item) => item.id))}
                >
                  Mark all as read
                </Button>
              </div>
              <div role="group" aria-label="Show" className="mt-2 inline-flex gap-0.5 rounded-sf-md border border-sf-line p-0.5">
                {(
                  [
                    [false, 'All'],
                    [true, `Unread${unread ? ` (${unread})` : ''}`],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={String(value)}
                    type="button"
                    aria-pressed={unreadOnly === value}
                    onClick={() => setUnreadOnly(value)}
                    className={clsx(
                      'sf-focus sf-meta cursor-pointer rounded-sf-sm px-2 py-1',
                      unreadOnly === value ? 'bg-sf-surface-hover font-medium text-sf-text' : 'text-sf-text-muted hover:text-sf-text',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {!data && mentionsError ? (
                <div className="flex flex-col items-center gap-3 p-4 text-center" role="alert">
                  <p className="sf-small m-0 text-sf-text-secondary">Notifications didn’t load.</p>
                  <Button onClick={() => void mentions.refetch()} disabled={mentions.isFetching}>
                    {mentions.isFetching ? 'Trying…' : 'Try again'}
                  </Button>
                </div>
              ) : !data ? (
                <div className="flex flex-col gap-3 p-4" aria-busy="true">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-12 animate-pulse rounded-sf-md bg-sf-surface-hover" />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <p className="sf-small m-0 px-4 py-8 text-center text-sf-text-muted">{unreadOnly ? 'You’re all caught up.' : 'Nothing new.'}</p>
              ) : (
                <ul className="m-0 list-none divide-y divide-sf-line p-0">
                  {items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          close()
                          pick(item)
                        }}
                        className={clsx('sf-focus flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-start hover:bg-sf-surface-hover', !item.read && 'bg-sf-surface-mention')}
                      >
                        <span aria-hidden className="mt-0.5 grid size-8 flex-none place-items-center rounded-sf-full bg-sf-surface-mention text-sf-accent">
                          <Icon icon={SOURCE_ICONS[item.source]} size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={clsx('sf-small truncate', item.read ? 'text-sf-text-secondary' : 'font-semibold text-sf-text')}>{notificationLine(item)}</span>
                            <span className={clsx('sf-meta flex-none', item.read ? 'text-sf-text-muted' : 'text-sf-text-secondary')}>{timeAgo(item.createdAt)}</span>
                          </span>
                          {/* On the tinted unread row the muted grey falls under 4.5:1 (UX Phase 5B, 5.8). */}
                          <span className={clsx('sf-meta mt-0.5 line-clamp-2 block', item.read ? 'text-sf-text-muted' : 'text-sf-text-secondary')}>{item.excerpt}</span>
                        </span>
                        {/* The dot is seen; "Unread" is read (a label on a plain span isn't, UX Phase 5A, 5.12). */}
                        {!item.read && (
                          <>
                            <span className="mt-2 size-2 flex-none rounded-sf-full bg-sf-accent-fill" aria-hidden />
                            <span className="sr-only">Unread</span>
                          </>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {workspace && (
              <div className="flex-none border-t border-sf-line px-4 py-2 text-end">
                <Link to={paths.activity(workspace.slug)} onClick={close} className="sf-focus sf-small rounded-sf-sm font-medium text-sf-accent hover:underline">
                  See all
                </Link>
              </div>
            )}
          </div>
        )}
      </Popover>
    </div>
  )
}
