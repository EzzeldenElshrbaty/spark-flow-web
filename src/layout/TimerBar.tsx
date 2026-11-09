import { IconPlayerPlay } from '@tabler/icons-react'
import clsx from 'clsx'
import { ArrowLeftRight, Pause, Play, Square } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { usePauseTimer, useResumeTimer, useStopTimer } from '@/api/time'
import type { MyTimer } from '@/api/types'
import { Button, IconButton } from '@/components/sf/Button'
import { Button as CardButton } from '@/components/ui/Button'
import { StartTimerDialog } from '@/layout/StartTimerDialog'
import { useMyTimer } from '@/layout/useMyTimer'
import { formatClock } from '@/lib/format'
import { runningClock } from '@/lib/hours'
import { withInspector } from '@/lib/inspector'
import { useNow } from '@/lib/useNow'

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
  if (layout === 'card') return <CardControls timer={timer} pause={pause} resume={resume} stop={stop} failed={failed} switching={switching} setSwitching={setSwitching} />
  const button = clsx(
    'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium hover:bg-surface-muted disabled:opacity-60',
    // The pill sits in the sf top bar, so it takes the sf colours (the app's own accent-soft fails contrast there in dark).
    layout === 'pill' ? 'text-sf-accent hover:bg-sf-surface-hover' : 'text-fg-secondary',
  )
  // In the pill the words show from xl up; below that the top bar has room for icons only, named for screen readers.
  const words = layout === 'pill' ? 'hidden xl:inline' : undefined
  const control = (icon: ReactNode, text: string, onClick: () => void, disabled = false) => (
    <button type="button" className={button} onClick={onClick} disabled={disabled} aria-label={layout === 'pill' ? text : undefined} title={layout === 'pill' ? text : undefined}>
      {icon} <span className={words}>{text}</span>
    </button>
  )
  return (
    <>
      {failed && <span className="min-w-0 truncate text-xs text-red-600 dark:text-red-400">{failed.message}</span>}
      {timer.state === 'running'
        ? control(<Pause className="size-3 fill-current" aria-hidden />, pause.isPending ? 'Pausing…' : 'Pause', () => pause.mutate(), pause.isPending)
        : control(<Play className="size-3 fill-current" aria-hidden />, resume.isPending ? 'Resuming…' : 'Resume', () => resume.mutate(), resume.isPending)}
      {control(<Square className="size-3 fill-current" aria-hidden />, stop.isPending ? 'Stopping…' : 'Stop', () => stop.mutate(), stop.isPending)}
      {timer.state === 'paused' &&
        (layout === 'bar' ? (
          <button type="button" className={button} onClick={() => setSwitching(true)} aria-label="Switch task" title="Switch task">
            <ArrowLeftRight className="size-3" aria-hidden />
          </button>
        ) : (
          control(<ArrowLeftRight className="size-3" aria-hidden />, 'Switch task', () => setSwitching(true))
        ))}
      {switching && <StartTimerDialog open onClose={() => setSwitching(false)} title="Switch task" />}
    </>
  )
}

type Mutation = { mutate: () => void; isPending: boolean }

/** The same buttons in a card (Home, the task panel), as the page's own secondary buttons. */
function CardControls({ timer, pause, resume, stop, failed, switching, setSwitching }: { timer: MyTimer; pause: Mutation; resume: Mutation; stop: Mutation; failed?: Error; switching: boolean; setSwitching: (on: boolean) => void }) {
  return (
    <>
      {timer.state === 'running' ? (
        <CardButton variant="secondary" onClick={() => pause.mutate()} disabled={pause.isPending}>
          <Pause className="size-3.5 fill-current" aria-hidden /> {pause.isPending ? 'Pausing…' : 'Pause'}
        </CardButton>
      ) : (
        <CardButton variant="secondary" onClick={() => resume.mutate()} disabled={resume.isPending}>
          <Play className="size-3.5 fill-current" aria-hidden /> {resume.isPending ? 'Resuming…' : 'Resume'}
        </CardButton>
      )}
      <CardButton variant="secondary" onClick={() => stop.mutate()} disabled={stop.isPending}>
        <Square className="size-3.5 fill-current" aria-hidden /> {stop.isPending ? 'Stopping…' : 'Stop'}
      </CardButton>
      {timer.state === 'paused' && (
        <CardButton variant="ghost" onClick={() => setSwitching(true)}>
          <ArrowLeftRight className="size-4" aria-hidden /> Switch task
        </CardButton>
      )}
      {failed && <p className="w-full text-xs text-red-600 dark:text-red-400">{failed.message}</p>}
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
  const current = useMyTimer()
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
  const current = useMyTimer()
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
  const current = useMyTimer()
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
