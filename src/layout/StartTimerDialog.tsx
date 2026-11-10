import { useId, useState } from 'react'
import { useTasksOf } from '@/api/tickets'
import { useMyDay, useStartTimer } from '@/api/time'
import { useMe } from '@/api/users'
import { Button } from '@/components/sf/Button'
import { Modal } from '@/components/sf/Modal'
import { useUiStore } from '@/lib/uiStore'
import { useLogTargets } from '@/pages/time/useLogTargets'
import { TaskPicker } from './TaskPicker'
import { timerTargets, type TimerTarget } from './timerTargets'
import { useCurrentWorkspace } from './useCurrentWorkspace'

const field = 'sf-ui h-sf-input w-full min-w-0 rounded-sf-md border border-sf-line-strong bg-sf-surface px-3 text-sf-text outline-none focus:border-sf-focus focus:shadow-[0_0_0_3px_var(--surface-mention)] disabled:opacity-60 max-md:h-11'
const label = 'sf-small mb-1 block font-medium text-sf-text'
const link = 'sf-small mt-3 cursor-pointer border-0 bg-transparent p-0 font-medium text-sf-accent hover:underline'

/**
 * Start timer (timer slice 1; UX Phase 4, 4.3): find a task — my open ones first, then recent ones, or search every
 * open task on a project I may log on — and picking it starts the timer there; "Log on the project only" picks a
 * project instead. Switch task is the same dialog. Until my first start it says what starting records and who sees it,
 * and Start confirms the pick.
 */
export function StartTimerDialog({ open, onClose, title = 'Start timer' }: { open: boolean; onClose: () => void; title?: string }) {
  const ids = useId()
  const [query, setQuery] = useState('')
  const [projectOnly, setProjectOnly] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [chosen, setChosen] = useState<TimerTarget | null>(null)
  // Start pressed with nothing to start: it says what's missing under the picker (UX Phase 6, the form rule of Phase 4).
  const [tried, setTried] = useState(false)
  const { workspace } = useCurrentWorkspace()
  const { projects, loaded } = useLogTargets('')
  const tasks = useTasksOf(projects.map((p) => p.id)).data
  const me = useMe().data
  const firstStart = useMyDay().data?.firstStart ?? false
  const start = useStartTimer()
  const recentKey = `${me?.id ?? ''}:${workspace?.id ?? ''}`
  const recent = useUiStore((state) => state.recentTimers[recentKey]) ?? []
  const noteRecent = useUiStore((state) => state.noteRecentTimer)
  const groups = timerTargets({ meId: me?.id ?? '', tasks, projects, recent, q: query })
  const none = loaded && projects.length === 0

  // One start at a time: finding where I am can take seconds, and a second pick would start a second timer (final review).
  const go = (target: TimerTarget) =>
    !start.isPending &&
    start.mutate(target.kind === 'task' ? { taskId: target.id } : { projectId: target.id }, {
      onSuccess: () => {
        noteRecent(recentKey, `${target.kind}:${target.id}`)
        onClose()
      },
    })
  // Before my first start, a pick waits for Start, under the notice.
  const pick = (target: TimerTarget) => {
    if (start.isPending) return
    if (firstStart) setChosen(target)
    else go(target)
  }
  const project = projects.find((p) => p.id === projectId)
  const ready: TimerTarget | null = projectOnly ? (project ? { kind: 'project', id: project.id, projectId: project.id, label: project.name, detail: 'The project only' } : null) : chosen
  const startNow = () => (ready ? go(ready) : setTried(true))
  const missing = tried && !ready
  const switchTo = (only: boolean) => {
    setProjectOnly(only)
    setTried(false)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {!none && (projectOnly || firstStart) && (
            <Button variant="primary" disabled={start.isPending} onClick={startNow}>
              {start.isPending ? 'Starting…' : 'Start timer'}
            </Button>
          )}
        </>
      }
    >
      {none ? (
        <p className="sf-ui m-0 text-sf-text-secondary">You aren’t on any projects you can log time on.</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!start.isPending) startNow()
          }}
        >
          {projectOnly ? (
            <>
              <label htmlFor={`${ids}-project`} className={label}>
                Project
              </label>
              <select
                id={`${ids}-project`}
                className={field}
                value={projectId}
                aria-invalid={missing || undefined}
                aria-describedby={missing ? `${ids}-missing` : undefined}
                onChange={(event) => setProjectId(event.target.value)}
              >
                <option value="">Choose…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {missing && (
                <p id={`${ids}-missing`} className="sf-small mt-1 mb-0 text-sf-error">
                  Pick a project.
                </p>
              )}
              <button type="button" className={link} onClick={() => switchTo(false)}>
                Find a task instead
              </button>
            </>
          ) : (
            <>
              <TaskPicker groups={groups} query={query} onQuery={setQuery} onPick={pick} chosen={chosen} busy={start.isPending} />
              {missing && <p className="sf-small mt-1 mb-0 text-sf-error">Pick a task.</p>}
              <button type="button" className={link} onClick={() => switchTo(true)}>
                Log on the project only
              </button>
            </>
          )}
          {firstStart && (
            <p className="sf-small mt-4 mb-0 text-sf-text-secondary">
              Starting a timer records the time, this device’s IP address and browser, and your location if you allow it. You, the managers of your projects and Admins can see them in Attendance.
            </p>
          )}
          {/* A pick has no Start button to say so: the dialog does, while the timer starts. */}
          {start.isPending && !projectOnly && !firstStart && (
            <p role="status" className="sf-small mt-3 mb-0 text-sf-text-secondary">
              Starting…
            </p>
          )}
          {start.error && (
            <p role="alert" className="sf-small mt-3 mb-0 text-sf-error">
              {start.error.message}
            </p>
          )}
        </form>
      )}
    </Modal>
  )
}
