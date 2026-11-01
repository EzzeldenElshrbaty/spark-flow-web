// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SidebarResizer } from '@/layout/Sidebar'
import { SIDEBAR_WIDTH, useUiStore } from '@/lib/uiStore'

afterEach(cleanup)
beforeEach(() => useUiStore.getState().setSidebarWidth(SIDEBAR_WIDTH.initial))

describe('SidebarResizer', () => {
  it('is a labelled vertical separator that reports the width', () => {
    render(<SidebarResizer />)
    const handle = screen.getByRole('separator', { name: 'Resize sidebar' })
    expect(handle.getAttribute('aria-orientation')).toBe('vertical')
    expect(handle.getAttribute('aria-valuenow')).toBe('260')
    expect(handle.getAttribute('aria-valuemin')).toBe('200')
    expect(handle.getAttribute('aria-valuemax')).toBe('420')
    expect(handle.tabIndex).toBe(0)
  })

  it('resizes with the arrow keys, Home and End, and resets on double-click', () => {
    render(<SidebarResizer />)
    const handle = screen.getByRole('separator')
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(useUiStore.getState().sidebarWidth).toBe(276)
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(useUiStore.getState().sidebarWidth).toBe(244)
    fireEvent.keyDown(handle, { key: 'End' })
    expect(useUiStore.getState().sidebarWidth).toBe(420)
    fireEvent.keyDown(handle, { key: 'Home' })
    expect(useUiStore.getState().sidebarWidth).toBe(200)
    fireEvent.doubleClick(handle)
    expect(useUiStore.getState().sidebarWidth).toBe(260)
  })

  it('follows the pointer while dragging', () => {
    render(<SidebarResizer />)
    const handle = screen.getByRole('separator')
    fireEvent.pointerDown(handle, { clientX: 260, pointerId: 1, button: 0 })
    fireEvent.pointerMove(handle, { clientX: 330, pointerId: 1 })
    expect(useUiStore.getState().sidebarWidth).toBe(330)
    fireEvent.pointerUp(handle, { pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 380, pointerId: 1 })
    expect(useUiStore.getState().sidebarWidth).toBe(330)
  })

  it('in RTL the sidebar is on the right, so the arrows swap', () => {
    render(
      <div dir="rtl">
        <SidebarResizer />
      </div>,
    )
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowLeft' })
    expect(useUiStore.getState().sidebarWidth).toBe(276)
  })
})
