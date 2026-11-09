import { ApiError } from '@/lib/apiError'
import type { Attachment } from '@/api/types'
import type { Body } from '@/lib/messageBody'

/** A message I sent that the server hasn't confirmed yet (spec 6.2 optimistic send). */
export type PendingMessage = {
  /** Made up here; the server stores one message per (sender, clientId), so a resend is never a second message. */
  clientId: string
  channelId: string
  content: string
  body: Body
  createdAt: string
  /** queued: waiting its turn or for the connection; sending: on its way; failed: the server refused it. */
  status: 'queued' | 'sending' | 'failed'
  /** Why it failed, as the server said. */
  error?: string
  /** Files already uploaded for it (spec 6.9), sent with it; `attachments` shows them on the pending row. */
  fileIds?: string[]
  attachments?: Attachment[]
}

/** A send that didn't reach the server (as opposed to one it refused). */
const unreachable = (error: unknown) => error instanceof ApiError && error.status === 0

/** After a send that didn't reach the server, the queue waits this long before trying again, doubling up to the cap. */
const RETRY_FIRST_MS = 1000
const RETRY_MAX_MS = 30_000

/**
 * The messages on their way (spec 6.2): each shows at once and is sent in order, one at a time per channel. While
 * offline they wait and go when the connection is back (`wake`); when the browser says online but the server can't be
 * reached, the queue pauses 1s, 2s, 4s… (up to 30s) between tries, and `wake` ends the pause. A send the server
 * refuses is marked failed, with Retry and Delete, and the rest still go. `onChange` hands the page the list after
 * every change.
 */
export function createSendQueue(deps: { send: (pending: PendingMessage) => Promise<unknown>; online: () => boolean; onChange: (items: PendingMessage[]) => void }) {
  let items: PendingMessage[] = []
  const busy = new Set<string>()
  let pause: ReturnType<typeof setTimeout> | null = null
  let wait = RETRY_FIRST_MS

  const set = (next: PendingMessage[]) => {
    items = next
    deps.onChange(items)
  }
  const patch = (clientId: string, change: Partial<PendingMessage>) => set(items.map((p) => (p.clientId === clientId ? { ...p, ...change } : p)))

  const resume = () => {
    if (pause) clearTimeout(pause)
    pause = null
    pump()
  }
  const pauseAfterUnreachable = () => {
    if (pause) return
    pause = setTimeout(resume, wait)
    wait = Math.min(wait * 2, RETRY_MAX_MS)
  }

  function pump() {
    if (pause || !deps.online()) return
    for (const channelId of new Set(items.map((p) => p.channelId))) {
      if (busy.has(channelId)) continue
      const next = items.find((p) => p.channelId === channelId && p.status === 'queued')
      if (!next) continue
      busy.add(channelId)
      patch(next.clientId, { status: 'sending', error: undefined })
      deps
        .send({ ...next, status: 'sending' })
        .then(
          () => {
            wait = RETRY_FIRST_MS
            set(items.filter((p) => p.clientId !== next.clientId))
          },
          (error: unknown) => {
            const offline = !deps.online()
            if (!offline && unreachable(error)) pauseAfterUnreachable()
            if (!items.some((p) => p.clientId === next.clientId)) return
            if (offline || unreachable(error)) patch(next.clientId, { status: 'queued' })
            else patch(next.clientId, { status: 'failed', error: error instanceof ApiError ? (error.detail ?? error.message) : "Couldn’t send it." })
          },
        )
        .finally(() => {
          busy.delete(channelId)
          pump()
        })
    }
  }

  return {
    enqueue(message: Omit<PendingMessage, 'status' | 'createdAt' | 'error'>) {
      set([...items, { ...message, status: 'queued', createdAt: new Date().toISOString() }])
      pump()
    },
    /** Retry, pressed: try now, even during a pause. */
    retry(clientId: string) {
      patch(clientId, { status: 'queued', error: undefined })
      resume()
    },
    discard(clientId: string) {
      set(items.filter((p) => p.clientId !== clientId))
    },
    /** The connection is back (or might be): send what's waiting, without sitting out a pause. */
    wake: resume,
    items: () => items,
  }
}
