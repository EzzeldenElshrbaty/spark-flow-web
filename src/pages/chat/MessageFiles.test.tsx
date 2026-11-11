// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Attachment, ChatMessage } from '@/api/types'
import { api } from '@/lib/api'
import { FileActionsContext, type FileActions } from '@/pages/chat/files/FileActions'
import { MessageFiles } from '@/pages/chat/MessageFiles'

vi.mock('@/components/AttachmentView', async (original) => ({
  ...(await original<typeof import('@/components/AttachmentView')>()),
  useFileUrl: () => ({ url: 'blob:http://localhost/file-1', failed: false }),
}))

afterEach(cleanup)
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const pdf: Attachment = {
  id: 'a1', name: 'Scope v3.pdf', mimeType: 'application/pdf', size: 188_416, createdAt: '2026-10-28T09:00:00.000Z',
  uploadedBy: 'u-2', title: 'Scope v3.pdf', description: '', scanStatus: 'clean', thumbUrl: null, previewUrl: null, deletedAt: null, snippet: null, clip: null, folderId: null,
}
const link = 'http://localhost/w/engineering/c/c-backend?message=m1'

describe('MessageFiles (spec 6.9 file card)', () => {
  it('a file card names the file, its type and size', () => {
    render(<MessageFiles attachments={[pdf]} link={link} />)
    expect(screen.getByRole('button', { name: /^Open Scope v3\.pdf/ }).textContent).toContain('PDF · 184 KB')
  })

  it('without the page’s file actions the pill has Download and More, reachable from the keyboard', () => {
    render(<MessageFiles attachments={[pdf]} link={link} />)
    const actions = screen.getByRole('group', { name: 'Scope v3.pdf actions' })
    expect([...actions.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Download', 'More file actions'])
  })

  it('Download saves the file under its name, and the audit log hears of it (slice 2)', () => {
    const clicked: HTMLAnchorElement[] = []
    const spy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this)
    })
    const noted = vi.spyOn(api.audit, 'noteDownload').mockResolvedValue()
    render(<MessageFiles attachments={[pdf]} link={link} />)
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(clicked[0].download).toBe('Scope v3.pdf')
    expect(clicked[0].href).toBe('blob:http://localhost/file-1')
    expect(noted).toHaveBeenCalledWith('a1')
    spy.mockRestore()
    noted.mockRestore()
  })

  it('More → Copy link to file copies the message permalink and says so', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    render(<MessageFiles attachments={[pdf]} link={link} />)
    fireEvent.click(screen.getByRole('button', { name: 'More file actions' }))
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link to file' })))
    expect(writeText).toHaveBeenCalledWith(link)
    expect(screen.getByRole('status').textContent).toBe('Link copied')
  })

  it('without a link there is no More menu', () => {
    render(<MessageFiles attachments={[pdf]} />)
    expect(screen.queryByRole('button', { name: 'More file actions' })).toBeNull()
  })
})

describe('the file card, its pill and menu (spec 6.9, slice 6)', () => {
  const message = { id: 'm1', channelId: 'c-p-nex', content: 'Scope', attachments: [pdf], threadCount: 0 } as unknown as ChatMessage
  const actions = (over: Partial<FileActions> = {}): FileActions => ({ mayManage: () => true, share: vi.fn(), details: vi.fn(), edit: vi.fn(), remove: vi.fn(), ...over })
  const show = (value: FileActions, attachments: Attachment[] = [pdf]) =>
    render(
      <FileActionsContext.Provider value={value}>
        <MessageFiles attachments={attachments} link={link} message={message} />
      </FileActionsContext.Provider>,
    )

  it('shows its title, and a type label that folds the card away and back', () => {
    render(<MessageFiles attachments={[{ ...pdf, title: 'Release scope' }]} link={link} />)
    const label = screen.getByRole('button', { name: 'PDF · Release scope' })
    expect(label.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: /^Open Release scope/ }).textContent).toContain('Release scope')
    fireEvent.click(label)
    expect(label.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: /^Open Release scope/ })).toBeNull()
    fireEvent.click(label)
    expect(screen.getByRole('button', { name: /^Open Release scope/ })).toBeTruthy()
  })

  it('the pill has Download, Share, Details and More; Share and Details go to the page', () => {
    const value = actions()
    show(value)
    const pill = screen.getByRole('group', { name: 'Scope v3.pdf actions' })
    expect([...pill.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Download', 'Share', 'Details', 'More file actions'])
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect(value.share).toHaveBeenCalledWith(pdf)
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(value.details).toHaveBeenCalledWith(pdf)
  })

  it('the menu has Create task from file, Copy link, Edit file details and Delete file, as I may', () => {
    const value = actions({ createTask: vi.fn() })
    show(value)
    fireEvent.click(screen.getByRole('button', { name: 'More file actions' }))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Create task from file', 'Copy link to file', 'Edit file details', 'Delete file'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Create task from file' }))
    expect(value.createTask).toHaveBeenCalledWith(pdf, message)
    fireEvent.click(screen.getByRole('button', { name: 'More file actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete file' }))
    expect(value.remove).toHaveBeenCalledWith(pdf)
    cleanup()
    show(actions({ mayManage: () => false }))
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More file actions' }))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Copy link to file'])
  })

  it('a deleted file says so, with nothing to do', () => {
    show(actions(), [{ ...pdf, deletedAt: '2026-10-29T10:00:00.000Z' }])
    expect(screen.getByText('This file was deleted.')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('a file still being checked, or blocked, can’t be opened or downloaded', () => {
    show(actions(), [{ ...pdf, scanStatus: 'pending' }])
    expect(screen.getByText('Checking for viruses…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
    cleanup()
    show(actions(), [{ ...pdf, scanStatus: 'blocked' }])
    expect(screen.getByText('This file was blocked.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Open/ })).toBeNull()
  })
})

describe('the file card after the slice 6 review', () => {
  it('an office file previews through the backend’s PDF, but Download saves the original under its own name', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    const docx = { ...pdf, id: 'a2', name: 'Q3 report.docx', title: 'Q3 report.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', previewUrl: 'https://storage.example/previews/a2.pdf' }
    render(<MessageFiles attachments={[docx]} link={link} />)
    fireEvent.click(screen.getByRole('button', { name: /^Open Q3 report\.docx/ }))
    await act(async () => {})
    const saves = [...document.querySelectorAll<HTMLAnchorElement>('a[download]')]
    expect(saves.length).toBeGreaterThan(0)
    for (const a of saves) {
      expect(a.getAttribute('href')).toBe('blob:http://localhost/file-1')
      expect(a.download).toBe('Q3 report.docx')
    }
    vi.restoreAllMocks()
  })

  it('on a screen without hover (a tablet) the pill is always shown, and it stays while its menu is open', () => {
    const before = window.matchMedia
    window.matchMedia = ((media: string) => ({ matches: media === '(hover: none)', media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
    try {
      render(<MessageFiles attachments={[pdf]} link={link} />)
      const pill = screen.getByRole('group', { name: 'Scope v3.pdf actions' })
      expect(pill.className.split(' ')).toContain('opacity-100')
      expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy()
    } finally {
      window.matchMedia = before
    }
    cleanup()
    render(<MessageFiles attachments={[pdf]} link={link} />)
    expect(screen.getByRole('group', { name: 'Scope v3.pdf actions' }).className).toContain('has-[[aria-expanded=true]]:opacity-100')
  })
})

describe('the file card, slice 6 review minors', () => {
  const message = { id: 'm1', channelId: 'c-p-nex', content: 'Scope', attachments: [pdf], threadCount: 0 } as unknown as ChatMessage
  const actions = (over: Partial<FileActions> = {}): FileActions => ({ mayManage: () => true, share: vi.fn(), details: vi.fn(), edit: vi.fn(), remove: vi.fn(), createTask: vi.fn(), ...over })
  const show = (value: FileActions, props: Partial<Parameters<typeof MessageFiles>[0]> = {}) =>
    render(
      <FileActionsContext.Provider value={value}>
        <MessageFiles attachments={[pdf]} link={link} message={message} {...props} />
      </FileActionsContext.Provider>,
    )
  const menu = () => {
    fireEvent.click(screen.getByRole('button', { name: 'More file actions' }))
    return screen.getAllByRole('menuitem').map((i) => i.textContent)
  }

  it('Create task from file only where a task can come from the message (not a reply’s copy in the channel)', () => {
    show(actions(), { message: { ...message, broadcast: { rootId: 'm0', rootText: '' } } as ChatMessage })
    expect(menu()).not.toContain('Create task from file')
  })

  it('a message still on its way offers only Download for its files', () => {
    show(actions(), { pending: true })
    const pill = screen.getByRole('group', { name: 'Scope v3.pdf actions' })
    expect([...pill.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Download'])
  })

  it('in an archived channel or project, Edit file details and Delete file aren’t offered; Share still is', () => {
    show(actions({ frozen: true }))
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy()
    expect(menu()).toEqual(['Create task from file', 'Copy link to file'])
  })

  it('the type label says which file, and is wide enough to tap on a phone', () => {
    render(<MessageFiles attachments={[pdf]} link={link} />)
    const label = screen.getByRole('button', { name: 'PDF · Scope v3.pdf' })
    expect(label.className).toContain('max-md:min-w-11')
  })

  it('a blocked file keeps Details and, for whoever may, Delete file; nothing that opens or spreads it', () => {
    const value = actions()
    show(value, { attachments: [{ ...pdf, scanStatus: 'blocked' }] })
    expect(screen.getByText('This file was blocked.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(value.details).toHaveBeenCalled()
    expect(menu()).toEqual(['Copy link to file', 'Delete file'])
  })
})

describe('a text snippet in a message (spec 6.9)', () => {
  const snip: Attachment = { ...pdf, id: 'a-s', name: 'q.txt', title: 'q', mimeType: 'text/plain', snippet: { language: 'sql' } }

  it('shows as a code card under "SQL snippet", and Copy puts the code on the clipboard', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('SELECT 1;'))
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    render(<MessageFiles attachments={[snip]} link={link} />)
    expect(screen.getByRole('button', { name: 'SQL snippet · q' })).toBeTruthy()
    expect(await screen.findByText('SELECT')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy snippet' }))
    })
    expect(writeText).toHaveBeenCalledWith('SELECT 1;')
    expect(screen.getByRole('status').textContent).toBe('Copied')
    fetchSpy.mockRestore()
  })
})

describe('Save for later on a file (spec 6.9 file menu)', () => {
  const message = { id: 'm1', channelId: 'c-backend', content: 'Scope', attachments: [pdf], threadCount: 0 } as unknown as ChatMessage
  const base: FileActions = { mayManage: () => false, share: vi.fn(), details: vi.fn(), edit: vi.fn(), remove: vi.fn() }
  const show = (value: FileActions) =>
    render(
      <FileActionsContext.Provider value={value}>
        <MessageFiles attachments={[pdf]} link={link} message={message} />
      </FileActionsContext.Provider>,
    )

  it('the file menu saves it, and once saved offers Remove from Saved', () => {
    const toggle = vi.fn()
    show({ ...base, save: { isSaved: () => false, toggle } })
    fireEvent.click(screen.getByRole('button', { name: 'More file actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save for later' }))
    expect(toggle).toHaveBeenCalledWith(pdf)
    cleanup()
    show({ ...base, save: { isSaved: () => true, toggle } })
    fireEvent.click(screen.getByRole('button', { name: 'More file actions' }))
    expect(screen.getByRole('menuitem', { name: 'Remove from Saved' })).toBeTruthy()
  })
})

describe('Add to folder (spec 6.9 file menu)', () => {
  const message = { id: 'm1', channelId: 'c-backend', content: 'Scope', attachments: [pdf], threadCount: 0 } as unknown as ChatMessage
  const folders = [{ id: 'fold-1', workspaceId: 'ws-eng', name: 'Releases', createdBy: 'u-1', createdAt: '' }]
  const show = (over: Partial<FileActions['folders']> = {}, file = pdf) => {
    const set = vi.fn(async () => {})
    const create = vi.fn(async () => {})
    render(
      <FileActionsContext.Provider value={{ mayManage: () => true, share: vi.fn(), details: vi.fn(), edit: vi.fn(), remove: vi.fn(), folders: { list: folders, set, create, ...over } }}>
        <MessageFiles attachments={[file]} link={link} message={message} />
      </FileActionsContext.Provider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'More file actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add to folder' }))
    return { set, create }
  }

  it('files it in a folder, or takes it out of the one it is in', () => {
    const { set } = show()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Releases' }))
    expect(set).toHaveBeenCalledWith(pdf, 'fold-1')
    cleanup()
    const second = show({}, { ...pdf, folderId: 'fold-1' })
    expect(screen.getByRole('menuitemradio', { name: 'Releases' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'No folder' }))
    expect(second.set).toHaveBeenCalledWith({ ...pdf, folderId: 'fold-1' }, null)
  })

  it('New folder… names one and files it there', async () => {
    const { create } = show()
    fireEvent.click(screen.getByRole('menuitem', { name: 'New folder…' }))
    const dialog = within(screen.getByRole('dialog', { name: 'New folder' }))
    fireEvent.change(dialog.getByRole('textbox', { name: 'Name' }), { target: { value: 'Designs' } })
    await act(async () => {
      fireEvent.click(dialog.getByRole('button', { name: 'Create and add' }))
    })
    expect(create).toHaveBeenCalledWith(pdf, 'Designs')
  })
})

describe('voice and video messages in a message (chat spec 6.9)', () => {
  const voice: Attachment = { ...pdf, id: 'a-v', name: 'Voice message.webm', mimeType: 'audio/webm', title: 'Voice message', clip: { kind: 'voice', durationMs: 42_000, waveform: Array(48).fill(0.5) } }
  const video: Attachment = { ...pdf, id: 'a-m', name: 'Video message.mp4', mimeType: 'video/mp4', title: 'Video message', clip: { kind: 'video', durationMs: 42_000, waveform: [] } }
  const mp3: Attachment = { ...pdf, id: 'a-3', name: 'call.mp3', mimeType: 'audio/mpeg', title: 'call.mp3' }
  const plays = (types: string[]) => vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation((type) => (types.includes(type) ? 'maybe' : ''))
  afterEach(() => vi.restoreAllMocks())

  it('a voice message gets the player', () => {
    plays(['audio/webm'])
    render(<MessageFiles attachments={[voice]} link={link} />)
    expect(screen.getByRole('button', { name: 'Play voice message' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Voice message · 0:42 · Voice message' })).toBeTruthy()
  })

  it('a video message plays inline, labelled with its length', () => {
    plays(['video/mp4'])
    const { container } = render(<MessageFiles attachments={[video]} link={link} />)
    expect(container.querySelector('video')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Video message · 0:42 · Video message' })).toBeTruthy()
  })

  it('an uploaded .mp3, or a voice message the browser can’t play, stays a file card', () => {
    plays([])
    render(<MessageFiles attachments={[mp3, voice]} link={link} />)
    expect(screen.queryByRole('button', { name: 'Play voice message' })).toBeNull()
    expect(screen.getAllByText(/^(call\.mp3|Voice message)$/).length).toBeGreaterThanOrEqual(2)
  })
})
