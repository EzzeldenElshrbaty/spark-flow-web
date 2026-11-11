import { useMutation, useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import type { NewTicket } from '@/api/types'
import { api } from '@/lib/api'

/** A channel's task list (chat spec 6.14): a change in the channel, or to any task, refreshes it. */
export function useTaskList(channelId: string | undefined) {
  return useQuery({ queryKey: qk.taskList(channelId ?? ''), queryFn: () => api.taskLists.get(channelId!), retry, enabled: Boolean(channelId) })
}

export function useAddToTaskList() {
  return useMutation({ mutationFn: ({ channelId, taskKey }: { channelId: string; taskKey: string }) => api.taskLists.add(channelId, taskKey) })
}

/** A new task, made in the channel and put on its list in one write (task list §6). */
export function useAddNewToTaskList() {
  return useMutation({ mutationFn: ({ channelId, input }: { channelId: string; input: NewTicket }) => api.taskLists.addNew(channelId, input) })
}

export function useRemoveFromTaskList() {
  return useMutation({ mutationFn: ({ channelId, taskKey }: { channelId: string; taskKey: string }) => api.taskLists.remove(channelId, taskKey) })
}
