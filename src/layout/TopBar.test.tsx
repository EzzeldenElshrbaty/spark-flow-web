// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TopBar } from './TopBar'

// Final review (UX Phase 5B): the top bar wires the folded search box to the search screen, so ⌘K, / and ⌘F open it.
const seen = vi.hoisted(() => ({ desktop: {} as { onOpenScreen?: () => void } }))
vi.mock('@/layout/GlobalSearch', () => ({
  DesktopSearch: (props: { onOpenScreen?: () => void }) => ((seen.desktop = props), null),
  PhoneSearch: () => null,
}))
vi.mock('@/layout/HelpButton', () => ({ HelpButton: () => null }))
vi.mock('@/layout/NotificationsMenu', () => ({ NotificationsMenu: () => null }))
vi.mock('@/layout/TimerBar', () => ({ TimerPill: () => null }))
vi.mock('@/layout/UserMenu', () => ({ UserMenu: () => null }))
vi.mock('@/layout/WorkspaceSwitcher', () => ({ WorkspaceSwitcher: () => null }))

afterEach(cleanup)

describe('TopBar search (final review)', () => {
  it('the box’s way to the search screen opens it', () => {
    const onSearchOpenChange = vi.fn()
    render(<TopBar onOpenMenu={() => {}} sidebarCollapsed={false} onToggleSidebar={() => {}} searchOpen={false} onSearchOpenChange={onSearchOpenChange} />)
    expect(typeof seen.desktop.onOpenScreen).toBe('function')
    seen.desktop.onOpenScreen!()
    expect(onSearchOpenChange).toHaveBeenCalledWith(true)
  })
})
