import { expect, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

/**
 * For browser tests (slice AA): clicks into a rich editor and waits until it has the caret, so no keystroke lands before
 * it does. Under a full parallel run the first keys could go nowhere, and an autocomplete list never opened.
 */
export async function focusEditor(editor: HTMLElement) {
  await userEvent.click(editor)
  await vi.waitFor(() => expect(document.activeElement).toBe(editor))
  await vi.waitFor(() => expect(Boolean(window.getSelection()?.anchorNode && editor.contains(window.getSelection()!.anchorNode))).toBe(true))
}
