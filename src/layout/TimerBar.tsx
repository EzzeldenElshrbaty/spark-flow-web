import clsx from 'clsx'
import { Square } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useProjectSummaries } from '@/api/projects'
import { useTickets } from '@/api/tickets'
import { useMyDay, useStopTimer } from '@/api/time'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { elapsedMs, formatClock } from '@/lib/format'
import { withInspector } from '@/lib/inspector'
import { useNow } from '@/lib/useNow'

/** The running entry, labelled by its task (or project), with a live clock; null while nothing runs. */
function useRunning() {
  const { workspace } = useCurrentWorkspace()
  const running = useMyDay().data?.running ?? null
  const tasks = useTickets(running?.projectId)
  const projects = useProjectSummaries(workspace?.id)
  const task = running?.taskId ? tasks.data?.find((t) => t.id === running.taskId) : undefined
  const project = projects.data?.find((p) => p.id === running?.projectId)
  return running ? { running, task, label: task ? task.title : (project?.name ?? '—') } : null
}

function Dot() {
  return <span className="size-2 shrink-0 rounded-full bg-brand-500 motion-safe:animate-pulse" aria-hidden />
}

function StopButton({ className }: { className?: string }) {
  const stop = useStopTimer()
  return (
    <button
      type="button"
      onClick={() => stop.mutate()}
      disabled={stop.isPending}
      title={stop.error ? (stop.error as Error).message : undefined}
      className={clsx('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium hover:bg-surface-muted disabled:opacity-60', className)}
    >
      <Square className="size-3 fill-current" /> {stop.isPending ? 'Stopping…' : 'Stop'}
    </button>
  )
}

/** Desktop: the running timer as a pill in the top bar; the label opens the task. */
export function TimerPill() {
  const current = useRunning()
  const now = useNow(current ? 1000 : 0)
  const [params] = useSearchParams()
  if (!current) return null
  const { running, task, label } = current
  const clock = formatClock(elapsedMs(running.startedAt, now))
  const content = (
    <>
      <Dot />
      {task && <bdi dir="ltr" className="font-mono text-xs">{task.key}</bdi>}
      <span className="max-w-48 truncate">{label}</span>
      <span className="tabular-nums">{clock}</span>
    </>
  )
  return (
    <div className="hidden h-9 items-center gap-1 rounded-full bg-accent-soft ps-3 pe-1 text-sm text-accent lg:flex" role="status" aria-label={`Timer running: ${label}, ${clock}`}>
      {task ? (
        <Link to={{ search: withInspector(params, { kind: 'ticket', key: task.key }).toString() }} className="flex min-w-0 items-center gap-2 hover:underline">
          {content}
        </Link>
      ) : (
        <span className="flex min-w-0 items-center gap-2">{content}</span>
      )}
      <StopButton className="text-accent" />
    </div>
  )
}

/**
 * Phones: a slim bar right above the bottom navigation. While it shows it sets `--timer-bar`, which the page padding
 * and the record action bar add, so nothing hides behind it.
 */
export function PhoneTimerBar() {
  const current = useRunning()
  const now = useNow(current ? 1000 : 0)
  const showing = Boolean(current)
  useEffect(() => {
    if (!showing) return
    document.documentElement.style.setProperty('--timer-bar', '2.75rem')
    return () => {
      document.documentElement.style.removeProperty('--timer-bar')
    }
  }, [showing])
  if (!current) return null
  const { running, task, label } = current
  return (
    <div
      className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 flex h-11 items-center gap-2 border-t border-line bg-surface/95 px-4 text-sm backdrop-blur lg:hidden"
      role="status"
    >
      <Dot />
      {task && <bdi dir="ltr" className="font-mono text-xs text-fg-muted">{task.key}</bdi>}
      <span className="min-w-0 flex-1 truncate text-fg">{label}</span>
      <span className="tabular-nums text-accent">{formatClock(elapsedMs(running.startedAt, now))}</span>
      <StopButton className="text-fg-secondary" />
    </div>
  )
}
