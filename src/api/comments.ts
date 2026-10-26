import { useMutation, useQuery } from '@tanstack/react-query'
import type { CommentKind, UploadFile } from '@/api/types'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import { api } from '@/lib/api'

export function useComments(taskKey: string | undefined) {
  return useQuery({ queryKey: qk.comments(taskKey ?? ''), queryFn: () => api.comments.list(taskKey!), retry, enabled: Boolean(taskKey) })
}
export function useAddComment() {
  return useMutation({ mutationFn: (input: { taskKey: string; kind: CommentKind; body: string; files: UploadFile[] }) => api.comments.create(input) })
}
