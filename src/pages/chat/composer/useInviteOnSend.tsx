import { useRef, useState, type ReactNode } from 'react'
import type { User } from '@/api/types'
import { Button } from '@/components/sf/Button'
import { Modal } from '@/components/sf/Modal'
import { mentionsOf, type Body } from '@/lib/messageBody'

/** "Nour", "Nour and Mariam", "Nour, Mariam and Hossam". */
const namesText = (names: string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

/**
 * Before a message goes out, asks about the people it mentions who aren't in the channel (spec 6.8, "Not in this
 * channel"): add them and send, or send without them. Without the right to add people it only says they won't see it.
 * `confirm` resolves to send (after adding, when chosen), or rejects so the composer keeps the message.
 */
export function useInviteOnSend({
  where,
  memberIds,
  people,
  mayAdd,
  add,
}: {
  where: string
  memberIds: string[]
  people: User[]
  mayAdd: boolean
  add: (userIds: string[]) => Promise<unknown>
}): { confirm: (body: Body) => Promise<void>; dialog: ReactNode } {
  const [outside, setOutside] = useState<User[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const answer = useRef<{ resolve: () => void; reject: (reason: Error) => void } | null>(null)

  const confirm = (body: Body) => {
    const ids = [...new Set(mentionsOf(body).filter((m) => m.kind === 'user').map((m) => m.id))].filter((id) => !memberIds.includes(id))
    const found = ids.map((id) => people.find((u) => u.id === id)).filter((u): u is User => u !== undefined)
    if (found.length === 0) return Promise.resolve()
    setError(null)
    setOutside(found)
    return new Promise<void>((resolve, reject) => {
      answer.current = { resolve, reject }
    })
  }
  const finish = (send: boolean) => {
    setOutside(null)
    if (send) answer.current?.resolve()
    else answer.current?.reject(new Error('Not sent'))
    answer.current = null
  }
  const addAndSend = async () => {
    if (!outside) return
    setAdding(true)
    setError(null)
    try {
      await add(outside.map((u) => u.id))
      finish(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAdding(false)
    }
  }

  const names = namesText((outside ?? []).map((u) => u.name))
  const one = outside?.length === 1
  const dialog = (
    <Modal
      open={outside !== null}
      onClose={() => finish(false)}
      title={mayAdd ? (one ? `Add ${names} to ${where}?` : `Add ${outside?.length ?? 0} people to ${where}?`) : `${names} won’t see this`}
      description={`${names} ${one ? 'isn’t' : 'aren’t'} in this channel, so they won’t see this message.${mayAdd ? '' : ' Only its members can add people.'}`}
      footer={
        mayAdd ? (
          <>
            <Button onClick={() => finish(true)} disabled={adding}>
              Leave them out
            </Button>
            <Button variant="primary" onClick={() => void addAndSend()} disabled={adding}>
              {adding ? 'Adding…' : 'Add and send'}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => finish(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => finish(true)}>
              Send anyway
            </Button>
          </>
        )
      }
    >
      {error && (
        <p role="alert" className="sf-small m-0 text-sf-error">
          {error}
        </p>
      )}
    </Modal>
  )
  return { confirm, dialog }
}
