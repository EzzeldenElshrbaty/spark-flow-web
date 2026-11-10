// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Pencil, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { RowMenu } from '@/components/RowMenu'
import { MenuPanel, menuItemClass, menuStep } from './Menu'
import { Sheet, SheetCancelButton } from './Sheet'

window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

afterEach(cleanup)

describe('menuStep (UX Phase 5A, 5.5)', () => {
  const [a, b, c] = ['a', 'b', 'c']
  it('moves down and up round the ends, jumps to the ends, and ignores other keys', () => {
    expect(menuStep([a, b, c], a, 'ArrowDown')).toBe(b)
    expect(menuStep([a, b, c], c, 'ArrowDown')).toBe(a)
    expect(menuStep([a, b, c], a, 'ArrowUp')).toBe(c)
    expect(menuStep([a, b, c], b, 'Home')).toBe(a)
    expect(menuStep([a, b, c], b, 'End')).toBe(c)
    expect(menuStep([a, b, c], null, 'ArrowDown')).toBe(a)
    expect(menuStep([a, b, c], a, 'x')).toBeNull()
    expect(menuStep([], null, 'ArrowDown')).toBeNull()
  })
})

function Panel() {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <div className="relative">
      <button ref={triggerRef} onClick={() => setOpen(true)}>
        More
      </button>
      <MenuPanel open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} label="More">
        <button role="menuitem" className={menuItemClass}>
          Rename
        </button>
        <button role="menuitem" className={menuItemClass} disabled>
          Archive
        </button>
        <button role="menuitem" className={menuItemClass}>
          Delete
        </button>
      </MenuPanel>
    </div>
  )
}

describe('MenuPanel keys (UX Phase 5A, 5.5)', () => {
  it('↓ and ↑ move between enabled items round the ends; Home and End jump', () => {
    render(<Panel />)
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    const rename = screen.getByRole('menuitem', { name: 'Rename' })
    const del = screen.getByRole('menuitem', { name: 'Delete' })
    expect(document.activeElement).toBe(rename)
    fireEvent.keyDown(rename, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(del)
    fireEvent.keyDown(del, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(rename)
    fireEvent.keyDown(rename, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(del)
    fireEvent.keyDown(del, { key: 'Home' })
    expect(document.activeElement).toBe(rename)
    fireEvent.keyDown(rename, { key: 'End' })
    expect(document.activeElement).toBe(del)
  })
})

describe('a pick gives focus back to the menu’s button (UX Phase 5A, 5.5)', () => {
  function Row() {
    const [renaming, setRenaming] = useState(false)
    return (
      <main>
        <h1>Roles</h1>
        <RowMenu
          label="More for Sales"
          items={[
            { label: 'Rename', icon: Pencil, onSelect: () => setRenaming(true) },
            { label: 'Delete', icon: Trash2, onSelect: () => {} },
          ]}
        />
        {renaming && (
          <Sheet open title="Rename role" onClose={() => setRenaming(false)} footer={<SheetCancelButton />}>
            <input aria-label="Name" />
          </Sheet>
        )}
      </main>
    )
  }

  it('after a pick focus is on the ⋯ button, and a sheet the pick opened gives focus back to it', () => {
    render(<Row />)
    const more = screen.getByRole('button', { name: 'More for Sales' })
    fireEvent.click(more)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(document.activeElement).toBe(more)
    fireEvent.click(more)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(document.activeElement).toBe(more)
  })
})
