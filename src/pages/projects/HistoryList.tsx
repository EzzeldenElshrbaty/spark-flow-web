import { Link, useSearchParams } from 'react-router'
import type { ActivityEntry, Phase, Project, User } from '@/api/types'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/ui/Button'
import { changeLines, describeActivity, type ActivityContext } from '@/lib/activityText'
import { columnOf } from '@/lib/boardColumns'
import { formatWhen, timeAgo } from '@/lib/format'
import { withInspector } from '@/lib/inspector'
import { dayGroups } from './historyFilter'

/**
 * History lines, newest first: who, what, when. In a project's feed, each task's key opens the task beside the page.
 * "Load older" when there are more.
 */
export function HistoryList({
  entries,
  users,
  project,
  phases,
  withKey,
  onLoadMore,
  loadingMore,
  emptyText = 'Nothing has happened here yet.',
}: {
  entries: ActivityEntry[]
  users: User[]
  project: Pick<Project, 'board'> | undefined
  phases: Phase[]
  withKey: boolean
  onLoadMore?: () => void
  loadingMore?: boolean
  emptyText?: string
}) {
  const [params] = useSearchParams()
  const ctx: ActivityContext = {
    nameOf: (id) => users.find((u) => u.id === id)?.name ?? 'Someone',
    columnLabel: (id) => (project ? columnOf(project, id)?.label : undefined),
    phaseName: (id) => phases.find((p) => p.id === id)?.name,
    withKey,
  }
  return (
    <>
      {entries.length === 0 && <p className="text-sm text-fg-muted">{emptyText}</p>}
      {/* In days, newest first: Today, Yesterday, Wednesday 4 November (UX Phase 4, 4.10). */}
      <div className="space-y-5">
        {dayGroups(entries, new Date()).map(({ label, entries: group }) => (
          <section key={label} aria-label={label}>
            <h3 className="mb-2 text-xs font-medium text-fg-muted">{label}</h3>
          <ol className="space-y-3">
            {group.map((entry) => {
              const line = describeActivity(entry, ctx)
              const key = withKey && entry.taskKey && line.includes(entry.taskKey) ? entry.taskKey : null
              const [before, after] = key ? [line.slice(0, line.indexOf(key)), line.slice(line.indexOf(key) + key.length)] : [line, '']
              return (
                <li key={entry.id} className="flex gap-3">
                  <Avatar name={ctx.nameOf(entry.actorId)} size={24} decorative />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="text-fg-secondary">
                      {before}
                      {key && (
                        <Link to={{ search: withInspector(params, { kind: 'ticket', key }).toString() }} className="font-medium text-accent hover:underline max-md:touch-target">
                          <bdi dir="ltr">{key}</bdi>
                        </Link>
                      )}
                      {after}
                      <span className="text-xs text-fg-muted" title={formatWhen(entry.at)}>
                        {' '}
                        · {timeAgo(entry.at)}
                      </span>
                    </p>
                    {changeLines(entry, ctx).map((detail) => (
                      <p key={detail} className="mt-0.5 text-xs text-fg-muted">
                        {detail}
                      </p>
                    ))}
                  </div>
                </li>
              )
            })}
          </ol>
          </section>
        ))}
      </div>
      {onLoadMore && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load older'}
          </Button>
        </div>
      )}
    </>
  )
}
