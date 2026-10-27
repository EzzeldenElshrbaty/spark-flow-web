import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'

/** The Database page. Prototype only: with the backend on these fail. */
export function useExportData() {
  return useMutation({ mutationFn: () => api.db.export() })
}

export function useImportData() {
  return useMutation({ mutationFn: (bundle: unknown) => api.db.import(bundle) })
}

export function useResetDemo() {
  return useMutation({ mutationFn: () => api.db.reset() })
}
