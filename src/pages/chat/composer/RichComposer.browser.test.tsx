import '@/index.css'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import type { User } from '@/api/types'
import { bodyText, type Body } from '@/lib/messageBody'
import { RichComposer, type ComposerDirectory } from '@/pages/chat/composer/RichComposer'

// A real browser: the editor needs real keyboard events, selection and layout.

afterEach(cleanup)
// The list opens after the editor's update; give it time when the whole suite is running.
const LIST_WAIT = { timeout: 3000 }

const directory: ComposerDirectory = {
  users: [
    { id: 'u-1', name: 'Youssef Abdelrahman', title: 'Managing Director', presence: 'active' },
    { id: 'u-2', name: 'Nour El-Sayed', title: 'Backend lead', presence: 'away' },
    { id: 'u-3', name: 'Mariam Fathy', title: 'Frontend', presence: 'offline' },
  ] as User[],
  projects: [{ key: 'NEX', name: 'Nexus Core' }],
  tasks: [{ key: 'NEX-103', title: 'Rate limit the search API' }],
  channels: [
    { id: 'c-backend', name: 'backend' },
    { id: 'c-general', name: 'general' },
  ],
  memberIds: ['u-1', 'u-2'],
}

function mount(props: Partial<Parameters<typeof RichComposer>[0]> = {}) {
  const onSend = vi.fn(async (_body: Body) => {})
  const onDraft = vi.fn()
  render(
    <div className="sf" style={{ width: 720, paddingTop: 320 }}>
      <RichComposer placeholder="Message #backend" onSend={onSend} onDraft={onDraft} directory={directory} {...props} />
    </div>,
  )
  const editor = screen.getByRole('textbox', { name: 'Message #backend' })
  return { onSend, onDraft, editor }
}

/** Mounts and waits until Lexical has taken the editable over, so no keystroke lands before it listens. */
async function ready(props: Partial<Parameters<typeof RichComposer>[0]> = {}) {
  const mounted = mount(props)
  await vi.waitFor(() => expect(mounted.editor.getAttribute('data-lexical-editor')).toBe('true'))
  return mounted
}

const sentText = (spy: ReturnType<typeof vi.fn>) => bodyText(spy.mock.calls.at(-1)![0] as Body)

describe('RichComposer keys (spec 6.8)', () => {
  it('Enter sends and the box clears; Shift+Enter makes a new line', async () => {
    const { onSend, editor } = await ready()
    await userEvent.click(editor)
    await userEvent.keyboard('first{Shift>}{Enter}{/Shift}second')
    expect(onSend).not.toHaveBeenCalled()
    await userEvent.keyboard('{Enter}')
    expect(onSend).toHaveBeenCalledOnce()
    expect(sentText(onSend)).toBe('first\nsecond')
    await vi.waitFor(() => expect(editor.textContent).toBe(''))
  })

  it('an empty box does not send, and Send is off until there is text', async () => {
    const { onSend, editor } = await ready()
    const send = screen.getByRole('button', { name: 'Send' })
    expect((send as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(editor)
    await userEvent.keyboard('{Enter}')
    expect(onSend).not.toHaveBeenCalled()
    await userEvent.keyboard('hi')
    expect((send as HTMLButtonElement).disabled).toBe(false)
  })

  it('Enter during IME composition never sends (spec 6.8 AC)', async () => {
    const { onSend, editor } = await ready()
    await userEvent.click(editor)
    await userEvent.keyboard('مرحبا')
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }))
    expect(onSend).not.toHaveBeenCalled()
  })
})

describe('RichComposer formatting (spec 6.8)', () => {
  it('autoformats *bold*, _italic_, ~strike~ and `code` as you type', async () => {
    const { onSend, editor } = await ready()
    await userEvent.click(editor)
    await userEvent.keyboard('*bold* _it_ ~gone~ `x` done{Enter}')
    expect(onSend.mock.calls[0][0]).toEqual([
      {
        type: 'p',
        children: [
          { type: 'text', text: 'bold', marks: ['b'] },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'it', marks: ['i'] },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'gone', marks: ['s'] },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'x', marks: ['code'] },
          { type: 'text', text: ' done' },
        ],
      },
    ])
  })

  it('autoformats "- " into a list and "> " into a quote', async () => {
    const { onSend, editor } = await ready()
    await userEvent.click(editor)
    await userEvent.keyboard('- one{Shift>}{Enter}{/Shift}two{Enter}')
    expect(onSend.mock.calls[0][0]).toEqual([{ type: 'ul', items: [[{ type: 'text', text: 'one' }], [{ type: 'text', text: 'two' }]] }])
  })

  it('the formatting row applies bold and shows it pressed', async () => {
    const { onSend, editor } = await ready()
    await userEvent.click(editor)
    const bold = screen.getByRole('button', { name: 'Bold' })
    await userEvent.click(bold)
    await userEvent.keyboard('loud')
    expect(bold.getAttribute('aria-pressed')).toBe('true')
    await userEvent.keyboard('{Enter}')
    expect(onSend.mock.calls[0][0]).toEqual([{ type: 'p', children: [{ type: 'text', text: 'loud', marks: ['b'] }] }])
  })
})

describe('RichComposer autocomplete (spec 6.8)', () => {
  it('@ offers people; Enter picks one instead of sending, and it becomes a pill', async () => {
    const { onSend, editor } = await ready()
    await userEvent.click(editor)
    await userEvent.keyboard('Hi @nou')
    const list = await screen.findByRole('listbox', { name: 'Mention someone' }, LIST_WAIT)
    expect(list.textContent).toContain('Nour El-Sayed')
    await userEvent.keyboard('{Enter}')
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).toBeNull()
    await userEvent.keyboard('{Enter}')
    expect(onSend.mock.calls[0][0]).toEqual([
      { type: 'p', children: [{ type: 'text', text: 'Hi ' }, { type: 'user', id: 'u-2', name: 'Nour El-Sayed' }, { type: 'text', text: ' ' }] },
    ])
  })

  it('says when someone is not in this channel', async () => {
    const { editor } = await ready()
    await userEvent.click(editor)
    await userEvent.keyboard('@mar')
    const list = await screen.findByRole('listbox', { name: 'Mention someone' }, LIST_WAIT)
    expect(list.textContent).toContain('Not in this channel')
  })

  it('# offers channels; Tab picks', async () => {
    const { onSend, editor } = await ready()
    await userEvent.click(editor)
    await userEvent.keyboard('see #back')
    await screen.findByRole('listbox', { name: 'Link a channel' }, LIST_WAIT)
    await userEvent.keyboard('{Tab}{Enter}')
    expect((onSend.mock.calls[0][0] as Body)[0]).toMatchObject({ children: expect.arrayContaining([{ type: 'channel', id: 'c-backend', name: 'backend' }]) })
  })

  it('Escape closes the list, and then Enter sends the text as typed', async () => {
    const { onSend, editor } = await ready()
    await userEvent.click(editor)
    await userEvent.keyboard('@nou')
    await screen.findByRole('listbox', {}, LIST_WAIT)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    await userEvent.keyboard('{Enter}')
    expect(sentText(onSend)).toBe('@nou')
  })
})

describe('RichComposer drafts and limits (spec 6.8)', () => {
  it('starts from a draft and saves changes after 500ms', async () => {
    const { onDraft, editor } = await ready({ initialBody: [{ type: 'p', children: [{ type: 'text', text: 'half a thought' }] }] })
    expect(editor.textContent).toBe('half a thought')
    await userEvent.click(editor)
    await userEvent.keyboard('{End}!')
    expect(onDraft).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(onDraft).toHaveBeenCalled(), { timeout: 1500 })
    expect(bodyText(onDraft.mock.calls.at(-1)![0])).toBe('half a thought!')
  })

  it('counts down in the last 1,000 characters and won’t send past 40,000', async () => {
    const { onSend, editor } = await ready({ initialBody: [{ type: 'p', children: [{ type: 'text', text: 'x'.repeat(39_500) }] }] })
    expect(screen.getByText('500')).toBeTruthy()
    cleanup()
    const over = await ready({ initialBody: [{ type: 'p', children: [{ type: 'text', text: 'x'.repeat(40_010) }] }] })
    expect(screen.getByText('-10')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(over.editor)
    await userEvent.keyboard('{Enter}')
    expect(over.onSend).not.toHaveBeenCalled()
    expect(onSend).not.toHaveBeenCalled()
    void editor
  })
})
