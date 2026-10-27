// @vitest-environment jsdom
import { IconBell, IconBookmark, IconClock, IconDots, IconTrash } from '@tabler/icons-react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button, IconButton } from './Button'
import { Menu, MenuItem, MenuSeparator, Submenu } from './Menu'
import { Modal } from './Modal'
import { TOAST_MS, ToastProvider, ToastRegion, useToast } from './Toast'
import { TokenInput, type Suggestion, type Token } from './TokenInput'

afterEach(cleanup)

function MessageMenu({ onSave = () => {}, onRemind = () => {} }: { onSave?: () => void; onRemind?: () => void }) {
  return (
    <Menu label="Message actions" trigger={(props) => <IconButton label="More actions" icon={IconDots} {...props} />}>
      <MenuItem icon={IconBookmark} hint="S" onSelect={onSave}>
        Save
      </MenuItem>
      <Submenu icon={IconClock} label="Remind me">
        <MenuItem onSelect={onRemind}>In 20 minutes</MenuItem>
        <MenuItem>In 1 hour</MenuItem>
      </Submenu>
      <MenuSeparator />
      <MenuItem icon={IconTrash} danger>
        Delete message
      </MenuItem>
    </Menu>
  )
}

const focused = () => document.activeElement?.textContent

describe('Menu', () => {
  it('opens on the trigger, moves with the arrow keys and wraps', () => {
    render(<MessageMenu />)
    const trigger = screen.getByRole('button', { name: 'More actions' })
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('menu', { name: 'Message actions' })).toBeTruthy()
    expect(focused()).toBe('SaveS')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(focused()).toBe('Remind me')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(focused()).toBe('SaveS')
    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    expect(focused()).toBe('Delete message')
  })

  it('focuses the first item only once the panel is placed (a hidden panel cannot take focus)', () => {
    render(<MessageMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    const menu = screen.getByRole('menu', { name: 'Message actions' })
    expect(menu.style.visibility).not.toBe('hidden')
    expect(menu.contains(document.activeElement)).toBe(true)
  })

  it('jumps to the item that starts with a typed letter', () => {
    render(<MessageMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.keyDown(document.activeElement!, { key: 'd' })
    expect(focused()).toBe('Delete message')
  })

  it('opens a submenu with ArrowRight and closes it with ArrowLeft, then Escape closes the menu to the trigger', () => {
    render(<MessageMenu />)
    const trigger = screen.getByRole('button', { name: 'More actions' })
    fireEvent.click(trigger)
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    expect(screen.getByRole('menu', { name: 'Remind me' })).toBeTruthy()
    expect(focused()).toBe('In 20 minutes')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    expect(screen.queryByRole('menu', { name: 'Remind me' })).toBeNull()
    expect(focused()).toBe('Remind me')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('Escape in a submenu closes only the submenu', () => {
    render(<MessageMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Remind me' })).toBeNull()
    expect(screen.getByRole('menu', { name: 'Message actions' })).toBeTruthy()
  })

  it('selecting an item, also in a submenu, runs it and closes every level', () => {
    const onRemind = vi.fn()
    render(<MessageMenu onRemind={onRemind} />)
    const trigger = screen.getByRole('button', { name: 'More actions' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remind me' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'In 20 minutes' }))
    expect(onRemind).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('keeps Tab inside and closes on a press outside', () => {
    render(<MessageMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true })
    expect(focused()).toBe('Delete message')
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

function InviteModal() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add people</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add people to #backend"
        description="They can read everything in the channel."
        footer={<Button variant="primary">Add</Button>}
      >
        <input aria-label="Names or emails" />
      </Modal>
    </>
  )
}

describe('Modal', () => {
  it('is a named modal dialog that focuses its first field and traps Tab', () => {
    render(<InviteModal />)
    fireEvent.click(screen.getByRole('button', { name: 'Add people' }))
    const dialog = screen.getByRole('dialog', { name: 'Add people to #backend' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByRole('dialog', { description: 'They can read everything in the channel.' })).toBe(dialog)
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Names or emails' }))
    screen.getByRole('button', { name: 'Add' }).focus()
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
  })

  it('closes on Escape and gives focus back to the opener; a scrim click does not close it', () => {
    render(<InviteModal />)
    const opener = screen.getByRole('button', { name: 'Add people' })
    opener.focus()
    fireEvent.click(opener)
    fireEvent.pointerDown(screen.getByRole('dialog').parentElement!)
    fireEvent.click(screen.getByRole('dialog').parentElement!)
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})

function DeleteWithUndo({ onUndo }: { onUndo: () => void }) {
  const show = useToast()
  return (
    <div style={{ position: 'relative' }}>
      <Button onClick={() => show({ message: 'Message deleted', icon: IconBell, action: { label: 'Undo', onAction: onUndo } })}>
        Delete
      </Button>
      <ToastRegion />
    </div>
  )
}

describe('Toast', () => {
  it('announces in a status region, runs Undo and closes after 5s unless hovered', () => {
    vi.useFakeTimers()
    const onUndo = vi.fn()
    render(
      <ToastProvider>
        <DeleteWithUndo onUndo={onUndo} />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const region = screen.getByRole('status')
    expect(region.textContent).toContain('Message deleted')
    fireEvent.pointerEnter(screen.getByText('Message deleted').parentElement!)
    act(() => vi.advanceTimersByTime(TOAST_MS * 2))
    expect(region.textContent).toContain('Message deleted')
    fireEvent.pointerLeave(screen.getByText('Message deleted').parentElement!)
    act(() => vi.advanceTimersByTime(TOAST_MS - 1))
    expect(region.textContent).toContain('Message deleted')
    act(() => vi.advanceTimersByTime(1))
    expect(region.textContent).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onUndo).toHaveBeenCalledOnce()
    expect(region.textContent).toBe('')
    vi.useRealTimers()
  })
})

const people: Suggestion[] = [
  { id: 'u-1', label: 'Hossam Gaber', person: true },
  { id: 'u-2', label: 'Hala Nabil', person: true },
]

function Invite({ onCommit = () => {} }: { onCommit?: (t: string) => void }) {
  const [tokens, setTokens] = useState<Token[]>([{ id: 'u-3', label: 'Sara Adel', person: true }])
  const [query, setQuery] = useState('')
  return (
    <TokenInput
      label="Names or emails"
      tokens={tokens}
      onRemove={(id) => setTokens((t) => t.filter((x) => x.id !== id))}
      onAdd={(s) => setTokens((t) => [...t, s])}
      onCommit={onCommit}
      query={query}
      onQueryChange={setQuery}
      suggestions={people.filter((p) => p.label.toLowerCase().startsWith(query.toLowerCase()))}
    />
  )
}

describe('TokenInput', () => {
  it('suggests through a listbox with aria-activedescendant and adds the highlighted one on Enter', () => {
    render(<Invite />)
    const field = screen.getByRole('combobox', { name: 'Names or emails' })
    fireEvent.focus(field)
    fireEvent.change(field, { target: { value: 'h' } })
    expect(field.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(field, { key: 'ArrowDown' })
    const active = document.getElementById(field.getAttribute('aria-activedescendant')!)!
    expect(active.textContent).toContain('Hala Nabil')
    expect(active.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(screen.getByRole('button', { name: 'Remove Hala Nabil' })).toBeTruthy()
    expect((field as HTMLInputElement).value).toBe('')
  })

  it('commits typed text with no match, and Backspace in an empty field removes the last chip', () => {
    const onCommit = vi.fn()
    render(<Invite onCommit={onCommit} />)
    const field = screen.getByRole('combobox')
    fireEvent.focus(field)
    fireEvent.change(field, { target: { value: 'x@y.com' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('x@y.com')
    fireEvent.keyDown(field, { key: 'Backspace' })
    expect(screen.queryByRole('button', { name: 'Remove Sara Adel' })).toBeNull()
  })
})
