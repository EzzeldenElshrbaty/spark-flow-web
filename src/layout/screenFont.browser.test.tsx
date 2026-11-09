import '@/index.css'
import { cleanup, render } from '@testing-library/react'
import { createPortal } from 'react-dom'
import { afterEach, describe, expect, it } from 'vitest'

// UX Phase 3 (3.1): the shell's font follows the screen. AppLayout sets data-font on <html>; flow-tokens.css gives
// every .sf element (sidebar, top bar, and sf portals at <body>) the page's Inter outside chat screens.

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.font
})

function fonts() {
  render(
    <>
      <nav className="sf" data-testid="shell">
        <span className="sf" data-testid="nested">
          Shell
        </span>
      </nav>
      {createPortal(
        <div className="sf" data-testid="portal">
          Menu
        </div>,
        document.body,
      )}
    </>,
  )
  const family = (id: string) => getComputedStyle(document.querySelector(`[data-testid="${id}"]`)!).fontFamily
  return { shell: family('shell'), nested: family('nested'), portal: family('portal') }
}

describe('the font follows the screen', () => {
  it('on a page, the shell, nested chat scopes and portals use Inter', () => {
    document.documentElement.dataset.font = 'page'
    const { shell, nested, portal } = fonts()
    for (const family of [shell, nested, portal]) {
      expect(family).toMatch(/^"?Inter"?,/)
      expect(family).not.toContain('Readex')
    }
  })

  it('on a chat screen, everything keeps Readex Pro, kit panels beside the chat too (final review)', () => {
    document.documentElement.dataset.font = 'chat'
    const { shell, portal } = fonts()
    expect(shell).toContain('Readex Pro')
    expect(portal).toContain('Readex Pro')
    render(<aside data-testid="kit-panel">Task panel</aside>)
    expect(getComputedStyle(document.querySelector('[data-testid="kit-panel"]')!).fontFamily).toContain('Readex Pro')
  })
})
