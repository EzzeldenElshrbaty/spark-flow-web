import { useMutation, useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import { api } from '@/lib/api'

/** A channel's task list (chat spec 6.14): a change in the channel, or to any task, refreshes it. */
export function useTaskList(channelId: string | undefined) {
  return useQuery({ queryKey: qk.taskList(channelId ?? ''), queryFn: () => api.taskLists.get(channelId!), retry, enabled: Boolean(channelId) })
}

export function useAddToTaskList() {
  return useMutation({ mutationFn: ({ channelId, taskKey }: { channelId: string; taskKey: string }) => api.taskLists.add(channelId, taskKey) })
}

export function useRemoveFromTaskList() {
  return useMutation({ mutationFn: ({ channelId, taskKey }: { channelId: string; taskKey: string }) => api.taskLists.remove(channelId, taskKey) })
}
