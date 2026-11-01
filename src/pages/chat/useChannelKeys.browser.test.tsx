import '@/index.css'
import { cleanup, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { FileViewer } from '@/components/ui/FileViewer'
import { useChannelKeys } from '@/pages/chat/useChannelKeys'

// Real key presses, in Chromium: between one listener and the next the browser runs React's pending work, so a
// dialog that closes on Esc is already gone by the time the page's listener asks whether one is open.

afterEach(() => {
  cleanup()
})

function Page({ onMarkRead }: { onMarkRead: () => void }) {
  const [viewing, setViewing] = useState(true)
  useChannelKeys({ channelId: 'c1', order: [], onGo: () => {}, onMarkRead, onMarkAllRead: () => {} })
  return viewing ? <FileViewer files={[{ name: 'plan.png', url: '/plan.png' }]} onClose={() => setViewing(false)} /> : null
}

describe('useChannelKeys with real keys', () => {
  it('Esc that closes an image preview closes only the preview', async () => {
    const onMarkRead = vi.fn()
    render(<Page onMarkRead={onMarkRead} />)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onMarkRead).not.toHaveBeenCalled()
    // With nothing open, the next Esc marks the channel read.
    await userEvent.keyboard('{Escape}')
    expect(onMarkRead).toHaveBeenCalledOnce()
  })
})
