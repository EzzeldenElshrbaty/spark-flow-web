import '@/index.css'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { inputClass, selectClass } from '@/components/ui/Field'
import { RichComposer, type ComposerDirectory } from '@/pages/chat/composer/RichComposer'

// Pinch zoom is on (index.html), so iPhone Safari also zooms the page in whenever a text box under 16px takes focus.
// On a phone every text box is 16px; from the sm breakpoint (640px) up they keep their 14px.

afterEach(async () => {
  cleanup()
  await page.viewport(414, 896)
})

const directory: ComposerDirectory = { users: [], projects: [], tasks: [], channels: [], memberIds: [] }

async function fontSizes() {
  render(
    <div className="sf">
      <input aria-label="Name" className={inputClass} />
      <textarea aria-label="Notes" className={inputClass} />
      <select aria-label="Status" className={selectClass}>
        <option>Open</option>
      </select>
      <RichComposer placeholder="Message #backend" onSend={async () => {}} directory={directory} />
    </div>,
  )
  const size = (el: Element) => getComputedStyle(el).fontSize
  return {
    input: size(screen.getByRole('textbox', { name: 'Name' })),
    textarea: size(screen.getByRole('textbox', { name: 'Notes' })),
    select: size(screen.getByRole('combobox', { name: 'Status' })),
    composer: size(screen.getByRole('textbox', { name: 'Message #backend' })),
    placeholder: size(await screen.findByText('Message #backend')),
  }
}

describe('text box size on phones (iPhone zooms in on focus under 16px)', () => {
  it('on a phone inputs, textareas, selects and the chat composer are 16px, its placeholder too', async () => {
    await page.viewport(390, 844)
    expect(await fontSizes()).toEqual({ input: '16px', textarea: '16px', select: '16px', composer: '16px', placeholder: '16px' })
  })

  it('from the sm breakpoint up they keep their 14px', async () => {
    await page.viewport(640, 800)
    expect(await fontSizes()).toEqual({ input: '14px', textarea: '14px', select: '14px', composer: '14px', placeholder: '14px' })
  })
})
