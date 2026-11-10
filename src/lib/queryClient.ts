import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { ApiError } from '@/lib/apiError'

/** The app's query client (main.tsx); the whole-app tests make a fresh one per page load (UX Phase 6). */
export function createQueryClient(): QueryClient {
  // After any change, everything on screen reloads (counts, tabs, the bell), so nothing needs a page refresh. A change
  // waits for that reload before it counts as done, unless it's marked `closeFirst` (uploads: the files are saved, so
  // the dialog closes and the page catches up behind it).
  const queryClient: QueryClient = new QueryClient({
    // Data loaded in the last 30 seconds is shown as it is when a page or tab opens again, instead of loading it again.
    // A change still reloads everything on screen straight away (below).
    defaultOptions: { queries: { staleTime: 30_000 } },
    // Any 401 (slice AB: signed out in another tab, or the session ended) asks for my account again; its 401 then takes
    // the shell to Sign in.
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (error instanceof ApiError && error.status === 401 && JSON.stringify(query.queryKey) !== JSON.stringify(qk.me())) void queryClient.invalidateQueries({ queryKey: qk.me() })
      },
    }),
    mutationCache: new MutationCache({
      onSuccess: (_data, _variables, _context, mutation) => {
        const reload = queryClient.invalidateQueries()
        return mutation.meta?.closeFirst ? undefined : reload
      },
    }),
  })
  return queryClient
}
