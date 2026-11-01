// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JumpDateDialog } from '@/pages/chat/JumpDateDialog'

afterEach(cleanup)
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const show = () => {
  const onJump = vi.fn()
  const onClose = vi.fn()
  render(<JumpDateDialog today={new Date(2026, 9, 28, 15, 30)} onJump={onJump} onClose={onClose} />)
  return { onJump, onClose, dialog: within(screen.getByRole('dialog', { name: 'Jump to a date' })) }
}

describe('Jump to a specific date… (spec 6.2)', () => {
  it('jumps to the day picked, up to today', () => {
    const { onJump, onClose, dialog } = show()
    const input = dialog.getByLabelText('Date') as HTMLInputElement
    expect(input.max).toBe('2026-10-28')
    fireEvent.change(input, { target: { value: '2026-10-20' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Jump' }))
    expect(onJump).toHaveBeenCalledWith({ date: '2026-10-20' })
    expect(onClose).toHaveBeenCalled()
  })

  it('a day after today, or none, says what to pick', () => {
    const { onJump, dialog } = show()
    fireEvent.click(dialog.getByRole('button', { name: 'Jump' }))
    expect(dialog.getByText('Pick a day.')).toBeTruthy()
    fireEvent.change(dialog.getByLabelText('Date'), { target: { value: '2026-11-02' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Jump' }))
    expect(dialog.getByText('Pick a day up to today.')).toBeTruthy()
    expect(onJump).not.toHaveBeenCalled()
  })
})
