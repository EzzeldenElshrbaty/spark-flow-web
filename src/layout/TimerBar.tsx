import { IconPlayerPlay } from '@tabler/icons-react'
import clsx from 'clsx'
import { ArrowLeftRight, Pause, Play, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useProjectSummaries } from '@/api/projects'
import { useTickets } from '@/api/tickets'
import { useMyDay, usePauseTimer, useResumeTimer, useStopTimer } from '@/api/time'
import type { MyTimer } from '@/api/types'
import { Button, IconButton } from '@/components/sf/Button'
import { StartTimerDialog } from '@/layout/StartTimerDialog'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { formatClock } from '@/lib/format'
import { runningClock } from '@/lib/hours'
import { withInspector } from '@/lib/inspector'
import { useNow } from '@/lib/useNow'

/** My timer (running, or paused today), labelled by its task (or project); null while there's none. */
function useTimer() {
  const { workspace } = useCurrentWorkspace()
  const timer = useMyDay().data?.timer ?? null
  const tasks = useTickets(timer?.projectId)
  const projects = useProjectSummaries(workspace?.id)
  const taskId = timer && 'taskId' in timer.target ? timer.target.taskId : null
  const task = taskId ? tasks.data?.find((t) => t.id === taskId) : undefined
  const project = projects.data?.find((p) => p.id === timer?.projectId)
  return timer ? { timer, task, label: task ? task.title : (project?.name ?? '—') } : null
}

/**
 * The run's count: its closed time, plus the running entry so far (held at 12 hours, where it stops counting). A
 * paused one stays where it stopped.
 */
export function timerClock(timer: MyTimer, now: Date): { ms: number; capped: boolean } {
  if (timer.state === 'paused' || !timer.startedAt) return { ms: timer.runMs, capped: false }
  const run = runningClock(timer.startedAt, now)
  return { ms: timer.runMs + run.ms, capped: run.capped }
}

function Dot({ running }: { running: boolean }) {
  return <span className={clsx('size-2 shrink-0 rounded-full', running ? 'bg-brand-500 motion-safe:animate-pulse' : 'bg-fg-muted')} aria-hidden />
}

/**
 * Pause and Stop while it runs; Resume, Stop and Switch task once paused (timer slice 1). A refusal is said beside
 * them (a tooltip never shows on phones). The phone bar keeps Switch task to its icon.
 */
export function TimerControls({ timer, layout }: { timer: MyTimer; layout: 'pill' | 'bar' | 'card' }) {
  const pause = usePauseTimer()
  const resume = useResumeTimer()
  const stop = useStopTimer()
  const [switching, setSwitching] = useState(false)
  const failed = [pause, resume, stop].find((m) => m.error)?.error as Error | undefined
  const button = clsx(
    'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium hover:bg-surface-muted disabled:opacity-60',
    // The pill sits in the sf top bar, so it takes the sf colours (the app's own accent-soft fails contrast there in dark).
    layout === 'pill' ? 'text-sf-accent hover:bg-sf-surface-hover' : 'text-fg-secondary',
  )
  return (
    <>
      {failed && <span className="min-w-0 truncate text-xs text-red-600 dark:text-red-400">{failed.message}</span>}
      {timer.state === 'running' ? (
        <button type="button" className={button} onClick={() => pause.mutate()} disabled={pause.isPending}>
          <Pause className="size-3 fill-current" aria-hidden /> {pause.isPending ? 'Pausing…' : 'Pause'}
        </button>
      ) : (
        <button type="button" className={button} onClick={() => resume.mutate()} disabled={resume.isPending}>
          <Play className="size-3 fill-current" aria-hidden /> {resume.isPending ? 'Resuming…' : 'Resume'}
        </button>
      )}
      <button type="button" className={button} onClick={() => stop.mutate()} disabled={stop.isPending}>
        <Square className="size-3 fill-current" aria-hidden /> {stop.isPending ? 'Stopping…' : 'Stop'}
      </button>
      {timer.state === 'paused' && (
        <button type="button" className={button} onClick={() => setSwitching(true)} aria-label={layout === 'bar' ? 'Switch task' : undefined}>
          <ArrowLeftRight className="size-3" aria-hidden />
          {layout !== 'bar' && ' Switch task'}
        </button>
      )}
      {switching && <StartTimerDialog open onClose={() => setSwitching(false)} title="Switch task" />}
    </>
  )
}

/** No timer: Start timer, as text from md up and a round icon button on phones; it opens the Start timer dialog. */
function StartTimerButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <span className="hidden md:block">
        <Button icon={IconPlayerPlay} onClick={() => setOpen(true)}>
          Start timer
        </Button>
      </span>
      <span className="md:hidden">
        <IconButton label="Start timer" icon={IconPlayerPlay} onClick={() => setOpen(true)} />
      </span>
      {open && <StartTimerDialog open onClose={() => setOpen(false)} />}
    </>
  )
}

/**
 * For screen readers, once for the whole app: says when a timer runs, pauses or stops, not every tick (the clocks
 * are role="timer", which isn't announced).
 */
export function TimerAnnouncer() {
  const current = useTimer()
  const what = current ? (current.task?.key ?? current.label) : null
  const text = current ? `Timer ${current.timer.state === 'running' ? 'running' : 'paused'} on ${what}` : null
  const [said, setSaid] = useState('')
  // "Timer stopped" only after something ran or was paused, not on a first load with no timer.
  useEffect(() => setSaid((was) => text ?? (was ? 'Timer stopped' : '')), [text])
  return (
    <span className="sr-only" aria-live="polite">
      {said}
    </span>
  )
}

/** Desktop: my timer as a pill in the top bar (the label opens the task), or Start timer when there's none. */
export function TimerPill() {
  const current = useTimer()
  const now = useNow(current?.timer.state === 'running' ? 1000 : 0)
  const [params] = useSearchParams()
  if (!current) return <StartTimerButton />
  const { timer, task, label } = current
  // A forgotten timer stops counting at 12 hours; the clock stops there too and says so.
  const { ms, capped } = timerClock(timer, now)
  const clock = capped ? `${formatClock(ms)} · 12 h limit reached` : formatClock(ms)
  const content = (
    <>
      <Dot running={timer.state === 'running'} />
      {task && <bdi dir="ltr" className="font-mono text-xs">{task.key}</bdi>}
      {/* The title only where the top bar has room for it beside the search box; the key and clock always show. */}
      <span className={clsx('max-w-48 truncate', task && 'hidden xl:inline')}>{label}</span>
      <span role="timer" className="tabular-nums">
        {clock}
      </span>
    </>
  )
  return (
    <div className="hidden h-9 items-center gap-1 rounded-full bg-sf-surface-mention ps-3 pe-1 text-sm text-sf-accent lg:flex" data-timer="pill">
      {task ? (
        <Link to={{ search: withInspector(params, { kind: 'ticket', key: task.key }).toString() }} className="flex min-w-0 items-center gap-2 hover:underline">
          {content}
        </Link>
      ) : (
        <span className="flex min-w-0 items-center gap-2">{content}</span>
      )}
      <TimerControls timer={timer} layout="pill" />
    </div>
  )
}

/**
 * Phones: a slim bar right above the bottom navigation while a timer runs or is paused. While it shows it sets
 * `--timer-bar`, which the page padding and the record action bar add, so nothing hides behind it.
 */
export function PhoneTimerBar() {
  const current = useTimer()
  const now = useNow(current?.timer.state === 'running' ? 1000 : 0)
  const showing = Boolean(current)
  useEffect(() => {
    if (!showing) return
    document.documentElement.style.setProperty('--timer-bar', '2.75rem')
    return () => {
      document.documentElement.style.removeProperty('--timer-bar')
    }
  }, [showing])
  if (!current) return null
  const { timer, task, label } = current
  const { ms, capped } = timerClock(timer, now)
  return (
    <section
      aria-label="Timer"
      className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 flex h-11 items-center gap-2 border-t border-line bg-surface/95 px-4 text-sm backdrop-blur lg:hidden"
      data-timer="bar"
    >
      <Dot running={timer.state === 'running'} />
      {task && <bdi dir="ltr" className="font-mono text-xs text-fg-muted">{task.key}</bdi>}
      <span className="min-w-0 flex-1 truncate text-fg">{label}</span>
      <span role="timer" className="tabular-nums text-accent">
        {capped ? '12 h limit reached' : formatClock(ms)}
      </span>
      <TimerControls timer={timer} layout="bar" />
    </section>
  )
}
