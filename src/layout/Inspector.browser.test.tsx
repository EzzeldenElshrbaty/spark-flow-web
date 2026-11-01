import '@/index.css'
import { cleanup, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Popover } from '@/components/sf/Popover'
import { FileViewer } from '@/components/ui/FileViewer'
import { useInspectorEscape } from '@/layout/Inspector'
import { useChannelKeys } from '@/pages/chat/useChannelKeys'

// Real key presses, in Chromium: between one listener and the next the browser runs React's pending work, so a
// layer that closes on Esc may already be gone when the panel's listener runs.

afterEach(cleanup)

/** An open thread panel with, inside it, the emoji picker (a non-modal dialog) and an image preview (a modal one). */
function Panel({ onClose }: { onClose: () => void }) {
  const [viewing, setViewing] = useState(false)
  useInspectorEscape(true, onClose)
  return (
    <div className="sf">
      <Popover label="Add reaction" trigger={(props) => <button type="button" {...props}>Add reaction</button>}>
        {() => <button type="button">party popper</button>}
      </Popover>
      <button type="button" onClick={() => setViewing(true)}>
        Open plan.png
      </button>
      {viewing && <FileViewer files={[{ name: 'plan.png', url: '/plan.png' }]} onClose={() => setViewing(false)} />}
    </div>
  )
}

describe('the thread panel’s Esc (spec 10: Esc closes the top-most layer)', () => {
  it('Esc in the open emoji picker closes the picker; the next one closes the panel', async () => {
    const onClose = vi.fn()
    render(<Panel onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add reaction' }))
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('party popper'))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Add reaction' })).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Esc on an image preview closes only the preview', async () => {
    const onClose = vi.fn()
    render(<Panel onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open plan.png' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'plan.png' })).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Esc with the panel open closes the panel and doesn’t also mark the channel read', async () => {
    const onClose = vi.fn()
    const onMarkRead = vi.fn()
    // The channel page's keys come first: the page was there before the panel opened.
    function Channel() {
      const [thread, setThread] = useState(false)
      useChannelKeys({ channelId: 'c1', order: [], onGo: () => {}, onMarkRead, onMarkAllRead: () => {} })
      return thread ? <Panel onClose={onClose} /> : <button type="button" onClick={() => setThread(true)}>View thread</button>
    }
    render(<Channel />)
    await userEvent.click(screen.getByRole('button', { name: 'View thread' }))
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
    expect(onMarkRead).not.toHaveBeenCalled()
  })
})
