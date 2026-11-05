import { useState } from 'react'
import { useTimerSetting } from '@/api/attendance'
import { useResumeTimer } from '@/api/time'
import { Button } from '@/components/sf/Button'
import { Modal } from '@/components/sf/Modal'
import { useMyTimer } from '@/layout/useMyTimer'

/** The timer entries this tab was asked about and answered Keep paused, so it doesn't ask again (timer slice 2). */
const SEEN = 'spark-flow.timeoutSeen'
const seen = (): string[] => {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(SEEN) ?? '[]')
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return [] // storage blocked: ask again next time
  }
}

/**
 * Still working? (timer slice 2): once the timeout paused my timer, Continue resumes it (the time in between isn't
 * counted) and Keep paused leaves it, without asking again in this tab about that pause.
 */
export function StillWorkingDialog() {
  const current = useMyTimer()
  const hours = useTimerSetting().data?.timeoutHours
  const resume = useResumeTimer()
  const [dismissed, setDismissed] = useState(seen)
  const timer = current?.timer
  if (!current || !timer || timer.state !== 'paused' || timer.pausedBy !== 'timeout' || dismissed.includes(timer.entryId)) return null
  const what = current.task ? `${current.task.key} ${current.task.title}` : current.label
  const keep = () => {
    const next = [...dismissed, timer.entryId]
    try {
      sessionStorage.setItem(SEEN, JSON.stringify(next))
    } catch {
      // Storage blocked: it stays closed until the page reloads.
    }
    setDismissed(next)
  }
  return (
    <Modal
      open
      onClose={keep}
      title="Still working?"
      footer={
        <>
          <Button onClick={keep}>Keep paused</Button>
          <Button variant="primary" onClick={() => resume.mutate()} disabled={resume.isPending}>
            {resume.isPending ? 'Resuming…' : 'Continue'}
          </Button>
        </>
      }
    >
      <p className="sf-ui m-0 text-sf-text">
        Your timer paused after {hours ?? '…'} h on {what}.
      </p>
      {resume.error && (
        <p role="alert" className="sf-small mt-3 mb-0 text-sf-error">
          {resume.error.message}
        </p>
      )}
    </Modal>
  )
}
