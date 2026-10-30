import '@/index.css'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Button } from '@/components/sf/Button'
import { Menu, MenuItem } from '@/components/sf/Menu'
import { Modal } from '@/components/sf/Modal'
import { Popover } from '@/components/sf/Popover'

// Real hit-testing: a menu opened from a dialog must be on top of it, or clicks land on the dialog.

afterEach(cleanup)

describe('layers: a menu or popover opened inside a modal (spec 6.10, 6.5)', () => {
  it('is above the modal, so its items can be clicked', async () => {
    const onSelect = vi.fn()
    render(
      <div className="sf">
        <Modal open onClose={() => {}} title="Create a text snippet">
          <Menu label="Snippet type" trigger={(props) => <Button {...props}>Type</Button>}>
            <MenuItem onSelect={onSelect}>SQL</MenuItem>
          </Menu>
          <Popover label="Pick" trigger={(props) => <Button {...props}>Pick</Button>}>
            {() => <button type="button">Inside the popover</button>}
          </Popover>
        </Modal>
      </div>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Type' }))
    const item = screen.getByRole('menuitem', { name: 'SQL' })
    const box = item.getBoundingClientRect()
    expect(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('[role="menuitem"]')).toBe(item)
    await userEvent.click(item)
    expect(onSelect).toHaveBeenCalledOnce()

    await userEvent.click(screen.getByRole('button', { name: 'Pick' }))
    const inside = screen.getByRole('button', { name: 'Inside the popover' })
    const at = inside.getBoundingClientRect()
    expect(document.elementFromPoint(at.x + at.width / 2, at.y + at.height / 2)).toBe(inside)
  })
})
