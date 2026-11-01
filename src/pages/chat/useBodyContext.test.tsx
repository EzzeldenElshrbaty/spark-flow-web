// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TaskRef } from '@/api/types'
import { api } from '@/lib/api'
import { parseBody } from '@/lib/messageBody'
import { useBodyContext } from '@/pages/chat/useBodyContext'

afterEach(() => vi.restoreAllMocks())

const ref = (key: string, projectKey: string): TaskRef => ({
  key, title: `${key} title`, status: 'todo', statusLabel: 'To do', category: 'todo', projectKey, projectName: projectKey, assigneeId: null,
})

describe('useBodyContext task chips (spec 6.3, §9: only tasks the viewer can see)', () => {
  it('keeps a resolved task only when its project is one I can see here; any other key stays plain text', async () => {
    vi.spyOn(api.tickets, 'resolve').mockResolvedValue([ref('NEX-101', 'NEX'), ref('SEC-7', 'SEC')])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const scope = { users: [], projectKeys: new Set(['NEX']), ws: 'engineering', workspaceId: 'ws-eng' }
    const bodies = [parseBody('See NEX-101 and SEC-7')]
    const { result } = renderHook(() => useBodyContext(bodies, scope), { wrapper })
    await waitFor(() => expect(result.current.tasks.has('NEX-101')).toBe(true))
    expect(result.current.tasks.has('SEC-7')).toBe(false)
  })
})
