import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { qk } from '@/api/queryKeys'
import type { Preferences } from '@/api/types'
import { api } from '@/lib/api'
import { dndEndLabel, dndState } from '@/lib/notifyRules'

export const preferencesQuery = () => queryOptions({ queryKey: qk.preferences(), queryFn: () => api.preferences.get() })

/** My notification preferences (spec 6.11). */
export function usePreferences() {
  return useQuery(preferencesQuery())
}

/** Checks the clock every 30 seconds. */
const everyHalfMinute = (onTick: () => void) => {
  const id = setInterval(onTick, 30_000)
  return () => clearInterval(id)
}

/**
 * While Do Not Disturb is on, when it ends ("9:00 AM", "tomorrow at 9:00 AM"); null while it's off or unknown. The
 * clock is read every 30 seconds, but whoever uses it renders again only when the words change.
 */
export function useDndEnd(): string | null {
  const prefs = usePreferences().data
  return useSyncExternalStore(everyHalfMinute, () => {
    if (!prefs) return null
    const now = new Date()
    const state = dndState(prefs, now)
    return state ? dndEndLabel(state, now) : null
  })
}

/**
 * Saves a part of them. The change shows at once, so a quick next one (another day, another keyword) builds on it
 * rather than on what's still loading; a refusal reloads what the server kept.
 */
export function useUpdatePreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<Preferences>) => api.preferences.update(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: qk.preferences() })
      queryClient.setQueryData<Preferences>(qk.preferences(), (old) => (old ? { ...old, ...patch } : old))
    },
    onError: () => queryClient.invalidateQueries({ queryKey: qk.preferences() }),
  })
}
