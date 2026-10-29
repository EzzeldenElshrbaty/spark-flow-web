// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppShortcuts } from '@/layout/useAppShortcuts'

const navigate = vi.fn()
vi.mock('react-router', async (original) => ({ ...(await original<typeof import('react-router')>()), useNavigate: () => navigate }))
afterEach(() => {
  cleanup()
  navigate.mockClear()
})

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>
const press = (init: KeyboardEventInit, target: EventTarget = document.body) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

describe('useAppShortcuts (spec 10)', () => {
  it('goes by the key, not the letter (an Arabic layout), and holds off on repeats and while a dialog is open', () => {
    renderHook(() => useAppShortcuts('engineering'), { wrapper })
    press({ key: 'ش', code: 'KeyA', metaKey: true, shiftKey: true })
    expect(navigate).toHaveBeenCalledTimes(1)
    press({ key: 'A', code: 'KeyA', metaKey: true, shiftKey: true, repeat: true })
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    document.body.appendChild(dialog)
    press({ key: 'A', code: 'KeyA', metaKey: true, shiftKey: true })
    dialog.remove()
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('⌘/Ctrl+Shift+A opens Activity, from anywhere in the app, also while typing', () => {
    renderHook(() => useAppShortcuts('engineering'), { wrapper })
    expect(press({ key: 'A', code: 'KeyA', metaKey: true, shiftKey: true }).defaultPrevented).toBe(true)
    expect(navigate).toHaveBeenLastCalledWith('/w/engineering/activity')
    const box = document.createElement('textarea')
    document.body.appendChild(box)
    press({ key: 'a', code: 'KeyA', ctrlKey: true, shiftKey: true }, box)
    expect(navigate).toHaveBeenCalledTimes(2)
    box.remove()
  })

  it('leaves other keys, a key something else took, and a page with no workspace', () => {
    const { rerender } = renderHook(({ ws }) => useAppShortcuts(ws), { wrapper, initialProps: { ws: 'engineering' as string | undefined } })
    press({ key: 'a', metaKey: true })
    press({ key: 'a', shiftKey: true })
    // A field that uses the key itself says so first (as the composer does).
    const field = document.createElement('div')
    document.body.appendChild(field)
    field.addEventListener('keydown', (e) => e.preventDefault())
    press({ key: 'A', metaKey: true, shiftKey: true }, field)
    field.remove()
    rerender({ ws: undefined })
    press({ key: 'A', metaKey: true, shiftKey: true })
    expect(navigate).not.toHaveBeenCalled()
  })
})
