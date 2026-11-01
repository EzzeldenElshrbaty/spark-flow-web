import { useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/sf/Button'
import { Modal } from '@/components/sf/Modal'
import { mentionsOf, type Body } from '@/lib/messageBody'

/** Above this many members, @channel and @here ask before they notify (spec 6.8). */
export const GROUP_CONFIRM_ABOVE = 25

/**
 * Before a message with @channel or @here goes to a channel of more than 25 members, asks whether to notify them
 * (spec 6.8). `confirm` resolves to send, or rejects so the composer keeps the message; `dialog` is the question.
 */
export function useGroupConfirm(where: string, members: number): { confirm: (body: Body) => Promise<void>; dialog: ReactNode } {
  const [asking, setAsking] = useState<'all' | 'here' | null>(null)
  const answer = useRef<{ resolve: () => void; reject: (reason: Error) => void } | null>(null)
  const confirm = (body: Body) => {
    const kinds = mentionsOf(body).map((m) => m.kind)
    const group = kinds.includes('all') ? 'all' : kinds.includes('here') ? 'here' : null
    if (!group || members <= GROUP_CONFIRM_ABOVE) return Promise.resolve()
    setAsking(group)
    return new Promise<void>((resolve, reject) => {
      answer.current = { resolve, reject }
    })
  }
  const close = (send: boolean) => {
    setAsking(null)
    if (send) answer.current?.resolve()
    else answer.current?.reject(new Error('Not sent'))
    answer.current = null
  }
  const dialog = (
    <Modal
      open={asking !== null}
      onClose={() => close(false)}
      title={`Notify everyone in ${where}?`}
      description={
        asking === 'here'
          ? `@here notifies whoever is active of the ${members} people in this channel.`
          : `@channel notifies all ${members} people in this channel.`
      }
      footer={
        <>
          <Button onClick={() => close(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => close(true)}>
            Send and notify
          </Button>
        </>
      }
    />
  )
  return { confirm, dialog }
}
