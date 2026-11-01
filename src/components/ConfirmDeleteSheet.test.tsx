// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Channel } from '@/api/types'
import { api } from '@/lib/api'
import { ArchiveChannelModal } from '@/pages/chat/ChannelActions'
import { ConfirmDeleteSheet } from './ConfirmDeleteSheet'

window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
const wrap = (node: ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>)

describe('archiving asks "Why?" (slice 4)', () => {
  it('the archive sheet sends the reason, trimmed; a sheet that doesn’t ask has no field', async () => {
    const onConfirm = vi.fn(async () => {})
    const { unmount } = wrap(<ConfirmDeleteSheet open askWhy tone="primary" title="Archive Sela booking?" description="…" actionLabel="Archive project" onConfirm={onConfirm} onClose={() => {}} />)
    fireEvent.change(screen.getByRole('textbox', { name: /Why\?/ }), { target: { value: '  Client paused ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Archive project' }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Client paused'))
    unmount()
    wrap(<ConfirmDeleteSheet open title="Delete this comment?" description="…" actionLabel="Delete" onConfirm={onConfirm} onClose={() => {}} />)
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('Archive channel sends its reason too', async () => {
    const archive = vi.spyOn(api.chat, 'archiveChannel').mockResolvedValue({} as Channel)
    const channel = { id: 'c-release', name: 'release-v2', workspaceId: 'ws-eng', kind: 'channel' } as Channel
    wrap(<ArchiveChannelModal channel={channel} open onClose={() => {}} />)
    fireEvent.change(screen.getByRole('textbox', { name: /Why\?/ }), { target: { value: 'Release shipped' } })
    fireEvent.click(screen.getByRole('button', { name: 'Archive channel' }))
    await waitFor(() => expect(archive).toHaveBeenCalledWith('c-release', 'Release shipped'))
  })
})
