// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { useInvitations } from '@/api/chat'
import { qk } from '@/api/queryKeys'
import type { Invitation } from '@/api/types'

const sent = { id: 'inv-1', email: 'sam@client.com', channelId: 'c-ops' } as Invitation

describe('useInvitations (spec 6.10 Members, slice 5 review)', () => {
  it('shows the list only while it may be loaded: an archived channel or closed details show none, not a cached list', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    client.setQueryData(qk.invitations('c-ops'), [sent])
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    expect(renderHook(() => useInvitations('c-ops', true), { wrapper }).result.current).toEqual([sent])
    expect(renderHook(() => useInvitations('c-ops', false), { wrapper }).result.current).toEqual([])
  })
})
