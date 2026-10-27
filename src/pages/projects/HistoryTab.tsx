import clsx from 'clsx'
import { useSearchParams } from 'react-router'
import { useProjectHistory } from '@/api/activity'
import type { Phase, ProjectSummary, User } from '@/api/types'
import { QueryError } from '@/components/ui/QueryError'
import { HistoryList } from '@/pages/projects/HistoryList'
import { historyFilter, type HistoryShow } from './historyFilter'

const chips: [HistoryShow, string][] = [
  ['all', 'All'],
  ['tasks', 'Tasks'],
  ['board', 'Board'],
  ['comments', 'Comments'],
]

/** A project's history, newest first: its tasks, comments, board and phases, 30 at a time. The chip is in ?show=. */
export function HistoryTab({ project, people, phases }: { project: ProjectSummary; people: User[]; phases: Phase[] }) {
  const [params, setParams] = useSearchParams()
  const asked = params.get('show')
  const show: HistoryShow = chips.some(([v]) => v === asked) ? (asked as HistoryShow) : 'all'
  const history = useProjectHistory(project.id)
  const entries = historyFilter(history.data?.pages.flatMap((p) => p.items) ?? [], show)
  const pick = (value: HistoryShow) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === 'all') next.delete('show')
        else next.set('show', value)
        return next
      },
      { replace: true },
    )
  const chip = (active: boolean) =>
    clsx('shrink-0 rounded-full border px-3 py-1.5 text-sm', active ? 'border-brand-500 bg-accent-soft font-medium text-fg' : 'border-line text-fg-secondary hover:bg-surface-muted')

  return (
    <div className="space-y-4">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Show">
        {chips.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={show === value} onClick={() => pick(value)} className={chip(show === value)}>
            {label}
          </button>
        ))}
      </div>
      {history.isError && !history.data ? (
        <QueryError what="History" onRetry={() => void history.refetch()} />
      ) : !history.data ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      ) : (
        <HistoryList
          entries={entries}
          users={people}
          project={project}
          phases={phases}
          withKey
          onLoadMore={history.hasNextPage ? () => void history.fetchNextPage() : undefined}
          loadingMore={history.isFetchingNextPage}
        />
      )}
    </div>
  )
}
