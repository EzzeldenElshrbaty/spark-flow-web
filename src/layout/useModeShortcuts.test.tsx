// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useModeShortcuts } from '@/layout/useModeShortcuts'

const goTo = vi.fn(() => true)
vi.mock('@/layout/useGoToMode', () => ({ useGoToMode: () => goTo }))

beforeEach(() => {
  vi.useFakeTimers()
  goTo.mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

const press = (code: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: code.replace('Key', '').toLowerCase(), code, ...init })
  target.dispatchEvent(event)
  return event
}

describe('single-key shortcuts off (UX Phase 5A, 5.13)', () => {
  it('G then P does nothing while they’re off', () => {
    renderHook(() => useModeShortcuts(false))
    press('KeyG')
    expect(press('KeyP').defaultPrevented).toBe(false)
    expect(goTo).not.toHaveBeenCalled()
  })
})

describe('useModeShortcuts (spec 5.5: G then P, G then C)', () => {
  it('G then P goes to Projects and G then C to Chat, taking the second key', () => {
    renderHook(() => useModeShortcuts())
    press('KeyG')
    expect(press('KeyP').defaultPrevented).toBe(true)
    expect(goTo).toHaveBeenLastCalledWith('projects')
    press('KeyG')
    press('KeyC')
    expect(goTo).toHaveBeenLastCalledWith('chat')
  })

  it('goes by the key’s place, so it works on an Arabic layout', () => {
    renderHook(() => useModeShortcuts())
    press('KeyG', { key: 'ل' })
    press('KeyC', { key: 'ؤ' })
    expect(goTo).toHaveBeenCalledWith('chat')
  })

  it('the second key must come within a second, and right after G', () => {
    renderHook(() => useModeShortcuts())
    press('KeyG')
    vi.advanceTimersByTime(1001)
    press('KeyP')
    press('KeyG')
    press('KeyX')
    press('KeyC')
    press('KeyP')
    expect(goTo).not.toHaveBeenCalled()
  })

  it('leaves the keys alone while typing, with a modifier, on repeats and while a dialog is open', () => {
    renderHook(() => useModeShortcuts())
    const box = document.createElement('input')
    document.body.appendChild(box)
    press('KeyG', {}, box)
    press('KeyP', {}, box)
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    document.body.appendChild(editor)
    press('KeyG', {}, editor)
    press('KeyC', {}, editor)
    press('KeyG', { metaKey: true })
    press('KeyP')
    press('KeyG', { repeat: true })
    press('KeyC')
    const dialog = document.createElement('div')
    dialog.setAttribute('aria-modal', 'true')
    document.body.appendChild(dialog)
    press('KeyG')
    press('KeyC')
    expect(goTo).not.toHaveBeenCalled()
  })

  it('the key after G doesn’t reach the focused message (P would pin it)', () => {
    renderHook(() => useModeShortcuts())
    const row = document.createElement('div')
    row.tabIndex = 0
    document.body.appendChild(row)
    const onRow = vi.fn()
    row.addEventListener('keydown', onRow)
    press('KeyG', {}, row)
    press('KeyP', {}, row)
    expect(onRow).toHaveBeenCalledTimes(1)
    expect(goTo).toHaveBeenCalledWith('projects')
  })
})
