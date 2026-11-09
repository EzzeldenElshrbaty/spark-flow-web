// @vitest-environment jsdom
import { IconBell, IconDots, IconStar } from '@tabler/icons-react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Avatar, Facepile, initials } from '@/components/Avatar'
import { Count, Kbd, Tag } from './Badge'
import { Button, IconButton } from './Button'
import { Icon } from './Icon'
import { Checkbox, Toggle } from './Toggle'
import { TOOLTIP_DELAY_MS, Tooltip } from './Tooltip'

afterEach(cleanup)

describe('Icon', () => {
  it('draws Tabler icons at stroke 1.5, hidden from screen readers', () => {
    const { container } = render(<Icon icon={IconBell} size={18} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('stroke-width')).toBe('1.5')
    expect(svg.getAttribute('width')).toBe('18')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('Button and IconButton', () => {
  it('a primary button uses the accent fill and is a real button', () => {
    render(<Button variant="primary">Create task</Button>)
    const button = screen.getByRole('button', { name: 'Create task' })
    expect(button.getAttribute('type')).toBe('button')
    expect(button.className).toContain('bg-sf-accent-fill')
    expect(button.className).toContain('sf-focus')
  })

  it('a danger button has its own fill, not the primary’s (UX Phase 3: one danger style)', () => {
    render(<Button variant="danger">Delete message</Button>)
    const button = screen.getByRole('button', { name: 'Delete message' })
    expect(button.className).toContain('bg-sf-danger-fill')
    expect(button.className).not.toContain('bg-sf-accent-fill')
  })

  it('the white compose button (New task, New message) is ink in dark (UX Phase 3, 3.6)', () => {
    render(<IconButton label="New message" icon={IconStar} tone="compose" />)
    const button = screen.getByRole('button', { name: 'New message' })
    expect(button.className).toContain('bg-sf-white')
    expect(button.className).toContain('dark:bg-sf-ink-700')
    expect(button.className).toContain('dark:text-sf-white')
  })

  it('an icon button is named by its label and reports pressed and shortcut', () => {
    render(<IconButton label="Star channel" icon={IconStar} pressed shortcut={['⌘', 'K']} />)
    const button = screen.getByRole('button', { name: 'Star channel' })
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.getAttribute('aria-keyshortcuts')).toBe('Meta+K')
  })

  it('requires a label at the type level', () => {
    // @ts-expect-error an icon-only button without a label must not compile
    render(<IconButton icon={IconDots} />)
  })
})

describe('Tooltip', () => {
  it('shows after the hover delay, at once on keyboard focus, and hides on Escape', () => {
    vi.useFakeTimers()
    render(
      <Tooltip label="Full date" describe>
        <button type="button">3:02 PM</button>
      </Tooltip>,
    )
    const trigger = screen.getByRole('button')
    const tip = document.getElementById(trigger.getAttribute('aria-describedby')!)!
    expect(tip.hidden).toBe(true)
    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' })
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS - 1))
    expect(tip.hidden).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(tip.hidden).toBe(false)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(tip.hidden).toBe(true)
    vi.useRealTimers()
  })
})

describe('Avatar', () => {
  it('uses two initials, names the person and their presence', () => {
    expect(initials('Hossam Gaber Ali')).toBe('HG')
    render(<Avatar id="u-1" name="Hossam Gaber" presence="active" />)
    expect(screen.getByRole('img', { name: 'Hossam Gaber, active' }).textContent).toBe('HG')
  })

  it('has no dot when offline and is hidden when decorative', () => {
    const { container } = render(<Avatar id="u-2" name="Sara" presence="offline" decorative />)
    expect(container.querySelector('[data-presence]')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('a facepile shows the first people and the rest as +N', () => {
    const people = ['A', 'B', 'C', 'D', 'E'].map((n) => ({ id: n, name: n }))
    render(<Facepile people={people} label="5 members" />)
    expect(screen.getByRole('img', { name: '5 members' }).textContent).toBe('ABC+2')
  })
})

describe('Badge, Tag, Kbd', () => {
  it('a count reads its label and caps at 99+', () => {
    render(<Count value={120} label="mentions" />)
    expect(screen.getByText('99+').textContent).toBe('99+ mentions')
  })

  it('renders tags and kbd chips', () => {
    render(
      <>
        <Tag tone="accent">Guest</Tag>
        <Kbd>K</Kbd>
      </>,
    )
    expect(screen.getByText('Guest').className).toContain('text-sf-accent')
    expect(screen.getByText('K').tagName).toBe('KBD')
  })
})

describe('Toggle and Checkbox', () => {
  function Both() {
    const [on, setOn] = useState(false)
    const [checked, setChecked] = useState(false)
    return (
      <>
        <Toggle checked={on} onChange={setOn} label="Mute channel" />
        <Checkbox checked={checked} onChange={setChecked}>
          Also send to #backend
        </Checkbox>
      </>
    )
  }

  it('a toggle is a switch that flips aria-checked', () => {
    render(<Both />)
    const toggle = screen.getByRole('switch', { name: 'Mute channel' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
  })

  it('a checkbox is a native input named by its label', () => {
    render(<Both />)
    const box = screen.getByRole('checkbox', { name: 'Also send to #backend' }) as HTMLInputElement
    fireEvent.click(screen.getByText('Also send to #backend'))
    expect(box.checked).toBe(true)
  })
})

describe('Modal header and Tabs counts (spec 6.10)', () => {
  it('a modal can carry actions beside its title, before ×, and a title that is more than text', async () => {
    const { Modal } = await import('./Modal')
    render(
      <Modal open onClose={vi.fn()} title={<span># backend</span>} actions={<button type="button">Star channel</button>}>
        <p>Body</p>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: '# backend' })
    const buttons = [...dialog.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(buttons).toEqual(['Star channel', 'Close'])
  })

  it('a tab can show a count, read with its name', async () => {
    const { Tabs } = await import('./Tabs')
    render(<Tabs label="Channel details" tabs={[{ id: 'about', label: 'About' }, { id: 'members', label: 'Members', count: 4 }]} tab="about" onChange={vi.fn()} panelId="p" />)
    expect(screen.getByRole('tab', { name: 'Members 4' })).toBeTruthy()
  })
})
