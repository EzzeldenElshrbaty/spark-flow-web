import '@/index.css'
import { cleanup, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { MenuPanel } from '@/components/ui/Menu'

// Where the menu opens needs real layout, so these run in Chromium, at desktop width (phones get a bottom sheet).

beforeEach(async () => {
  await page.viewport(1280, 800)
})
afterEach(async () => {
  cleanup()
  await page.viewport(414, 896)
})

/** A menu about 200px tall, open under a trigger `fromTop` px down a box `height` px tall (scrolling, or not). */
function Open({ fromTop, height, scrolls }: { fromTop: number; height: number; scrolls: boolean }) {
  const trigger = useRef<HTMLButtonElement>(null)
  return (
    <div data-testid="box" style={{ height, overflowY: scrolls ? 'auto' : 'visible' }}>
      <div style={{ height: fromTop }} />
      <div className="relative">
        <button ref={trigger}>Message actions</button>
        <MenuPanel open onClose={() => {}} triggerRef={trigger} label="Message actions">
          {['Mark unread', 'Edit message', 'Delete message', 'Create task', 'Copy link'].map((item) => (
            <button key={item} role="menuitem" style={{ display: 'block', height: 40 }}>
              {item}
            </button>
          ))}
        </MenuPanel>
      </div>
    </div>
  )
}

function rects() {
  return {
    box: screen.getByTestId('box').getBoundingClientRect(),
    trigger: screen.getByRole('button', { name: 'Message actions' }).getBoundingClientRect(),
    menu: screen.getByRole('menu').getBoundingClientRect(),
  }
}

describe('MenuPanel: where it opens', () => {
  it('opens under its trigger when there is room', () => {
    render(<Open fromTop={0} height={400} scrolls />)
    const { trigger, menu } = rects()
    expect(menu.top).toBeGreaterThanOrEqual(trigger.bottom)
  })

  it('on the last row of a scrolling list (the message above the composer), it opens upward, inside the list', () => {
    render(<Open fromTop={360} height={400} scrolls />)
    const { box, trigger, menu } = rects()
    expect(menu.bottom).toBeLessThanOrEqual(trigger.top)
    expect(menu.top).toBeGreaterThanOrEqual(box.top)
    // Focus lands on the first item without scrolling the list to reach a panel below it.
    expect(screen.getByTestId('box').scrollTop).toBe(0)
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Mark unread' }))
  })

  it('near the bottom of the window, it opens upward', () => {
    render(<Open fromTop={window.innerHeight - 40} height={window.innerHeight} scrolls={false} />)
    const { trigger, menu } = rects()
    expect(menu.bottom).toBeLessThanOrEqual(trigger.top)
    expect(menu.bottom).toBeLessThanOrEqual(window.innerHeight)
  })
})
