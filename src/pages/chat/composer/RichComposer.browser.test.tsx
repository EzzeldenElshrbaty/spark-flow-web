import '@/index.css'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import type { User } from '@/api/types'
import { bodyText, parseBody, type Body } from '@/lib/messageBody'
import { opensSearch } from '@/layout/searchShortcuts'
import { COMMANDS, type CommandOutcome, type ComposerSlash, type ParsedCommand } from '@/lib/slashCommands'
import { RichComposer, type ComposerDirectory } from '@/pages/chat/composer/RichComposer'
import { focusEditor } from '@/pages/chat/composer/focusEditor.testkit'
import { axeProblems } from '@/test/axe'

// A real browser: the editor needs real keyboard events, selection and layout.

afterEach(cleanup)
// The list opens after the editor's update; give it time when the whole suite is running.
const LIST_WAIT = { timeout: 3000 }

/**
 * Waits for the autocomplete list. In full runs only, Lexical's typeahead sometimes missed the browser's caret on the
 * last key (the text was there, the list wasn't), and opened only on the next update, as a person's next key would
 * give it. End, which moves nothing here, is that update (slice AA).
 */
async function openList(options: Parameters<typeof screen.findByRole>[1] = {}) {
  try {
    return await screen.findByRole('listbox', options, { timeout: 2000 })
  } catch {
    await userEvent.keyboard('{End}')
    return screen.findByRole('listbox', options, LIST_WAIT)
  }
}

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
  it('autoFocus puts the caret in the box, after the draft (Alt+↑/↓ land here)', async () => {
    const { editor } = await ready({ autoFocus: true, initialBody: parseBody('hello') })
    await vi.waitFor(() => expect(document.activeElement).toBe(editor))
    await userEvent.keyboard('!')
    expect(editor.textContent).toBe('hello!')
  })

  it('without it the box waits to be clicked', async () => {
    const { editor } = await ready()
    await new Promise((r) => setTimeout(r, 100))
    expect(document.activeElement).not.toBe(editor)
  })

  it('Enter sends and the box clears; Shift+Enter makes a new line', async () => {
    const { onSend, editor } = await ready()
    await focusEditor(editor)
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
    await focusEditor(editor)
    await userEvent.keyboard('{Enter}')
    expect(onSend).not.toHaveBeenCalled()
    await userEvent.keyboard('hi')
    expect((send as HTMLButtonElement).disabled).toBe(false)
  })

  it('Enter during IME composition never sends (spec 6.8 AC)', async () => {
    const { onSend, editor } = await ready()
    await focusEditor(editor)
    await userEvent.keyboard('مرحبا')
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }))
    expect(onSend).not.toHaveBeenCalled()
  })
})

describe('RichComposer formatting (spec 6.8)', () => {
  it('autoformats *bold*, _italic_, ~strike~ and `code` as you type', async () => {
    const { onSend, editor } = await ready()
    await focusEditor(editor)
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

  it('autoformats "- " into a list', async () => {
    const { onSend, editor } = await ready()
    await focusEditor(editor)
    await userEvent.keyboard('- one{Shift>}{Enter}{/Shift}two{Enter}')
    expect(onSend.mock.calls[0][0]).toEqual([{ type: 'ul', items: [[{ type: 'text', text: 'one' }], [{ type: 'text', text: 'two' }]] }])
  })

  it('autoformats "1. " into a numbered list', async () => {
    const { onSend, editor } = await ready()
    await focusEditor(editor)
    await userEvent.keyboard('1. first{Shift>}{Enter}{/Shift}second{Enter}')
    expect(onSend.mock.calls[0][0]).toEqual([{ type: 'ol', items: [[{ type: 'text', text: 'first' }], [{ type: 'text', text: 'second' }]] }])
  })

  it('autoformats "> " into a quote', async () => {
    const { onSend, editor } = await ready()
    await focusEditor(editor)
    await userEvent.keyboard('> said so{Enter}')
    expect(onSend.mock.calls[0][0]).toEqual([{ type: 'quote', children: [{ type: 'p', children: [{ type: 'text', text: 'said so' }] }] }])
  })

  it('autoformats a ``` fence into a code block', async () => {
    const { onSend, editor } = await ready()
    await focusEditor(editor)
    await userEvent.keyboard('``` x = 1')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    await vi.waitFor(() => expect(onSend).toHaveBeenCalled())
    expect(onSend.mock.calls[0][0]).toEqual([{ type: 'code', text: 'x = 1' }])
  })

  it('the formatting row applies bold and shows it pressed', async () => {
    const { onSend, editor } = await ready()
    await focusEditor(editor)
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
    await focusEditor(editor)
    await userEvent.keyboard('Hi @nou')
    const list = await openList({ name: 'Mention someone' })
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
    await focusEditor(editor)
    await userEvent.keyboard('@mar')
    const list = await openList({ name: 'Mention someone' })
    expect(list.textContent).toContain('Not in this channel')
  })

  it('# offers channels; Tab picks', async () => {
    const { onSend, editor } = await ready()
    await focusEditor(editor)
    await userEvent.keyboard('see #back')
    await openList({ name: 'Link a channel' })
    await userEvent.keyboard('{Tab}{Enter}')
    expect((onSend.mock.calls[0][0] as Body)[0]).toMatchObject({ children: expect.arrayContaining([{ type: 'channel', id: 'c-backend', name: 'backend' }]) })
  })

  it('Escape closes the list, and then Enter sends the text as typed', async () => {
    const { onSend, editor } = await ready()
    await focusEditor(editor)
    await userEvent.keyboard('@nou')
    await openList({})
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
    await focusEditor(editor)
    await userEvent.keyboard('{End}!')
    expect(onDraft).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(onDraft).toHaveBeenCalled(), { timeout: 1500 })
    expect(bodyText(onDraft.mock.calls.at(-1)![0])).toBe('half a thought!')
  })

  it('leaving the channel within 500ms of typing still saves what was typed', async () => {
    const { onDraft, editor } = await ready()
    await focusEditor(editor)
    await userEvent.keyboard('last words')
    cleanup()
    expect(onDraft).toHaveBeenCalledTimes(1)
    expect(bodyText(onDraft.mock.calls[0][0])).toBe('last words')
  })

  it('leaving with nothing new typed saves nothing', async () => {
    const { onDraft } = await ready({ initialBody: [{ type: 'p', children: [{ type: 'text', text: 'saved before' }] }] })
    cleanup()
    expect(onDraft).not.toHaveBeenCalled()
  })

  it('a draft that fails to save says so, tries again by itself, and clears the note once saved', async () => {
    const onDraft = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    const { editor } = await ready({ onDraft })
    await focusEditor(editor)
    await userEvent.keyboard('keep me')
    const note = await screen.findByText('Draft not saved. Trying again…', {}, { timeout: 2000 })
    expect(note).toBeTruthy()
    await vi.waitFor(() => expect(onDraft).toHaveBeenCalledTimes(2), { timeout: 6000 })
    expect(bodyText(onDraft.mock.calls[1][0])).toBe('keep me')
    await vi.waitFor(() => expect(screen.queryByText('Draft not saved. Trying again…')).toBeNull())
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

describe('RichComposer editing a message (spec 6.3 edit in place)', () => {
  const body: Body = [{ type: 'p', children: [{ type: 'text', text: 'first ' }, { type: 'text', text: 'draft', marks: ['b'] }] }]

  async function editing() {
    const onSend = vi.fn(async (_b: Body) => {})
    const onCancel = vi.fn()
    render(
      <div className="sf" style={{ width: 720 }}>
        <RichComposer mode="edit" placeholder="Edit message" initialBody={body} onSend={onSend} onCancel={onCancel} directory={directory} />
      </div>,
    )
    const editor = screen.getByRole('textbox', { name: 'Edit message' })
    await vi.waitFor(() => expect(editor.getAttribute('data-lexical-editor')).toBe('true'))
    return { onSend, onCancel, editor }
  }

  it('starts from the message, focused at the end, with Cancel, Save and the hint', async () => {
    const { editor } = await editing()
    expect(editor.textContent).toBe('first draft')
    await vi.waitFor(() => expect(document.activeElement).toBe(editor))
    expect(screen.getByText('Esc to cancel · Enter to save')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
  })

  it('Enter saves the edited body; the box is not cleared', async () => {
    const { onSend, editor } = await editing()
    await vi.waitFor(() => expect(document.activeElement).toBe(editor))
    await userEvent.keyboard('!{Enter}')
    expect(onSend).toHaveBeenCalledOnce()
    expect(bodyText(onSend.mock.calls[0][0])).toBe('first draft!')
    expect(editor.textContent).toBe('first draft!')
  })

  it('Escape cancels', async () => {
    const { onCancel, editor } = await editing()
    await vi.waitFor(() => expect(document.activeElement).toBe(editor))
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
  })
})

describe('RichComposer Up in an empty box (spec 6.8)', () => {
  it('asks to edit my last message only while the box is empty', async () => {
    const onEditLast = vi.fn()
    const { editor } = await ready({ onEditLast })
    await focusEditor(editor)
    await userEvent.keyboard('{ArrowUp}')
    expect(onEditLast).toHaveBeenCalledOnce()
    await userEvent.keyboard('text{ArrowUp}')
    expect(onEditLast).toHaveBeenCalledOnce()
  })

  it('leaves Up with Alt, Shift, Ctrl or Meta to the page (Alt+↑ is the previous channel)', async () => {
    const onEditLast = vi.fn()
    const { editor } = await ready({ onEditLast })
    const prevented: boolean[] = []
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp') prevented.push(event.defaultPrevented)
    }
    window.addEventListener('keydown', onKeyDown)
    try {
      await focusEditor(editor)
      for (const mod of ['Alt', 'Shift', 'Control', 'Meta']) await userEvent.keyboard(`{${mod}>}{ArrowUp}{/${mod}}`)
    } finally {
      window.removeEventListener('keydown', onKeyDown)
    }
    expect(onEditLast).not.toHaveBeenCalled()
    expect(prevented).toEqual([false, false, false, false])
  })
})

describe('RichComposer formatting row (spec 6.7, 6.8)', () => {
  it('a thread’s box starts without it; Aa shows it', async () => {
    await ready({ showFormatting: false })
    expect(screen.queryByRole('toolbar', { name: 'Formatting' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Show formatting' }))
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeTruthy()
  })

  it('the channel’s box starts with it', async () => {
    await ready()
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeTruthy()
  })
})


describe('files in the composer (spec 6.8 Attach menu, 6.9 tray, slice 6)', () => {
  const files = (over: Partial<NonNullable<Parameters<typeof RichComposer>[0]['files']>> = {}) => ({ tray: <div>The tray</div>, onAdd: vi.fn(), ready: 0, waiting: null, ...over })
  const picker = () => vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {})

  it('+ opens the Attach menu, whose Upload from your computer opens the file picker; ⌘U does too, not underline', async () => {
    const click = picker()
    const { editor } = await ready({ files: files() })
    expect(screen.getByText('The tray')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Attach' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Upload from your computer/ }))
    expect(click).toHaveBeenCalledOnce()
    expect((click.mock.contexts[0] as HTMLInputElement).type).toBe('file')
    await focusEditor(editor)
    await userEvent.keyboard('abc{Control>}a{/Control}{Control>}u{/Control}')
    expect(click).toHaveBeenCalledTimes(2)
    expect(editor.innerHTML).not.toContain('underline')
    click.mockRestore()
  })

  it('a pasted image becomes a file named after when it was pasted', async () => {
    const onAdd = vi.fn()
    const { editor } = await ready({ files: files({ onAdd }) })
    await focusEditor(editor)
    const data = new DataTransfer()
    data.items.add(new File(['png'], 'image.png', { type: 'image/png' }))
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalledOnce())
    const [added] = onAdd.mock.calls[0][0] as File[]
    expect(added.name).toMatch(/^Pasted image \d{4}-\d\d-\d\d at \d\d\.\d\d\.png$/)
    expect(editor.textContent).toBe('')
  })

  it('with files ready an empty box sends; while files go up, Send waits and says so', async () => {
    const { onSend } = await ready({ files: files({ ready: 1 }) })
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSend).toHaveBeenCalledOnce()
    expect(onSend.mock.calls[0][0]).toEqual([])
    cleanup()
    const waiting = await ready({ files: files({ ready: 1, waiting: 'Uploading 1 file…' }) })
    await userEvent.click(waiting.editor)
    await userEvent.keyboard('Here it is{Enter}')
    expect(waiting.onSend).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Uploading 1 file…')).toBeTruthy()
  })

  it('files dropped on the box are added, and the box says it takes them while they’re over it', async () => {
    const onAdd = vi.fn()
    const { editor } = await ready({ files: files({ onAdd }) })
    const box = editor.closest('[data-composer]')!
    const data = new DataTransfer()
    data.items.add(new File(['%PDF-1.4'], 'scope.pdf', { type: 'application/pdf' }))
    box.dispatchEvent(new DragEvent('dragenter', { dataTransfer: data, bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(screen.getByText('Drop to add files')).toBeTruthy())
    box.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalledOnce())
    expect((onAdd.mock.calls[0][0] as File[]).map((f) => f.name)).toEqual(['scope.pdf'])
    expect(screen.queryByText('Drop to add files')).toBeNull()
  })
})

describe('pasting from an office app (slice 6 review)', () => {
  it('a paste with text and a picture of it (Word, Excel) pastes the text, and adds no file', async () => {
    const onAdd = vi.fn()
    const { editor } = await ready({ files: { tray: null, onAdd, ready: 0, waiting: null } })
    await focusEditor(editor)
    const data = new DataTransfer()
    data.setData('text/plain', 'Q3\t120')
    data.setData('text/html', '<table><tr><td>Q3</td><td>120</td></tr></table>')
    data.items.add(new File(['png'], 'image.png', { type: 'image/png' }))
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(editor.textContent).toContain('Q3'))
    expect(onAdd).not.toHaveBeenCalled()
  })
})

describe('editing a message with files (slice 6 review)', () => {
  it('its text can be cleared and saved, as files alone can be sent', async () => {
    const { editor, onSend } = await ready({ mode: 'edit', initialBody: parseBody('Here'), allowEmpty: true, onCancel: vi.fn() })
    await focusEditor(editor)
    await userEvent.keyboard('{End}{Backspace}{Backspace}{Backspace}{Backspace}')
    await vi.waitFor(() => expect(editor.textContent).toBe(''))
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
    expect(save.disabled).toBe(false)
    await userEvent.click(save)
    expect(onSend).toHaveBeenCalledOnce()
  })
})

describe('RichComposer tooltips (spec 10: every icon-only button has one)', () => {
  it('Send says what it does, with its key', async () => {
    const { editor } = mount()
    await focusEditor(editor)
    await userEvent.keyboard('hi')
    await userEvent.hover(screen.getByRole('button', { name: 'Send' }))
    await vi.waitFor(() => expect(document.querySelector('[role="tooltip"]:not([hidden])')?.textContent).toContain('Send'), { timeout: 2000 })
  })
})

describe('RichComposer ⌘K (spec 6.8 and 10)', () => {
  it('⌘K in the composer opens the link row only: the page\'s search leaves it alone', async () => {
    const searched = vi.fn()
    const onKey = (e: KeyboardEvent) => opensSearch(e) && searched()
    document.addEventListener('keydown', onKey)
    try {
      const { editor } = mount()
      await focusEditor(editor)
      await userEvent.keyboard('abc{Shift>}{ArrowLeft}{ArrowLeft}{ArrowLeft}{/Shift}')
      await userEvent.keyboard('{ControlOrMeta>}k{/ControlOrMeta}')
      const field = await screen.findByRole('textbox', { name: 'Link address' })
      expect(document.activeElement).toBe(field)
      expect(searched).not.toHaveBeenCalled()
    } finally {
      document.removeEventListener('keydown', onKey)
    }
  })
})

describe('RichComposer metrics (spec 6.8, reference .sf-cbar, .sf-send, .sf-plus, .sf-fmtbar, .sf-editor)', () => {
  /** The computed colour of a chat token, read off a probe inside the composer's .sf scope. */
  const token = (name: string) => {
    const probe = document.createElement('span')
    probe.style.color = `var(${name})`
    document.querySelector('.sf')!.appendChild(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  }
  const files = { tray: null, onAdd: vi.fn(), ready: 0, waiting: null }

  it('Send is 28px tall and 36px wide with a 16px icon; the action row is padded 0 8 8 4', async () => {
    const { editor } = mount({ files })
    await focusEditor(editor)
    await userEvent.keyboard('Hi')
    const send = screen.getByRole('button', { name: 'Send' })
    const box = send.getBoundingClientRect()
    expect([box.height, box.width]).toEqual([28, 36])
    expect(send.querySelector('svg')!.getAttribute('width')).toBe('16')
    const row = getComputedStyle(send.closest('div.ms-auto')!.parentElement!)
    expect([row.paddingTop, row.paddingRight, row.paddingBottom, row.paddingLeft]).toEqual(['0px', '8px', '8px', '4px'])
  })

  it('+ is a round surface-hover pill, and inverts (text fill) while its menu is open', async () => {
    mount({ files })
    const plus = screen.getByRole('button', { name: 'Attach' })
    expect(getComputedStyle(plus).borderRadius).toBe('9999px')
    expect(getComputedStyle(plus).backgroundColor).toBe(token('--surface-hover'))
    expect(getComputedStyle(plus).color).toBe(token('--text'))
    await userEvent.click(plus)
    await vi.waitFor(() => expect(getComputedStyle(screen.getByRole('button', { name: 'Attach' })).backgroundColor).toBe(token('--text')))
    expect(getComputedStyle(screen.getByRole('button', { name: 'Attach' })).color).toBe(token('--surface'))
    await userEvent.keyboard('{Escape}')
  })

  it('formatting icons go from text-muted to text-secondary while the composer has focus', async () => {
    const { editor } = mount()
    const bold = screen.getByRole('button', { name: 'Bold' })
    expect(getComputedStyle(bold).color).toBe(token('--text-muted'))
    await focusEditor(editor)
    await vi.waitFor(() => expect(getComputedStyle(bold).color).toBe(token('--text-secondary')))
  })

  it('the editor grows to half the window at most (50vh)', () => {
    const { editor } = mount()
    expect(getComputedStyle(editor).maxHeight).toBe(`${innerHeight / 2}px`)
  })
})

describe('Schedule send (spec 6.8: the Send chevron opens Schedule)', () => {
  it('the chevron offers Tomorrow and Monday at 9:00 AM, Custom time… and the time zone note', async () => {
    const onSchedule = vi.fn(async () => {})
    const { editor } = await ready({ onSchedule })
    await focusEditor(editor)
    await userEvent.keyboard('Standup notes')
    await userEvent.click(screen.getByRole('button', { name: 'Schedule message' }))
    const menu = screen.getByRole('menu', { name: 'Schedule message' })
    expect([...menu.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent)).toEqual(['Tomorrow at 9:00 AM', 'Monday at 9:00 AM', 'Custom time…'])
    expect(menu.textContent).toContain(`Times are in ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Scheduled messages are in Drafts & sent.`)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Tomorrow at 9:00 AM' }))
    await vi.waitFor(() => expect(onSchedule).toHaveBeenCalled())
    const [body, at] = onSchedule.mock.calls[0] as unknown as [Body, Date]
    expect(bodyText(body)).toBe('Standup notes')
    const tomorrow = new Date()
    expect(at.getTime()).toBe(new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate() + 1, 9, 0).getTime())
    await vi.waitFor(() => expect(editor.textContent).toBe(''))
    expect(await screen.findByText(/^Scheduled for Tomorrow 9:00 AM\./)).toBeTruthy()
  })

  it('Custom time… asks for a date and time in the future', async () => {
    const onSchedule = vi.fn(async () => {})
    const { editor } = await ready({ onSchedule })
    await focusEditor(editor)
    await userEvent.keyboard('Later')
    await userEvent.click(screen.getByRole('button', { name: 'Schedule message' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Custom time…' }))
    const dialog = screen.getByRole('dialog', { name: 'Schedule message' })
    await userEvent.fill(dialog.querySelector('input')!, '2099-06-01T09:30')
    await userEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    await vi.waitFor(() => expect(onSchedule).toHaveBeenCalled())
    expect((onSchedule.mock.calls[0] as unknown as [Body, Date])[1].getTime()).toBe(new Date(2099, 5, 1, 9, 30).getTime())
  })

  it('no chevron without onSchedule; off while the box is empty, or while it has files', async () => {
    await ready()
    expect(screen.queryByRole('button', { name: 'Schedule message' })).toBeNull()
    cleanup()
    await ready({ onSchedule: vi.fn() })
    expect((screen.getByRole('button', { name: 'Schedule message' }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()
    const { editor } = await ready({ onSchedule: vi.fn(), files: { tray: null, onAdd: vi.fn(), ready: 1, waiting: null } })
    await focusEditor(editor)
    await userEvent.keyboard('With a file')
    expect((screen.getByRole('button', { name: 'Schedule message' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('RichComposer : emoji (spec 6.8)', () => {
  it(':thu offers emoji; Enter puts 👍 in the box instead of sending', async () => {
    const { onSend, editor } = await ready()
    await focusEditor(editor)
    await userEvent.keyboard(':thu')
    const list = await openList({ name: 'Emoji' })
    expect(list.textContent).toContain(':thumbsup:')
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(editor.textContent).toContain('👍'))
    expect(editor.textContent).not.toContain(':thu')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('a colon in a time or a link, or with one letter, opens nothing', async () => {
    const { editor } = await ready()
    await focusEditor(editor)
    for (const text of ['10:30', ' https://x', ' :z']) {
      await userEvent.keyboard(text)
      await new Promise((r) => setTimeout(r, 300))
      expect(screen.queryByRole('listbox', { name: 'Emoji' })).toBeNull()
    }
  })
})

describe('RichComposer / shortcuts (spec 6.8)', () => {
  const withSlash = async (
    run: (c: ParsedCommand, b: Body) => Promise<CommandOutcome> = async () => ({ notice: '#backend is muted. Type /mute to unmute it.' }),
    refused?: ComposerSlash['refused'],
  ) => {
    const spy = vi.fn(run)
    const mounted = await ready({ slash: { commands: COMMANDS.filter((c) => c.name !== 'task'), run: spy, refused } })
    await userEvent.click(mounted.editor)
    return { ...mounted, run: spy }
  }

  it('/ at the start lists the shortcuts; Enter fills one and a second Enter runs it once', async () => {
    const { editor, onSend, run } = await withSlash()
    await userEvent.keyboard('/mu')
    const list = await openList({ name: 'Shortcuts' })
    expect(list.textContent).toContain('/mute')
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(editor.textContent).toBe('/mute '))
    expect(run).not.toHaveBeenCalled()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce())
    expect(run.mock.calls[0]![0]).toEqual({ name: 'mute', args: '', text: '', userIds: [] })
    expect(onSend).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(editor.textContent).toBe(''))
    expect(screen.getByRole('status').textContent).toBe('#backend is muted. Type /mute to unmute it.')
  })

  it('a shortcut not offered here is not in the list', async () => {
    await withSlash()
    await userEvent.keyboard('/t')
    const list = await openList({ name: 'Shortcuts' })
    expect(list.textContent).toContain('/topic')
    expect(list.textContent).not.toContain('/task')
  })

  it('text that only looks like a command sends as a message', async () => {
    const { onSend, run } = await withSlash()
    await userEvent.keyboard('/v2/invoices is slow{Enter}')
    await vi.waitFor(() => expect(onSend).toHaveBeenCalledOnce())
    expect(sentText(onSend)).toBe('/v2/invoices is slow')
    expect(run).not.toHaveBeenCalled()
  })

  // One box per case: Control+A isn't Select all on a Mac, so clearing the box between them failed there.
  it('an unknown /word keeps the text and says why', async () => {
    const { editor, onSend, run } = await withSlash()
    await userEvent.keyboard('/foo bar{Enter}')
    await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe('/foo isn’t a shortcut. To send it as a message, start it with a space.'))
    expect(editor.textContent).toBe('/foo bar')
    expect(run).not.toHaveBeenCalled()
    expect(onSend).not.toHaveBeenCalled()
  })

  it('one offered elsewhere keeps the text and says it doesn’t work here', async () => {
    const { editor, onSend, run } = await withSlash()
    await userEvent.keyboard('/task Fix it{Enter}')
    await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe('/task doesn’t work here. To send it as a message, start it with a space.'))
    expect(editor.textContent).toBe('/task Fix it')
    expect(run).not.toHaveBeenCalled()
    expect(onSend).not.toHaveBeenCalled()
  })

  it('one offered elsewhere says why instead, when the place gives a reason', async () => {
    const { editor, onSend, run } = await withSlash(undefined, { task: '/task works in a project’s channel.' })
    await userEvent.keyboard('/task Fix it{Enter}')
    await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe('/task works in a project’s channel. To send it as a message, start it with a space.'))
    expect(editor.textContent).toBe('/task Fix it')
    expect(run).not.toHaveBeenCalled()
    expect(onSend).not.toHaveBeenCalled()
  })

  it('a command that fails keeps the text and shows why', async () => {
    const { editor } = await withSlash(async () => {
      throw new Error("You can't change this channel's topic.")
    })
    await userEvent.keyboard('/topic New{Enter}')
    await vi.waitFor(() => expect(screen.getByText("You can't change this channel's topic.")).toBeTruthy())
    expect(editor.textContent).toBe('/topic New')
  })

  it('a command that sends a message sends it through the box', async () => {
    const sent: Body = parseBody('ok ¯\\_(ツ)_/¯')
    const { onSend, editor } = await withSlash(async () => ({ send: sent }))
    await userEvent.keyboard('/shrug ok{Enter}')
    await vi.waitFor(() => expect(onSend).toHaveBeenCalledWith(sent))
    await vi.waitFor(() => expect(editor.textContent).toBe(''))
  })

  it('Enter during IME composition never runs a command', async () => {
    const { editor, run } = await withSlash()
    await userEvent.keyboard('/mute ')
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }))
    await new Promise((r) => setTimeout(r, 200))
    expect(run).not.toHaveBeenCalled()
  })

  it('the / button types / in an empty box and is off once there is text', async () => {
    const { editor } = await withSlash()
    await userEvent.click(screen.getByRole('button', { name: 'Shortcuts' }))
    await openList({ name: 'Shortcuts' })
    expect(editor.textContent).toBe('/')
    await userEvent.keyboard('{Backspace}hi')
    await vi.waitFor(() => expect((screen.getByRole('button', { name: 'Shortcuts' }) as HTMLButtonElement).disabled).toBe(true))
  })
})

describe('RichComposer Text snippet (spec 6.8, 6.9)', () => {
  const files = { tray: null, onAdd: () => {}, ready: 0, waiting: null }

  it('Ctrl/Cmd+Shift+Enter hands the box text to the snippet and empties the box once it is made', async () => {
    const onSnippet = vi.fn(async (_text: string) => true)
    const { editor, onSend } = await ready({ onSnippet, files })
    await focusEditor(editor)
    await userEvent.keyboard('SELECT 1;{Control>}{Shift>}{Enter}{/Shift}{/Control}')
    await vi.waitFor(() => expect(onSnippet).toHaveBeenCalledWith('SELECT 1;'))
    await vi.waitFor(() => expect(editor.textContent).toBe(''))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('+ has Text snippet with its keys; a cancelled snippet leaves the box alone', async () => {
    const onSnippet = vi.fn(async (_text: string) => false)
    const { editor } = await ready({ onSnippet, files })
    await focusEditor(editor)
    await userEvent.keyboard('keep me')
    await userEvent.click(screen.getByRole('button', { name: 'Attach' }))
    const item = screen.getByRole('menuitem', { name: /Text snippet/ })
    expect(item.textContent).toMatch(/Ctrl\+Shift\+Enter|⌘⇧↵/)
    await userEvent.click(item)
    await vi.waitFor(() => expect(onSnippet).toHaveBeenCalledWith('keep me'))
    await new Promise((r) => setTimeout(r, 100))
    expect(editor.textContent).toBe('keep me')
  })
})

describe('RichComposer Add from Flow files (spec 6.8)', () => {
  it('+ lists Add from Flow files after Upload when the page offers it', async () => {
    const fromFlow = vi.fn()
    await ready({ files: { tray: null, onAdd: () => {}, ready: 0, waiting: null, fromFlow } })
    await userEvent.click(screen.getByRole('button', { name: 'Attach' }))
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent)
    expect(items[0]).toContain('Upload from your computer')
    expect(items[1]).toBe('Add from Flow files')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add from Flow files' }))
    expect(fromFlow).toHaveBeenCalledOnce()
  })
})

describe('the link preview above the box (spec 6.3)', () => {
  const linkPreview = (url: string, onRemove: () => void) => (
    <div data-testid="preview">
      Preview of {url}
      <button type="button" onClick={onRemove}>
        Remove preview
      </button>
    </div>
  )
  const firstLink = (body: Body) => body.flatMap((b) => (b.type === 'p' ? b.children : [])).find((n) => n.type === 'link')
  const offBody = (href: string): Body => [{ type: 'p', children: [{ type: 'link', href, text: href, noPreview: true }] }]

  it('shows the first link’s preview once I pause, not on every key', async () => {
    const { editor } = await ready({ linkPreview })
    await focusEditor(editor)
    await userEvent.keyboard('listen https://elevenlabs.io/ now')
    expect(screen.queryByTestId('preview')).toBeNull()
    expect((await screen.findByTestId('preview', undefined, { timeout: 2000 })).textContent).toContain('Preview of https://elevenlabs.io/')
  })

  it('sends the link as it is when the preview stays', async () => {
    const { onSend, editor } = await ready({ linkPreview })
    await focusEditor(editor)
    await userEvent.keyboard('https://elevenlabs.io/')
    await screen.findByTestId('preview', undefined, { timeout: 2000 })
    await userEvent.keyboard('{Enter}')
    expect(firstLink(onSend.mock.calls[0][0])).toEqual({ type: 'link', href: 'https://elevenlabs.io/', text: 'https://elevenlabs.io/' })
  })

  it('× takes it off and the message goes without it; the next message previews again', async () => {
    const { onSend, editor } = await ready({ linkPreview })
    await focusEditor(editor)
    await userEvent.keyboard('https://elevenlabs.io/')
    await userEvent.click(await screen.findByRole('button', { name: 'Remove preview' }, { timeout: 2000 }))
    expect(screen.queryByTestId('preview')).toBeNull()
    await focusEditor(editor)
    await userEvent.keyboard('{Enter}')
    expect(firstLink(onSend.mock.calls[0][0])).toMatchObject({ href: 'https://elevenlabs.io/', noPreview: true })
    await vi.waitFor(() => expect(editor.textContent).toBe(''))
    await userEvent.keyboard('https://elevenlabs.io/')
    expect(await screen.findByTestId('preview', undefined, { timeout: 2000 })).toBeTruthy()
  })

  it('after ×, a different first link previews', async () => {
    const { editor } = await ready({ linkPreview, initialBody: parseBody('https://a.example.com/') })
    await userEvent.click(await screen.findByRole('button', { name: 'Remove preview' }, { timeout: 2000 }))
    await focusEditor(editor)
    await userEvent.keyboard('{Control>}a{/Control}{Meta>}a{/Meta}https://b.example.com/')
    expect((await screen.findByTestId('preview', undefined, { timeout: 2000 })).textContent).toContain('https://b.example.com/')
  })

  it('a scheduled message keeps the choice', async () => {
    const onSchedule = vi.fn(async (_b: Body, _at: Date) => {})
    const { editor } = await ready({ linkPreview, onSchedule })
    await focusEditor(editor)
    await userEvent.keyboard('https://elevenlabs.io/')
    await userEvent.click(await screen.findByRole('button', { name: 'Remove preview' }, { timeout: 2000 }))
    await userEvent.click(screen.getByRole('button', { name: 'Schedule message' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Tomorrow at 9:00 AM' }))
    await vi.waitFor(() => expect(onSchedule).toHaveBeenCalled())
    expect(firstLink(onSchedule.mock.calls[0][0])).toMatchObject({ noPreview: true })
  })

  it('an edit opens with the choice kept: no preview, and saving keeps it off', async () => {
    const onSend = vi.fn(async (_b: Body) => {})
    render(
      <div className="sf" style={{ width: 720 }}>
        <RichComposer mode="edit" placeholder="Edit message" initialBody={offBody('https://elevenlabs.io/')} onSend={onSend} onCancel={vi.fn()} directory={directory} linkPreview={linkPreview} />
      </div>,
    )
    const editor = screen.getByRole('textbox', { name: 'Edit message' })
    await vi.waitFor(() => expect(document.activeElement).toBe(editor))
    await new Promise((r) => setTimeout(r, 800))
    expect(screen.queryByTestId('preview')).toBeNull()
    await userEvent.keyboard(' ok{Enter}')
    expect(firstLink(onSend.mock.calls[0][0])).toMatchObject({ href: 'https://elevenlabs.io/', noPreview: true })
  })

  it('the draft keeps the choice, so the card stays off when I come back', async () => {
    const { onDraft, editor } = await ready({ linkPreview })
    await focusEditor(editor)
    await userEvent.keyboard('https://elevenlabs.io/')
    await userEvent.click(await screen.findByRole('button', { name: 'Remove preview' }, { timeout: 2000 }))
    await vi.waitFor(() => expect(firstLink(onDraft.mock.calls.at(-1)![0] as Body)).toMatchObject({ noPreview: true }), { timeout: 2000 })
    const saved = onDraft.mock.calls.at(-1)![0] as Body
    cleanup()
    await ready({ linkPreview, initialBody: saved })
    await new Promise((r) => setTimeout(r, 800))
    expect(screen.queryByTestId('preview')).toBeNull()
  })

  it('a shortcut that sends (/shrug) keeps the choice', async () => {
    const run = vi.fn(async (_c: ParsedCommand, body: Body): Promise<CommandOutcome> => ({ send: body }))
    const { onSend, editor } = await ready({ linkPreview, slash: { commands: COMMANDS.filter((c) => c.name === 'shrug'), run } })
    await focusEditor(editor)
    await userEvent.keyboard('/shrug https://elevenlabs.io/')
    await userEvent.click(await screen.findByRole('button', { name: 'Remove preview' }, { timeout: 2000 }))
    await focusEditor(editor)
    await userEvent.keyboard('{End}{Enter}')
    await vi.waitFor(() => expect(onSend).toHaveBeenCalled())
    expect(firstLink(onSend.mock.calls[0][0])).toMatchObject({ noPreview: true })
  })

  it('the same link again waits for the pause again', async () => {
    const { editor } = await ready({ linkPreview })
    await focusEditor(editor)
    await userEvent.keyboard('https://elevenlabs.io/')
    await screen.findByTestId('preview', undefined, { timeout: 2000 })
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(editor.textContent).toBe(''))
    await userEvent.keyboard('https://elevenlabs.io/')
    expect(screen.queryByTestId('preview')).toBeNull()
  })

  it('a link in code gets no preview', async () => {
    const { editor } = await ready({ linkPreview })
    await focusEditor(editor)
    await userEvent.keyboard('`https://elevenlabs.io/`')
    await new Promise((r) => setTimeout(r, 800))
    expect(screen.queryByTestId('preview')).toBeNull()
  })
})

describe('the suggestion list sits inside the page (UX Phase 5A, 5.11: axe "region")', () => {
  it('opens inside the page’s landmark, above the box at the caret, and axe finds no content outside a landmark', async () => {
    render(
      <main>
        <div className="sf" style={{ width: 720, paddingTop: 320 }}>
          <RichComposer placeholder="Message #backend" onSend={vi.fn(async () => {})} onDraft={vi.fn()} directory={directory} />
        </div>
      </main>,
    )
    const editor = screen.getByRole('textbox', { name: 'Message #backend' })
    await vi.waitFor(() => expect(editor.getAttribute('data-lexical-editor')).toBe('true'))
    await focusEditor(editor)
    await userEvent.keyboard('@No')
    const list = await openList({ name: 'Mention someone' })
    expect(list.closest('main')).not.toBeNull()
    const menu = screen.getByRole('option', { name: /Nour El-Sayed/ }).closest('ul')!.parentElement!
    expect(menu.getBoundingClientRect().bottom).toBeLessThanOrEqual(editor.getBoundingClientRect().top)
    expect((await axeProblems(document)).filter((p) => p.startsWith('region'))).toEqual([])
  })
})

