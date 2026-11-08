// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSummary } from '@/api/types'
import { ChatTab, OpenInChatLink } from './ChatTab'

// The project's Chat tab (slice AA): the channel's own view, not a second, simpler one.

vi.mock('@/pages/chat/ChannelPage', () => ({ ChannelView: ({ channelId }: { channelId: string }) => <p>Channel view of {channelId}</p> }))
afterEach(cleanup)

describe('the project Chat tab', () => {
  it('shows the project’s channel through the channel view, filling the height left (UX Phase 1, 1.3)', async () => {
    const { container } = render(
      <MemoryRouter>
        <ChatTab project={{ id: 'p-nex', channelId: 'c-p-nex', name: 'Nexus Core' } as ProjectSummary} />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Channel view of c-p-nex')).toBeTruthy()
    expect((container.firstElementChild as HTMLElement).className.split(' ')).toEqual(expect.arrayContaining(['flex-1', 'min-h-0']))
  })

  it('Open in Chat goes to the full channel', () => {
    render(
      <MemoryRouter>
        <OpenInChatLink ws="engineering" channelId="c-p-nex" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /Open in Chat/ }).getAttribute('href')).toBe('/w/engineering/c/c-p-nex')
  })
})
