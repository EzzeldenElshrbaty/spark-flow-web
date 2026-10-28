import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { keysForEvent } from '@/api/queryKeys'
import { useRealtime, type RealtimeEvent } from '@/lib/realtime'
import { useUiStore } from '@/lib/uiStore'

/** Listens for live updates for the whole signed-in app: makes affected queries stale and tracks who is typing. */
export function RealtimeBridge(): null {
  const queryClient = useQueryClient()
  const realtime = useRealtime()

  useEffect(() => {
    const client = realtime
    const invalidate = (event: RealtimeEvent) => {
      for (const queryKey of keysForEvent(event)) void queryClient.invalidateQueries({ queryKey })
    }
    const unsubscribers = [
      client.onMessageReceived((message) => invalidate({ type: 'messageReceived', message })),
      client.onReplyReceived((reply) => invalidate({ type: 'replyReceived', reply })),
      client.onTicketUpdated((ticket) => invalidate({ type: 'ticketUpdated', ticket })),
      client.onTimeLogged(({ userId, projectId }) => invalidate({ type: 'timeLogged', userId, projectId })),
      client.onCommentAdded(({ taskKey, projectId }) => invalidate({ type: 'commentAdded', taskKey, projectId })),
      client.onMessageChanged(({ channelId, messageId }) => invalidate({ type: 'messageChanged', channelId, messageId })),
      client.onChannelChanged(({ channelId }) => invalidate({ type: 'channelChanged', channelId })),
      client.onProjectChanged(({ projectId }) => invalidate({ type: 'projectChanged', projectId })),
      client.onRatesChanged(() => invalidate({ type: 'ratesChanged' })),
      client.onFilesChanged(({ projectId }) => invalidate({ type: 'filesChanged', projectId })),
      client.onReadChanged((e) => invalidate({ type: 'readChanged', ...e })),
      client.onDraftChanged((e) => invalidate({ type: 'draftChanged', ...e })),
      client.onDataReset(() => invalidate({ type: 'dataReset' })),
      client.onUserTyping(({ channelId, userId }) => useUiStore.getState().addTyper(channelId, userId)),
    ]
    void client.start()

    // Unsubscribing first and stopping after keeps a StrictMode double mount from leaving duplicate listeners behind.
    return () => {
      unsubscribers.forEach((off) => off())
      void client.stop()
    }
  }, [queryClient, realtime])

  return null
}
