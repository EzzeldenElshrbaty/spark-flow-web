// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Attachment, UploadFile } from '@/api/types'
import { ApiError } from '@/lib/apiError'
import { bodyText, type Body } from '@/lib/messageBody'
import { MAX_SNIPPET, useSnippet } from '@/pages/chat/snippets/useSnippet'

const uploaded = { id: 'a-snip', name: 'explain-query.txt', title: 'explain-query', snippet: { language: 'sql' } } as Attachment
const upload = vi.fn(async (_channelId: string, _file: UploadFile, _options?: unknown): Promise<Attachment> => uploaded)
vi.mock('@/api/files', () => ({ uploadChatFile: (c: string, f: UploadFile, o?: unknown) => upload(c, f, o) }))
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

beforeEach(() => upload.mockClear())
afterEach(cleanup)

function Harness({ text = '', send }: { text?: string; send: (file: Attachment, message: Body) => Promise<unknown> }) {
  const snippet = useSnippet({ channelId: 'c-backend', where: '#backend', send })
  const [result, setResult] = useState<string>('')
  return (
    <>
      <button type="button" onClick={() => void snippet.open(text).then((created) => setResult(String(created)))}>
        open
      </button>
      <output>{result}</output>
      {snippet.dialog}
    </>
  )
}

const dialog = () => within(screen.getByRole('dialog', { name: 'Create a text snippet' }))
const show = (props: Partial<Parameters<typeof Harness>[0]> = {}) => {
  const send = vi.fn(async () => {})
  render(<Harness send={send} {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'open' }))
  return send
}

describe('Text snippet (spec 6.9)', () => {
  it('opens with what was in the box as the content, says where it goes, and starts as Plain text', () => {
    show({ text: 'SELECT 1;' })
    expect((dialog().getByRole('textbox', { name: 'Content' }) as HTMLTextAreaElement).value).toBe('SELECT 1;')
    expect(dialog().getByText('Shares to #backend')).toBeTruthy()
    expect(dialog().getByRole('button', { name: 'Type: Plain text' })).toBeTruthy()
    expect(dialog().getByRole('textbox', { name: 'Message (optional)' }).getAttribute('placeholder')).toBe('Add a message to #backend')
  })

  it('blank content can’t be created', () => {
    show({ text: '   \n ' })
    expect((dialog().getByRole('button', { name: 'Create snippet' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Create uploads a .txt in the chosen type, sends it with the message, and resolves true', async () => {
    const send = show({ text: 'SELECT 1;' })
    fireEvent.change(dialog().getByRole('textbox', { name: 'Title' }), { target: { value: 'explain query' } })
    fireEvent.click(dialog().getByRole('button', { name: 'Type: Plain text' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'SQL' }))
    fireEvent.change(dialog().getByRole('textbox', { name: 'Message (optional)' }), { target: { value: 'Slow on prod' } })
    await act(async () => {
      fireEvent.click(dialog().getByRole('button', { name: 'Create snippet' }))
    })
    expect(upload).toHaveBeenCalledOnce()
    const [channelId, file, options] = upload.mock.calls[0]!
    expect(channelId).toBe('c-backend')
    expect(file.name).toBe('explain query.txt')
    expect(await file.text()).toBe('SELECT 1;')
    expect(options).toMatchObject({ snippet: { language: 'sql' } })
    expect(send).toHaveBeenCalledWith(uploaded, expect.anything())
    expect(bodyText((send.mock.calls[0] as unknown as [Attachment, Body])[1])).toBe('Slow on prod')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.querySelector('output')!.textContent).toBe('true')
  })

  it('an upload that fails keeps the dialog, the content and the reason; nothing is sent', async () => {
    upload.mockRejectedValueOnce(new ApiError({ status: 403, title: 'Forbidden', detail: "You can't post in an archived channel." }))
    const send = show({ text: 'SELECT 1;' })
    await act(async () => {
      fireEvent.click(dialog().getByRole('button', { name: 'Create snippet' }))
    })
    expect(dialog().getByText("You can't post in an archived channel.")).toBeTruthy()
    expect((dialog().getByRole('textbox', { name: 'Content' }) as HTMLTextAreaElement).value).toBe('SELECT 1;')
    expect(send).not.toHaveBeenCalled()
  })

  it('Cancel resolves false; content over the limit can’t be created and says so', async () => {
    show({ text: 'x'.repeat(MAX_SNIPPET + 1) })
    expect((dialog().getByRole('button', { name: 'Create snippet' }) as HTMLButtonElement).disabled).toBe(true)
    expect(dialog().getByText('-1')).toBeTruthy()
    await act(async () => {
      fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }))
    })
    expect(document.querySelector('output')!.textContent).toBe('false')
  })
})

describe('Text snippet: Cancel while it is being created (review)', () => {
  it('stops the upload, posts nothing and resolves false, even when the upload finishes after', async () => {
    let finishUpload: (file: Attachment) => void = () => {}
    let signal: AbortSignal | undefined
    upload.mockImplementationOnce((_c, _f, options) => {
      signal = (options as { signal?: AbortSignal }).signal
      return new Promise<Attachment>((resolve) => {
        finishUpload = resolve
      })
    })
    const send = show({ text: 'SELECT 1;' })
    await act(async () => {
      fireEvent.click(dialog().getByRole('button', { name: 'Create snippet' }))
    })
    await act(async () => {
      fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }))
    })
    expect(signal?.aborted).toBe(true)
    await act(async () => finishUpload(uploaded))
    expect(send).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('output')!.textContent).toBe('false')
  })

  it('keeps the title as typed, spaces included', async () => {
    show({ text: 'SELECT 1;' })
    fireEvent.change(dialog().getByRole('textbox', { name: 'Title' }), { target: { value: 'Explain query' } })
    await act(async () => {
      fireEvent.click(dialog().getByRole('button', { name: 'Create snippet' }))
    })
    expect(upload.mock.calls[0]![1].name).toBe('Explain query.txt')
  })
})
