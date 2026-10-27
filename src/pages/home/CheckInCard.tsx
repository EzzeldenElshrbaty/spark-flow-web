import { Clock, LogOut, Play, Square } from 'lucide-react'
import { useState } from 'react'
import { useCheckIn, useCheckOut, useStartTimer, useStopTimer, useUndoCheckOut } from '@/api/time'
import type { MyDay, TaskView } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Field, inputClass, selectClass } from '@/components/ui/Field'
import { elapsedMs, formatClock, formatDate, formatHours, formatTime } from '@/lib/format'
import { entryHours } from '@/lib/hours'
import { useNow } from '@/lib/useNow'
import { AddTimeSheet } from '@/pages/time/AddTimeSheet'
import { EntryRowExtras } from '@/pages/time/EntryRowExtras'
import { daySummary } from './myDay'

const errorText = (e: unknown) => (e ? <p className="text-sm text-red-600 dark:text-red-400">{(e as Error).message}</p> : null)

function TaskSelect({ tasks, value, onChange, label, empty }: { tasks: TaskView[]; value: string; onChange: (id: string) => void; label: string; empty: string }) {
  return (
    <Field label={label}>
      <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{empty}</option>
        {tasks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.key} · {t.title}
          </option>
        ))}
      </select>
    </Field>
  )
}

/** Not checked in yet: today's plan and, if you like, the task to start on. */
function CheckInForm({ tasks }: { tasks: TaskView[] }) {
  const checkIn = useCheckIn()
  const [plan, setPlan] = useState('')
  const [taskId, setTaskId] = useState('')
  return (
    <form
      className="space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault()
        checkIn.mutate({ plan, target: taskId ? { taskId } : undefined })
      }}
    >
      <Field label="Plan" required>
        <textarea className={inputClass} rows={3} placeholder="What will you work on today?" value={plan} onChange={(e) => setPlan(e.target.value)} />
      </Field>
      <TaskSelect tasks={tasks} value={taskId} onChange={setTaskId} label="Start the timer on" empty="Pick later" />
      {errorText(checkIn.error)}
      <div className="flex justify-end">
        <Button type="submit" disabled={checkIn.isPending}>
          {checkIn.isPending ? 'Checking in…' : 'Check in'}
        </Button>
      </div>
    </form>
  )
}

/** The running timer with its live clock, or a way to start one. */
function TimerRow({ day, tasks, label }: { day: MyDay; tasks: TaskView[]; label: (taskId: string | null, projectId: string) => string }) {
  const start = useStartTimer()
  const stop = useStopTimer()
  const now = useNow(day.running ? 1000 : 0)
  const [taskId, setTaskId] = useState('')
  if (day.running) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-accent-soft px-4 py-3">
        <span className="size-2 shrink-0 rounded-full bg-brand-500 motion-safe:animate-pulse" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm text-fg">{label(day.running.taskId, day.running.projectId)}</span>
        <span className="text-lg font-semibold tabular-nums text-accent">{formatClock(elapsedMs(day.running.startedAt, now))}</span>
        <Button variant="secondary" onClick={() => stop.mutate()} disabled={stop.isPending}>
          <Square className="size-3.5 fill-current" /> {stop.isPending ? 'Stopping…' : 'Stop'}
        </Button>
        {errorText(stop.error)}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-fg-muted">No timer running · Start one on a task.</p>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <TaskSelect tasks={tasks} value={taskId} onChange={setTaskId} label="Task" empty="Choose…" />
        </div>
        <Button variant="secondary" disabled={!taskId || start.isPending} onClick={() => start.mutate({ taskId })}>
          <Play className="size-4" /> {start.isPending ? 'Starting…' : 'Start timer'}
        </Button>
      </div>
      {errorText(start.error)}
    </div>
  )
}

function Entries({ day, label }: { day: MyDay; label: (taskId: string | null, projectId: string) => string }) {
  const now = useNow(day.running ? 60_000 : 0)
  if (day.entries.length === 0) return <p className="text-sm text-fg-muted">No time logged today yet.</p>
  return (
    <ul className="divide-y divide-line-subtle">
      {day.entries.map((e) => (
        <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate text-fg">{label(e.taskId, e.projectId)}</span>
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
 * Home's check-in card: check in with a plan; then the running timer, today's entries, Add time and Check out; after
 * check-out, the day's summary. A check-in still open from an earlier day (forgot to check out) can be closed here.
 */
export function CheckInCard({ day, tasks, label }: { day: MyDay; tasks: TaskView[]; label: (taskId: string | null, projectId: string) => string }) {
  const checkOut = useCheckOut()
  const undo = useUndoCheckOut()
  const [adding, setAdding] = useState(false)
  const now = useNow(day.running ? 60_000 : 0)
  const summary = daySummary(day.entries, now)
  const { checkIn } = day

  if (!checkIn) {
    return (
      <Card>
        <CardHeader title="Check in" />
        {day.openCheckIn && (
          <div className="flex items-center gap-3 border-b border-line-subtle bg-amber-50 px-5 py-3 text-sm text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            <span className="min-w-0 flex-1">You're still checked in from {formatDate(day.openCheckIn.checkedInAt)}.</span>
            <Button variant="secondary" onClick={() => checkOut.mutate()} disabled={checkOut.isPending}>
              {checkOut.isPending ? 'Checking out…' : 'Check out'}
            </Button>
          </div>
        )}
        {day.running && (
          <div className="border-b border-line-subtle px-5 py-4">
            <TimerRow day={day} tasks={tasks} label={label} />
          </div>
        )}
        <CheckInForm tasks={tasks} />
      </Card>
    )
  }

  const out = checkIn.checkedOutAt
  return (
    <Card>
      <CardHeader
        title={out ? `Checked out at ${formatTime(out)} · ${formatHours(summary.hours)} today` : `Checked in at ${formatTime(checkIn.checkedInAt)} · ${formatHours(summary.hours)} today`}
        action={
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-strong">
            <Clock className="size-4" /> Add time
          </button>
        }
      />
      <div className="space-y-4 p-5">
        <p className="whitespace-pre-line text-sm text-fg-secondary">{checkIn.plan}</p>
        {/* After check-out a timer can still be started from a task; it shows here so it can be stopped. */}
        {(!out || day.running) && <TimerRow day={day} tasks={tasks} label={label} />}
        <Entries day={day} label={label} />
        {!out && (
          <div className="flex items-center justify-end gap-2 border-t border-line-subtle pt-4">
            {errorText(checkOut.error)}
            <Button variant="secondary" onClick={() => checkOut.mutate()} disabled={checkOut.isPending}>
              <LogOut className="size-4 rtl:-scale-x-100" /> {checkOut.isPending ? 'Checking out…' : 'Check out'}
            </Button>
          </div>
        )}
        {/* Checked out by mistake: the same day, it can be taken back. */}
        {out && (
          <div className="flex items-center justify-end gap-2 border-t border-line-subtle pt-4">
            {errorText(undo.error)}
            <Button variant="secondary" onClick={() => undo.mutate()} disabled={undo.isPending}>
              {undo.isPending ? 'Undoing…' : 'Undo check-out'}
            </Button>
          </div>
        )}
      </div>
      {adding && <AddTimeSheet onClose={() => setAdding(false)} />}
    </Card>
  )
}
