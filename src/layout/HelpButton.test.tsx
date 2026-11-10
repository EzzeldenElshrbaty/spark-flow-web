// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HelpButton } from '@/layout/HelpButton'
import { roundButton } from '@/layout/roundButton'

vi.mock('@/layout/PageHelpPanel', () => ({ HELP_BUTTON_ID: 'page-help-button', usePageHelp: () => ({ chapter: 'dashboard' }) }))
afterEach(cleanup)

const show = () => {
  render(
    <MemoryRouter>
      <HelpButton />
    </MemoryRouter>,
  )
  return screen.getByRole('button', { name: 'Help for this page' })
}

describe('HelpButton (spec 5.2: the top bar’s round buttons)', () => {
  it('is round with a hairline ring, like the bell beside it', () => {
    expect(show().className.split(/\s+/)).toEqual(expect.arrayContaining(roundButton.split(/\s+/)))
  })

  it('shows a plain question mark, so there’s no ring inside the ring', () => {
    const button = show()
    expect(button.querySelector('.tabler-icon-question-mark')).not.toBeNull()
    expect(button.querySelector('.tabler-icon-help-circle')).toBeNull()
  })
})
