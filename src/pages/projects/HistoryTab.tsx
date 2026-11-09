import clsx from 'clsx'
import { useSearchParams } from 'react-router'
import { useProjectHistory } from '@/api/activity'
import type { Phase, ProjectSummary, User } from '@/api/types'
import { selectInlineClass } from '@/components/ui/Field'
import { QueryError } from '@/components/ui/QueryError'
import { HistoryList } from '@/pages/projects/HistoryList'
import { emptyNote, historyFilter, type HistoryShow } from './historyFilter'

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
  const loaded = history.data?.pages.flatMap((p) => p.items) ?? []
  // One person's entries (UX Phase 4, 4.10): whoever appears in what's loaded, by name.
  const who = params.get('who') ?? ''
  const nameOf = (id: string) => people.find((u) => u.id === id)?.name ?? 'Someone'
  const actors = [...new Set(loaded.map((e) => e.actorId))].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
  const entries = historyFilter(loaded, show, who)
  // A choice is a step Back undoes (UX Phase 2, 2.7).
  const setParam = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: false },
    )
  const pick = (value: HistoryShow) => setParam('show', value === 'all' ? '' : value)
  const chip = (active: boolean) =>
    clsx('shrink-0 rounded-full border px-3 py-1.5 text-sm', active ? 'border-brand-500 bg-accent-soft font-medium text-fg' : 'border-line text-fg-secondary hover:bg-surface-muted')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Show">
          {chips.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={show === value} onClick={() => pick(value)} className={chip(show === value)}>
              {label}
            </button>
          ))}
        </div>
        <select className={clsx(selectInlineClass, 'w-48 max-sm:w-full sm:ms-auto')} aria-label="Person" value={who} onChange={(e) => setParam('who', e.target.value)}>
          <option value="">Anyone</option>
          {actors.map((id) => (
            <option key={id} value={id}>
              {nameOf(id)}
            </option>
          ))}
        </select>
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
          emptyText={emptyNote(show, Boolean(history.hasNextPage))}
        />
      )}
    </div>
  )
}
