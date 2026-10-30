import '@/index.css'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { useModeShortcuts } from '@/layout/useModeShortcuts'

// Real key presses, in Chromium: the second key of G then P must not also reach a focused message, where P pins it.

const goTo = vi.fn(() => true)
vi.mock('@/layout/useGoToMode', () => ({ useGoToMode: () => goTo }))

beforeEach(() => goTo.mockClear())
afterEach(cleanup)

function Page({ onPin }: { onPin: () => void }) {
  useModeShortcuts()
  return (
    <div
      role="article"
      aria-label="Message"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'p') onPin()
      }}
    />
  )
}

describe('useModeShortcuts with real keys', () => {
  it('G then P opens Projects and the P never reaches the focused message', async () => {
    const onPin = vi.fn()
    const { getByRole } = render(<Page onPin={onPin} />)
    getByRole('article').focus()
    await userEvent.keyboard('gp')
    expect(goTo).toHaveBeenCalledWith('projects')
    expect(onPin).not.toHaveBeenCalled()
    // A P on its own is the message's again.
    await userEvent.keyboard('p')
    expect(onPin).toHaveBeenCalledOnce()
  })

  it('G then C opens Chat; typed in a box it stays text', async () => {
    const { container } = render(
      <>
        <Page onPin={() => {}} />
        <input aria-label="Name" />
      </>,
    )
    await userEvent.keyboard('gc')
    expect(goTo).toHaveBeenCalledWith('chat')
    goTo.mockClear()
    const box = container.querySelector('input')!
    box.focus()
    await userEvent.keyboard('gc')
    expect(goTo).not.toHaveBeenCalled()
    expect(box.value).toBe('gc')
  })
})
