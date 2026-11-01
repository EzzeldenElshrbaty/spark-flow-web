import { useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { create } from 'zustand'
import { qk } from '@/api/queryKeys'
import type { ChatMessage, Page } from '@/api/types'
import { api } from '@/lib/api'
import { createSendQueue, type PendingMessage } from '@/lib/sendQueue'

const usePendingStore = create<{ items: PendingMessage[] }>(() => ({ items: [] }))

/** Puts a message the server confirmed at the newest end of its channel's list, so it's there before any refetch. */
function showSent(queryClient: QueryClient, message: ChatMessage) {
  queryClient.setQueryData<InfiniteData<Page<ChatMessage>>>(qk.messages(message.channelId), (data) => {
    if (!data || data.pages.length === 0 || data.pages.some((p) => p.items.some((m) => m.id === message.id))) return data
    const [first, ...rest] = data.pages
    return { ...data, pages: [{ ...first, items: [message, ...first.items] }, ...rest] }
  })
}

// One queue for the app, made with the first query client that asks (a second client, in tests, gets its own).
const queues = new WeakMap<QueryClient, ReturnType<typeof createSendQueue>>()

/**
 * The send queue (spec 6.2): `enqueue` shows the message at once and sends it in order, waiting while offline;
 * `retry` and `discard` are the failed row's Retry and Delete.
 */
export function useSendQueue() {
  const queryClient = useQueryClient()
  let queue = queues.get(queryClient)
  if (!queue) {
    queue = createSendQueue({
      send: async (p) => showSent(queryClient, await api.chat.send(p.channelId, p.content, p.clientId, p.body, p.fileIds)),
      online: () => navigator.onLine,
      onChange: (items) => usePendingStore.setState({ items }),
    })
    queues.set(queryClient, queue)
  }
  const current = queue
  useEffect(() => {
    const wake = () => current.wake()
    window.addEventListener('online', wake)
    return () => window.removeEventListener('online', wake)
  }, [current])
  return current
}

/** My unconfirmed messages in a channel, oldest first. */
export function usePendingMessages(channelId: string): PendingMessage[] {
  const items = usePendingStore((s) => s.items)
  return useMemo(() => items.filter((p) => p.channelId === channelId), [items, channelId])
}
