// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useFileDetails } from '@/api/files'
import { api } from '@/lib/api'
import { ApiError } from '@/lib/apiError'

afterEach(() => vi.restoreAllMocks())

describe('useFileDetails (slice 6 review)', () => {
  it('a file that is gone says so at once: a 404 is not retried', async () => {
    const details = vi.spyOn(api.files, 'details').mockRejectedValue(new ApiError({ title: 'Not Found', status: 404, detail: 'File not found.' }))
    const client = new QueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useFileDetails('a1'), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 1500 })
    expect(details).toHaveBeenCalledOnce()
  })
})
