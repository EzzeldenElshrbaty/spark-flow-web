import { useMutation, useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import { api } from '@/lib/api'

/** Hourly cost per person. Admin only: pass `enabled` false for anyone else, so nobody else asks for it. */
export function useRates(enabled: boolean) {
  return useQuery({ queryKey: qk.rates(), queryFn: () => api.rates.list(), retry, enabled })
}
export function useUpdateRate() {
  return useMutation({ mutationFn: ({ userId, hourlyCost }: { userId: string; hourlyCost: number }) => api.rates.update(userId, hourlyCost) })
}
