import '@/index.css'
import { act, cleanup, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import type { Attachment } from '@/api/types'
import type { DescBody } from '@/lib/messageBody'
import { focusEditor } from '@/pages/chat/composer/focusEditor.testkit'
import DescriptionEditor, { type DescriptionEditorHandle } from './DescriptionEditor'

// A real browser: the editor needs real keys, selection and paste.

afterEach(cleanup)

const pdf = { id: 'a-1', title: 'flow.pdf', name: 'flow.pdf', mimeType: 'application/pdf', size: 2048 } as Attachment

async function mount(props: Partial<Parameters<typeof DescriptionEditor>[0]> = {}) {
  const onChange = vi.fn<(body: DescBody) => void>()
  const onFiles = vi.fn<(files: File[], place: string | null) => void>()
  const onSubmit = vi.fn()
  const ref = createRef<DescriptionEditorHandle>()
  render(
    <div style={{ width: 600 }}>
      <input aria-label="Other field" />
      <DescriptionEditor ref={ref} initial={[]} files={[]} readOnly={false} label="Description" onChange={onChange} onFiles={onFiles} onSubmit={onSubmit} {...props} />
    </div>,
  )
  const editor = screen.getByRole('textbox', { name: 'Description' })
  await vi.waitFor(() => expect(editor.getAttribute('data-lexical-editor')).toBe('true'))
  const last = () => onChange.mock.calls.at(-1)?.[0]
  return { editor, onChange, onFiles, onSubmit, ref, last }
}

describe('DescriptionEditor (spec 5.1)', () => {
  it('formats with the keys and markdown shortcuts', async () => {
    const { editor, last } = await mount()
    await focusEditor(editor)
    await userEvent.keyboard('hi{ControlOrMeta>}a{/ControlOrMeta}{ControlOrMeta>}b{/ControlOrMeta}')
    await vi.waitFor(() => expect(last()).toEqual([{ type: 'p', children: [{ type: 'text', text: 'hi', marks: ['b'] }] }]))
    await userEvent.keyboard('{End}{Enter}- a')
    await vi.waitFor(() => expect(last()?.at(-1)).toMatchObject({ type: 'ul', items: [[{ type: 'text', text: 'a' }]] }))
  })

  it('⌘/Ctrl+Enter saves; Enter starts a new paragraph', async () => {
    const { editor, onSubmit, last } = await mount()
    await focusEditor(editor)
    await userEvent.keyboard('one{Enter}two')
    await vi.waitFor(() => expect(last()).toHaveLength(2))
    expect(onSubmit).not.toHaveBeenCalled()
    await userEvent.keyboard('{ControlOrMeta>}{Enter}{/ControlOrMeta}')
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('a paste is plain text; pasted files go up and add no text', async () => {
    const { editor, onFiles, last } = await mount()
    await focusEditor(editor)
    const html = new DataTransfer()
    html.setData('text/plain', 'x')
    html.setData('text/html', '<b>x</b>')
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: html, bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(last()).toEqual([{ type: 'p', children: [{ type: 'text', text: 'x' }] }]))
    const png = new File(['png'], 'shot.png', { type: 'image/png' })
    const files = new DataTransfer()
    files.items.add(png)
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: files, bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(onFiles).toHaveBeenCalledOnce())
    expect(onFiles.mock.calls[0]![0].map((f) => f.type)).toEqual(['image/png'])
    expect(editor.textContent).toBe('x')
  })

  it('a file dropped on the text or beside it goes up once, with where the caret was, and adds no text (spec §8)', async () => {
    const { editor, onFiles } = await mount()
    await focusEditor(editor)
    await userEvent.keyboard('one')
    const drop = (target: Element) => {
      const data = new DataTransfer()
      data.items.add(new File(['%PDF'], 'flow.pdf', { type: 'application/pdf' }))
      target.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true }))
      const event = new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true })
      target.dispatchEvent(event)
      return event
    }
    // On the text: the editor's own drop takes it, and the browser doesn't open the file.
    const onText = drop(editor.querySelector('p')!)
    await vi.waitFor(() => expect(onFiles).toHaveBeenCalledOnce())
    expect(onText.defaultPrevented).toBe(true)
    expect(onFiles.mock.calls[0]![0].map((f) => f.name)).toEqual(['flow.pdf'])
    expect(onFiles.mock.calls[0]![1]).toEqual(expect.any(String))
    expect(editor.textContent).toBe('one')
    // On the toolbar, beside the text: the box takes it.
    const beside = drop(screen.getByRole('toolbar'))
    await vi.waitFor(() => expect(onFiles).toHaveBeenCalledTimes(2))
    expect(beside.defaultPrevented).toBe(true)
    expect(onFiles.mock.calls[1]![0].map((f) => f.name)).toEqual(['flow.pdf'])
  })

  it('a file put in shows as a chip and is in the body; taking it out removes it', async () => {
    const { ref, last } = await mount()
    act(() => ref.current!.insertFile(pdf))
    await vi.waitFor(() => expect(screen.getByText('flow.pdf')).toBeTruthy())
    await vi.waitFor(() => expect(last()).toContainEqual({ type: 'file', id: 'a-1' }))
    act(() => ref.current!.removeFile('a-1'))
    await vi.waitFor(() => expect(last()).toEqual([]))
    expect(screen.queryByText('flow.pdf')).toBeNull()
  })

  it('a link needs a web address that starts with http:// or https://', async () => {
    const { editor, last } = await mount()
    await focusEditor(editor)
    await userEvent.keyboard('docs{Shift>}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{/Shift}')
    await userEvent.click(screen.getByRole('button', { name: 'Link' }))
    const address = screen.getByRole('textbox', { name: 'Web address' })
    await userEvent.fill(address, 'javascript:x')
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }))
    expect(screen.getByText('Use a web address that starts with http:// or https://')).toBeTruthy()
    await userEvent.fill(address, 'https://a.b')
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }))
    await vi.waitFor(() => expect(last()).toEqual([{ type: 'p', children: [{ type: 'link', href: 'https://a.b/', text: 'docs' }] }]))
  })

  it('every toolbar button has a name and a pressed state; read-only has no toolbar', async () => {
    await mount()
    const buttons = screen.getAllByRole('button').filter((b) => b.closest('[role=toolbar]'))
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Bold', 'Italic', 'Underline', 'Strikethrough', 'Link', 'Bulleted list', 'Numbered list', 'Quote', 'Code', 'Code block', 'Attach files',
    ])
    expect(buttons.slice(0, -1).every((b) => b.hasAttribute('aria-pressed'))).toBe(true)
    cleanup()
    const { editor } = await mount({ readOnly: true, initial: [{ type: 'p', children: [{ type: 'text', text: 'fixed' }] }] })
    expect(editor.getAttribute('contenteditable')).toBe('false')
    expect(screen.queryByRole('toolbar')).toBeNull()
  })
})

describe('DescriptionEditor review fixes', () => {
  it('a finished upload goes where its file was added, and leaves the caret where the person is now', async () => {
    const { editor, onFiles, ref, last } = await mount()
    await focusEditor(editor)
    await userEvent.keyboard('one{Enter}two{ArrowUp}')
    const data = new DataTransfer()
    data.items.add(new File(['%PDF'], 'flow.pdf', { type: 'application/pdf' }))
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(onFiles).toHaveBeenCalledOnce())
    const place = onFiles.mock.calls[0]![1]
    const other = screen.getByRole('textbox', { name: 'Other field' })
    await userEvent.click(other)
    act(() => ref.current!.insertFile(pdf, place))
    await vi.waitFor(() => expect(last()).toEqual([
      { type: 'p', children: [{ type: 'text', text: 'one' }] },
      { type: 'file', id: 'a-1' },
      { type: 'p', children: [{ type: 'text', text: 'two' }] },
    ]))
    expect(document.activeElement).toBe(other)
    act(() => ref.current!.removeFile('a-1'))
    await vi.waitFor(() => expect(last()).toHaveLength(2))
    expect(document.activeElement).toBe(other)
  })

  it('a paste of files with HTML but no plain text uploads the files; HTML alone pastes its text', async () => {
    const { editor, onFiles, last } = await mount()
    await focusEditor(editor)
    const copied = new DataTransfer()
    copied.setData('text/html', '<img src="https://a.b/x.png">')
    copied.items.add(new File(['png'], 'x.png', { type: 'image/png' }))
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: copied, bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(onFiles).toHaveBeenCalledOnce())
    expect(editor.textContent).toBe('')
    const html = new DataTransfer()
    html.setData('text/html', '<b>bold</b> text')
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: html, bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(last()).toEqual([{ type: 'p', children: [{ type: 'text', text: 'bold text' }] }]))
  })

  it('opening a stored description reports no change', async () => {
    const { onChange } = await mount({ initial: [{ type: 'p', children: [{ type: 'text', text: 'one\ntwo' }] }, { type: 'ul', items: [[{ type: 'text', text: 'x' }]] }] })
    await new Promise((r) => setTimeout(r, 300))
    expect(onChange).not.toHaveBeenCalled()
  })
})
