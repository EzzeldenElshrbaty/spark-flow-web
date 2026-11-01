import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import type { Api, ChannelFileFilter, FilePatch, UploadFile } from '@/api/types'
import { api } from '@/lib/api'

/** Uploads a file for a message in a channel (spec 6.9): progress as it goes up; the signal cancels it. */
export const uploadChatFile = (channelId: string, file: UploadFile, options?: Parameters<Api['files']['uploadForChat']>[2]) => api.files.uploadForChat(channelId, file, options)

/** A file's details (spec 6.9 File details panel): who uploaded it and where it's shared; `fileChanged` refreshes them. */
/** A file's details for the panel; a file that's gone (404) says so at once instead of retrying. */
export function useFileDetails(fileId: string | undefined) {
  return useQuery({ queryKey: qk.fileDetails(fileId ?? ''), queryFn: () => api.files.details(fileId!), enabled: Boolean(fileId), retry })
}
/** Edit file details: its name and description. */
export function useUpdateFile() {
  return useMutation({ mutationFn: ({ id, patch }: { id: string; patch: FilePatch }) => api.files.update(id, patch) })
}
/** Delete file: it goes from everywhere it's shared. */
export function useDeleteFile() {
  return useMutation({ mutationFn: (id: string) => api.files.delete(id) })
}
/** Share: posts the file in another channel or DM, with an optional message. */
export function useShareFile() {
  return useMutation({ mutationFn: ({ id, channelId, content }: { id: string; channelId: string; content?: string }) => api.files.share(id, channelId, content) })
}

/** The files shared in a channel, newest first, 50 at a time (spec 6.1 Files tab); new messages and file changes refresh it. */
export function useChannelFiles(channelId: string, filter: Omit<ChannelFileFilter, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: qk.channelFiles(channelId, filter),
    queryFn: ({ pageParam }) => api.files.inChannel(channelId, { ...filter, ...(pageParam && { cursor: pageParam }) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry,
  })
}

/** Add from Flow files (spec 6.8): the files in a workspace I may share, newest first; `q` searches them. */
export function useShareableFiles(workspaceId: string, q: string) {
  return useQuery({ queryKey: ['files', 'shareable', workspaceId, q], queryFn: () => api.files.shareable(workspaceId, q), retry, placeholderData: (previous) => previous })
}
