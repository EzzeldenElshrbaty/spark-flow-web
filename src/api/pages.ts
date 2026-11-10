import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import type { PageView } from '@/api/types'
import { api } from '@/lib/api'
import type { PageBody } from '@/lib/pageBody'

/** A channel's page (chat spec 6.14); a save or a change of holder anywhere reloads it (`pageSaved`, `pageEditing`). */
export function usePage(channelId: string | undefined) {
  return useQuery({ queryKey: qk.page(channelId ?? ''), queryFn: () => api.pages.get(channelId!), retry, enabled: Boolean(channelId) })
}

/** Reads the page from the server now (Load the latest), and keeps it as the page's data. */
export function useLatestPage() {
  const queryClient = useQueryClient()
  return (channelId: string) => queryClient.fetchQuery({ queryKey: qk.page(channelId), queryFn: () => api.pages.get(channelId), staleTime: 0 })
}

/** The page's versions, newest first; read only while History is open. */
export function usePageHistory(channelId: string, enabled: boolean) {
  return useQuery({ queryKey: qk.pageHistory(channelId), queryFn: () => api.pages.history(channelId), retry, enabled })
}

export function usePageVersion(channelId: string, versionId: string | null) {
  return useQuery({ queryKey: qk.pageVersion(channelId, versionId ?? ''), queryFn: () => api.pages.version(channelId, versionId!), retry, enabled: Boolean(versionId) })
}

// Autosave runs about once a second while someone types, and a claim every few seconds: each writes its own answer
// into the page's cache instead of reloading everything (`meta.invalidate`, lib/queryClient.ts).

export function useSavePage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ channelId, body, baseVersion }: { channelId: string; body: PageBody; baseVersion: number }) => api.pages.save(channelId, { body, baseVersion }),
    meta: { invalidate: false },
    onSuccess: (view) => queryClient.setQueryData(qk.page(view.channelId), view),
  })
}

export function useClaimPage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (channelId: string) => api.pages.editing(channelId),
    meta: { invalidate: false },
    onSuccess: ({ editing }, channelId) => queryClient.setQueryData<PageView>(qk.page(channelId), (old) => old && { ...old, editing }),
  })
}

export function useReleasePage() {
  return useMutation({ mutationFn: (channelId: string) => api.pages.stopEditing(channelId), meta: { invalidate: false } })
}

/** A restore is rare and changes the page and its history: everything on screen reloads, as after any change. */
export function useRestorePage() {
  return useMutation({
    mutationFn: ({ channelId, versionId, baseVersion }: { channelId: string; versionId: string; baseVersion: number }) => api.pages.restore(channelId, { versionId, baseVersion }),
  })
}
