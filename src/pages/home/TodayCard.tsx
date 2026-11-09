import { Clock, Play } from 'lucide-react'
import { useState } from 'react'
import type { MyDay } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { formatClock, formatHours, formatTime } from '@/lib/format'
import { entryHours } from '@/lib/hours'
import { useNow } from '@/lib/useNow'
import { StartTimerDialog } from '@/layout/StartTimerDialog'
import { TimerControls, timerClock } from '@/layout/TimerBar'
import { AddedBy } from '@/pages/time/AddedBy'
import { AddTimeSheet } from '@/pages/time/AddTimeSheet'
import { useLogTargets } from '@/pages/time/useLogTargets'
import { EntryRowExtras } from '@/pages/time/EntryRowExtras'
import { daySummary } from './myDay'

type Label = (taskId: string | null, projectId: string) => string

/** My timer with its live clock and buttons, or Start timer, which opens the same dialog as the top bar's. */
function TimerRow({ day, label }: { day: MyDay; label: Label }) {
  const now = useNow(day.timer?.state === 'running' ? 1000 : 0)
  const [starting, setStarting] = useState(false)
  const { projects, loaded } = useLogTargets('')
  if (day.timer) {
    const { timer } = day
    const clock = timerClock(timer, now)
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-accent-soft px-4 py-3">
        <span className={timer.state === 'running' ? 'size-2 shrink-0 rounded-full bg-brand-500 motion-safe:animate-pulse' : 'size-2 shrink-0 rounded-full bg-fg-muted'} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-fg">{label('taskId' in timer.target ? timer.target.taskId : null, timer.projectId)}</span>
          {/* fg-secondary: fg-muted is too faint on the accent tint. */}
          {clock.capped && <span className="block text-xs text-fg-secondary">12 h limit reached · Stop it to log the 12 hours.</span>}
          {timer.state === 'paused' && <span className="block text-xs text-fg-secondary">Paused</span>}
        </span>
        <span role="timer" className="text-lg font-semibold tabular-nums text-accent">{formatClock(clock.ms)}</span>
        <TimerControls timer={timer} layout="card" />
      </div>
    )
  }
  // Someone with no project to log on can't start one (UX Phase 4, 4.10).
  if (loaded && projects.length === 0) return <p className="text-sm text-fg-muted">You aren’t on a project you can log time on yet.</p>
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-fg-muted">No timer running · Start one to begin your day.</p>
      <Button onClick={() => setStarting(true)}>
        <Play className="size-4" /> Start timer
      </Button>
      {starting && <StartTimerDialog open onClose={() => setStarting(false)} />}
    </div>
  )
}

function Entries({ day, label }: { day: MyDay; label: Label }) {
  const now = useNow(day.timer ? 60_000 : 0)
  if (day.entries.length === 0) return <p className="text-sm text-fg-muted">No time logged today yet.</p>
  return (
    <ul className="divide-y divide-line-subtle">
      {day.entries.map((e) => (
        <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-fg">{label(e.taskId, e.projectId)}</span>
            {(e.note.trim() || e.addedBy) && (
              <span className="block truncate text-xs text-fg-muted">
                {e.note.trim()}
                {e.note.trim() && e.addedBy && ' · '}
                {e.addedBy && <AddedBy userId={e.addedBy} />}
              </span>
            )}
          </span>
          <span className="shrink-0 tabular-nums text-fg-muted">
            {formatTime(e.startedAt)} – {e.endedAt ? formatTime(e.endedAt) : 'now'}
          </span>
          <span className="w-12 shrink-0 text-end tabular-nums text-fg">{formatHours(entryHours(e, now))}</span>
          <EntryRowExtras entry={e} />
        </li>
      ))}
    </ul>
  )
}

/**
 * Home's Today card (timer slice 3): my timer and its buttons, or Start timer, then today's entries and their hours,
 * with Add time. Starting a timer is the whole start of the day: there's no check-in, plan or check-out.
 */
export function TodayCard({ day, label }: { day: MyDay; label: Label }) {
  const [adding, setAdding] = useState(false)
  const now = useNow(day.timer ? 60_000 : 0)
  const summary = daySummary(day.entries, now)
  return (
    <Card>
      <CardHeader
        title={`Today · ${formatHours(summary.hours)}`}
        action={
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-strong">
            <Clock className="size-4" /> Add time
          </button>
        }
      />
      <div className="space-y-4 p-5">
        <TimerRow day={day} label={label} />
        <Entries day={day} label={label} />
      </div>
      {adding && <AddTimeSheet onClose={() => setAdding(false)} />}
    </Card>
  )
}
