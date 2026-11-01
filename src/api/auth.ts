import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

// Signing in (slice AB). A sign-in or sign-out starts the app's data afresh: the page clears the query cache.

/** The prototype's people to sign in as; not asked for with the backend on. */
export function useDemoPeople(enabled: boolean) {
  return useQuery({ queryKey: ['auth', 'demoPeople'], queryFn: () => api.auth.demoPeople(), enabled, retry: false })
}

export function useSignIn() {
  return useMutation({ mutationFn: ({ email, password }: { email: string; password: string }) => api.auth.signIn(email, password) })
}

export function useSignOut() {
  return useMutation({ mutationFn: () => api.auth.signOut() })
}
