import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'

/** Puts the prototype's sample data back as it was. Prototype only: with the backend on it fails. */
export function useResetDemoData() {
  return useMutation({ mutationFn: () => api.dev.resetDemoData() })
}
