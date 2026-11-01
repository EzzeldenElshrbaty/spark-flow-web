import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/apiError'
import { createSendQueue, type PendingMessage } from './sendQueue'

const flush = () => new Promise((r) => setTimeout(r, 0))
type Draft = Omit<PendingMessage, 'status' | 'createdAt' | 'error'>
const msg = (clientId: string, channelId = 'c1'): Draft => ({ clientId, channelId, content: clientId, body: [] })

function setup(online = true) {
  const state = { online }
  const sent: string[] = []
  const gates: Record<string, { resolve: () => void; reject: (e: unknown) => void }> = {}
  const send = vi.fn(
    (p: PendingMessage) =>
      new Promise<void>((resolve, reject) => {
        sent.push(p.clientId)
        gates[p.clientId] = { resolve, reject }
      }),
  )
  const changes: PendingMessage[][] = []
  const queue = createSendQueue({ send, online: () => state.online, onChange: (items) => changes.push(items) })
  const statuses = () => Object.fromEntries(queue.items().map((p) => [p.clientId, p.status]))
  return { queue, send, sent, gates, state, statuses, changes }
}

describe('send queue (spec 6.2: optimistic send, retry, offline queue)', () => {
  it('shows a message at once as sending, and drops it once the server has it', async () => {
    const { queue, gates, statuses } = setup()
    queue.enqueue(msg('a'))
    expect(statuses()).toEqual({ a: 'sending' })
    gates.a.resolve()
    await flush()
    expect(queue.items()).toEqual([])
  })

  it('sends one channel’s messages in order, one at a time; other channels go alongside', async () => {
    const { queue, gates, sent, statuses } = setup()
    queue.enqueue(msg('a'))
    queue.enqueue(msg('b'))
    queue.enqueue(msg('x', 'c2'))
    expect(sent).toEqual(['a', 'x'])
    expect(statuses()).toEqual({ a: 'sending', b: 'queued', x: 'sending' })
    gates.a.resolve()
    await flush()
    expect(sent).toEqual(['a', 'x', 'b'])
  })

  it('while offline it waits, in order, and sends when the connection is back', async () => {
    const { queue, sent, state, statuses, gates } = setup(false)
    queue.enqueue(msg('a'))
    queue.enqueue(msg('b'))
    expect(sent).toEqual([])
    expect(statuses()).toEqual({ a: 'queued', b: 'queued' })
    state.online = true
    queue.wake()
    expect(sent).toEqual(['a'])
    gates.a.resolve()
    await flush()
    expect(sent).toEqual(['a', 'b'])
  })

  it('a send cut off by losing the connection waits for it, not marked failed', async () => {
    const { queue, gates, state, statuses, sent } = setup()
    queue.enqueue(msg('a'))
    state.online = false
    gates.a.reject(new ApiError({ title: "Couldn't reach the server", status: 0 }))
    await flush()
    expect(statuses()).toEqual({ a: 'queued' })
    state.online = true
    queue.wake()
    expect(sent).toEqual(['a', 'a'])
  })

  it('an unreachable server while the browser says online is tried again after a growing wait, not at once', async () => {
    vi.useFakeTimers()
    try {
      const unreachable = new ApiError({ title: "Couldn't reach the server", status: 0 })
      const { queue, gates, sent, statuses } = setup()
      queue.enqueue(msg('a'))
      gates.a.reject(unreachable)
      await vi.advanceTimersByTimeAsync(0)
      expect(statuses()).toEqual({ a: 'queued' })
      expect(sent).toEqual(['a'])
      await vi.advanceTimersByTimeAsync(1000)
      expect(sent).toEqual(['a', 'a'])
      gates.a.reject(unreachable)
      // The wait doubles: nothing after one more second, the next try after two.
      await vi.advanceTimersByTimeAsync(1000)
      expect(sent).toEqual(['a', 'a'])
      await vi.advanceTimersByTimeAsync(1000)
      expect(sent).toEqual(['a', 'a', 'a'])
      // Once one gets through, the next message goes at once.
      gates.a.resolve()
      await vi.advanceTimersByTimeAsync(0)
      queue.enqueue(msg('b'))
      expect(sent).toEqual(['a', 'a', 'a', 'b'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('the connection coming back sends what waits without sitting out the pause', async () => {
    vi.useFakeTimers()
    try {
      const { queue, gates, sent } = setup()
      queue.enqueue(msg('a'))
      gates.a.reject(new ApiError({ title: "Couldn't reach the server", status: 0 }))
      await vi.advanceTimersByTimeAsync(0)
      queue.wake()
      expect(sent).toEqual(['a', 'a'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('Retry tries at once, even while the queue waits out a pause', async () => {
    vi.useFakeTimers()
    try {
      const { queue, gates, sent } = setup()
      queue.enqueue(msg('a'))
      queue.enqueue(msg('x', 'c2'))
      gates.x.reject(new ApiError({ title: 'Bad request', status: 400 }))
      gates.a.reject(new ApiError({ title: "Couldn't reach the server", status: 0 }))
      await vi.advanceTimersByTimeAsync(0)
      queue.retry('x')
      expect(sent).toEqual(['a', 'x', 'a', 'x'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('a refused send is marked failed with the reason; the next one still goes; Retry sends it again', async () => {
    const { queue, gates, sent, statuses } = setup()
    queue.enqueue(msg('a'))
    queue.enqueue(msg('b'))
    gates.a.reject(new ApiError({ title: 'Bad request', status: 400, detail: 'This channel is archived.' }))
    await flush()
    expect(statuses()).toEqual({ a: 'failed', b: 'sending' })
    expect(queue.items()[0].error).toBe('This channel is archived.')
    queue.retry('a')
    gates.b.resolve()
    await flush()
    expect(sent).toEqual(['a', 'b', 'a'])
  })

  it('Delete drops a failed or waiting message; it is never sent', async () => {
    const { queue, sent, state } = setup(false)
    queue.enqueue(msg('a'))
    queue.discard('a')
    state.online = true
    queue.wake()
    expect(sent).toEqual([])
    expect(queue.items()).toEqual([])
  })

  it('tells the page each time something changes', () => {
    const { queue, changes } = setup()
    queue.enqueue(msg('a'))
    expect(changes.at(-1)?.map((p) => p.clientId)).toEqual(['a'])
  })
})

describe('send queue with files (spec 6.9, slice 6)', () => {
  it('keeps a message’s files while it waits, and sends them with it', async () => {
    const { queue, send } = setup()
    const file = { id: 'a1', name: 'scope.pdf' } as PendingMessage['attachments'] extends (infer A)[] | undefined ? A : never
    queue.enqueue({ ...msg('k1'), content: '', fileIds: ['a1'], attachments: [file] })
    expect(queue.items()[0]).toMatchObject({ fileIds: ['a1'], attachments: [file] })
    await flush()
    expect(send.mock.calls[0][0]).toMatchObject({ clientId: 'k1', fileIds: ['a1'] })
  })
})
