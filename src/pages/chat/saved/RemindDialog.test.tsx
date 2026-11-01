// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemindDialog } from '@/pages/chat/saved/RemindDialog'

afterEach(cleanup)
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const show = (onSet = vi.fn(async (_text: string, _at: Date) => {})) => {
  const onClose = vi.fn()
  render(<RemindDialog initialText="check the deploy" where="#backend" onSet={onSet} onClose={onClose} />)
  return { onSet, onClose, dialog: within(screen.getByRole('dialog', { name: 'Set a reminder' })) }
}

describe('/remind: Set a reminder (spec 6.8)', () => {
  it('starts with the words typed after /remind and In 20 minutes', () => {
    const { dialog } = show()
    expect((dialog.getByRole('textbox', { name: 'What' }) as HTMLInputElement).value).toBe('check the deploy')
    expect((dialog.getByRole('radio', { name: 'In 20 minutes' }) as HTMLInputElement).checked).toBe(true)
    expect(dialog.getAllByRole('radio').map((r) => r.getAttribute('aria-label') ?? r.closest('label')?.textContent)).toHaveLength(6)
  })

  it('Set reminder hands over the words and the time picked', async () => {
    const { onSet, dialog } = show()
    fireEvent.click(dialog.getByRole('radio', { name: /^In 3 hours/ }))
    const before = Date.now()
    await act(async () => {
      fireEvent.click(dialog.getByRole('button', { name: 'Set reminder' }))
    })
    const [text, at] = onSet.mock.calls[0]!
    expect(text).toBe('check the deploy')
    expect(at.getTime() - before).toBeGreaterThan(179 * 60_000)
    expect(at.getTime() - before).toBeLessThan(181 * 60_000)
  })

  it('needs words, and a custom time in the future', () => {
    const { dialog } = show()
    fireEvent.change(dialog.getByRole('textbox', { name: 'What' }), { target: { value: ' ' } })
    expect((dialog.getByRole('button', { name: 'Set reminder' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(dialog.getByRole('textbox', { name: 'What' }), { target: { value: 'x' } })
    fireEvent.click(dialog.getByRole('radio', { name: 'Custom…' }))
    fireEvent.change(dialog.getByLabelText('Date and time'), { target: { value: '2001-01-01T09:00' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Set reminder' }))
    expect(dialog.getByText('Pick a time in the future.')).toBeTruthy()
  })

  it('a refusal keeps the dialog and says why', async () => {
    const { dialog } = show(vi.fn(async () => Promise.reject(new Error("You can't see this channel."))))
    await act(async () => {
      fireEvent.click(dialog.getByRole('button', { name: 'Set reminder' }))
    })
    expect(dialog.getByText("You can't see this channel.")).toBeTruthy()
  })
})
