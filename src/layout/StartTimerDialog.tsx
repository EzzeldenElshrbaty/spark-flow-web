import { useId, useState } from 'react'
import { useMyDay, useStartTimer } from '@/api/time'
import { useMe } from '@/api/users'
import { Button } from '@/components/sf/Button'
import { Modal } from '@/components/sf/Modal'
import { useLogTargets } from '@/pages/time/useLogTargets'

const field = 'sf-ui h-sf-input w-full min-w-0 rounded-sf-md border border-sf-line-strong bg-sf-surface px-3 text-sf-text outline-none focus:border-sf-focus focus:shadow-[0_0_0_3px_var(--surface-mention)] disabled:opacity-60 max-md:h-11'
const label = 'sf-small mb-1 block font-medium text-sf-text'

/**
 * Start timer (timer slice 1): a project I may log on, then one of its open tasks (mine first) or none, and the timer
 * starts there. Switch task is the same dialog. Until my first start it says what starting records and who sees it.
 */
export function StartTimerDialog({ open, onClose, title = 'Start timer' }: { open: boolean; onClose: () => void; title?: string }) {
  const ids = useId()
  const [projectId, setProjectId] = useState('')
  const [taskId, setTaskId] = useState('')
  const { projects, tasks, loaded } = useLogTargets(projectId)
  const me = useMe().data
  const firstStart = useMyDay().data?.firstStart ?? false
  const start = useStartTimer()
  const open_ = tasks.filter((t) => t.category !== 'done')
  const listed = [...open_.filter((t) => t.assigneeId === me?.id), ...open_.filter((t) => t.assigneeId !== me?.id)]
  const none = loaded && projects.length === 0

  const go = () => start.mutate(taskId ? { taskId } : { projectId }, { onSuccess: onClose })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {!none && (
            <Button variant="primary" disabled={!projectId || start.isPending} onClick={go}>
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
            if (projectId && !start.isPending) go()
          }}
        >
          <label htmlFor={`${ids}-project`} className={label}>
            Project
          </label>
          <select
            id={`${ids}-project`}
            className={field}
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value)
              setTaskId('')
            }}
          >
            <option value="">Choose…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label htmlFor={`${ids}-task`} className={`${label} mt-4`}>
            Task
          </label>
          <select id={`${ids}-task`} className={field} value={taskId} disabled={!projectId} onChange={(event) => setTaskId(event.target.value)}>
            <option value="">No task</option>
            {listed.map((t) => (
              <option key={t.id} value={t.id}>
                {t.key} · {t.title}
              </option>
            ))}
          </select>
          {firstStart && (
            <p className="sf-small mt-4 mb-0 text-sf-text-secondary">
              Starting a timer records the time, this device’s IP address and browser, and your location if you allow it. You, the managers of your projects and Admins can see them in Attendance.
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
