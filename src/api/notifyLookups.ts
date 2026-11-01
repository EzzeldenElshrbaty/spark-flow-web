import { useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { channelQuery } from '@/api/chat'
import { qk } from '@/api/queryKeys'
import { api } from '@/lib/api'
import { preferencesQuery } from '@/api/preferences'
import { meQuery, usersQuery } from '@/api/users'

/**
 * What a desktop notification needs, read when a live message arrives rather than kept rendered (spec 6.11). My
 * preferences and the channel's state are read fresh once a change made them stale; people and who I am come from
 * the cache when they're there.
 */
export function useNotifyLookups() {
  const queryClient = useQueryClient()
  return useMemo(
    () => ({
      me: () => queryClient.ensureQueryData(meQuery()),
      preferences: () => queryClient.fetchQuery(preferencesQuery()),
      // Every tab hears every live message in the prototype: one I can't read is answered once, not retried.
      channel: (id: string) => queryClient.fetchQuery({ ...channelQuery(id), retry: false }),
      people: (workspaceId: string) => queryClient.ensureQueryData(usersQuery(workspaceId)),
      // A reply's thread: whether I muted it (slice AA).
      root: (messageId: string) => queryClient.fetchQuery({ queryKey: qk.message(messageId), queryFn: () => api.chat.message(messageId), retry: false }),
    }),
    [queryClient],
  )
}
