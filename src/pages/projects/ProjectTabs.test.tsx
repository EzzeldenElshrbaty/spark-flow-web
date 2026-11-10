// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { ProjectTabs } from './ProjectTabs'

afterEach(cleanup)

describe('ProjectTabs end slot (UX Phase 1, 1.3)', () => {
  it('shows what it is given at the end of the tab row', () => {
    render(
      <MemoryRouter>
        <ProjectTabs ws="engineering" projectKey="NEX" tab="chat" end={<a href="/w/engineering/c/c-p-nex">Open in Chat</a>} />
      </MemoryRouter>,
    )
    // The row: the nav sits in a wrapper that holds its end fade (UX Phase 5B).
    expect(within(screen.getByRole('navigation', { name: 'Project' }).parentElement!.parentElement!).getByRole('link', { name: 'Open in Chat' })).toBeTruthy()
  })
})
