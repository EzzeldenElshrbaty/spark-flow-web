// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSummary } from '@/api/types'
import { ChatTab } from './ChatTab'

// The project's Chat tab (slice AA): the channel's own view, not a second, simpler one.

vi.mock('@/pages/chat/ChannelPage', () => ({ ChannelView: ({ channelId }: { channelId: string }) => <p>Channel view of {channelId}</p> }))
afterEach(cleanup)

describe('the project Chat tab', () => {
  it('shows the project’s channel through the channel view, with a way to open it in Chat', async () => {
    render(
      <MemoryRouter>
        <ChatTab ws="engineering" project={{ id: 'p-nex', channelId: 'c-p-nex', name: 'Nexus Core' } as ProjectSummary} />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Channel view of c-p-nex')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Open in Chat/ }).getAttribute('href')).toBe('/w/engineering/c/c-p-nex')
  })
})
