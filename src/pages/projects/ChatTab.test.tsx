// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSummary } from '@/api/types'
import { ChatTab, OpenInChatLink } from './ChatTab'

// The project's Chat tab (slice AA): the channel's own view, not a second, simpler one.

vi.mock('@/pages/chat/ChannelPage', () => ({ ChannelView: ({ channelId, hideTabs = [] }: { channelId: string; hideTabs?: string[] }) => <p>Channel view of {channelId}{hideTabs.length ? ` without ${hideTabs.join(', ')}` : ''}</p> }))
afterEach(cleanup)

describe('the project Chat tab', () => {
  it('shows the project’s channel through the channel view, filling the height left (UX Phase 1, 1.3)', async () => {
    const { container } = render(
      <MemoryRouter>
        <ChatTab project={{ id: 'p-nex', channelId: 'c-p-nex', name: 'Nexus Core' } as ProjectSummary} />
      </MemoryRouter>,
    )
    // One Files list per project (UX Phase 2, 2.5): the project's Files tab, which has a Chat filter.
    expect(await screen.findByText('Channel view of c-p-nex without files')).toBeTruthy()
    // It fills what's left, but never below a floor: on a short screen the page scrolls to it instead (final review).
    expect((container.firstElementChild as HTMLElement).className.split(' ')).toEqual(expect.arrayContaining(['flex-1', 'min-h-[18rem]']))
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
