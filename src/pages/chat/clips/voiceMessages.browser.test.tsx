import '@/index.css'
import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { api } from '@/lib/api'
import * as recorder from '@/lib/recorder'
import { voiceNoteWav } from '@/mocks/seedFiles'
import { renderApp, type Size, type Theme } from '@/test/app'
import { axeProblems } from '@/test/axe'
import { answersTouch } from '@/test/touch'
import { sidewaysScroll } from '@/test/uxChecks'

// Voice and video messages from the composer (chat spec 6.9), in the whole app, as Youssef (Admin), with the
// recorder faked: it hands back the seed's 4-second voice note, labelled as WebM.

vi.mock('@/lib/recorder', async (original) => ({ ...(await original<typeof import('@/lib/recorder')>()), canRecord: vi.fn(() => true), startRecording: vi.fn() }))

const bytes = Uint8Array.from(atob(voiceNoteWav()), (c) => c.charCodeAt(0))
const waveform = Array.from({ length: 48 }, (_, i) => (i % 6) / 5)
beforeEach(async () => {
  await api.auth.signOut().catch(() => {})
  localStorage.setItem('spark-flow.session', 'u-1')
  await api.db.reset()
  vi.mocked(recorder.canRecord).mockReturnValue(true)
  vi.mocked(recorder.startRecording).mockImplementation(async () => ({
    stream: new MediaStream(),
    level: () => 0.4,
    elapsedMs: () => 4000,
    stop: async () => ({ blob: new Blob([bytes], { type: 'audio/webm' }), mimeType: 'audio/webm', durationMs: 4000, waveform }),
    cancel: () => {},
  }))
})

async function open(path = '/w/engineering/c/c-general', size: Size = 'desktop', theme: Theme = 'light') {
  const app = await renderApp({ path, as: 'admin', theme, size })
  await app.settled()
  await screen.findAllByRole('button', { name: 'Send' }, { timeout: 3000 })
  return app
}
/** The tray card of a recording: its Remove button names the file ("Voice message 11 Nov 2026 2.32 PM.webm"). */
const trayCard = async (within_: ReturnType<typeof within> | typeof screen = screen) =>
  (await within_.findByRole('button', { name: /^Remove Voice message .*\.webm$/ }, { timeout: 3000 })).parentElement!
/** Record a voice message and attach it, from wherever `start` opens the dialog. */
async function recordVoice(start: () => Promise<void>) {
  await start()
  const dialog = await screen.findByRole('dialog', { name: 'Record a voice message' })
  await userEvent.click(await within(dialog).findByRole('button', { name: 'Stop' }))
  await userEvent.click(await within(dialog).findByRole('button', { name: 'Attach' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Record a voice message' })).toBeNull())
}

describe('voice and video messages from the composer (chat spec 6.9)', () => {
  it('the row offers video then voice; a recording goes to the tray and sends', async () => {
    await open()
    const video = await screen.findByRole('button', { name: 'Record a video message' })
    const voice = screen.getByRole('button', { name: 'Record a voice message' })
    expect(video.compareDocumentPosition(voice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const before = screen.queryAllByRole('button', { name: 'Play voice message' }).length
    await recordVoice(() => userEvent.click(voice))
    await waitFor(async () => expect((await trayCard()).textContent).toContain('Voice message · 0:04'), { timeout: 3000 })
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(screen.queryAllByRole('button', { name: 'Play voice message' }).length).toBe(before + 1), { timeout: 3000 })
    expect(screen.queryByRole('button', { name: /^Remove Voice message/ })).toBeNull()
  })

  it('a thread’s reply box records too', async () => {
    await open('/w/engineering/c/c-general?thread=m-g10')
    const thread = await screen.findByRole('complementary', { name: 'Thread' })
    await recordVoice(() => userEvent.click(within(thread).getByRole('button', { name: 'Record a voice message' })))
    await waitFor(async () => expect((await trayCard(within(thread))).textContent).toContain('Voice message · 0:04'), { timeout: 3000 })
    await userEvent.click(within(thread).getByRole('button', { name: /^Reply|^Send/ }))
    expect(await within(thread).findByRole('button', { name: 'Play voice message' }, { timeout: 3000 })).toBeTruthy()
  })

  it('on a phone the buttons are in the + menu, 44 px, and nothing scrolls sideways', async () => {
    await open('/w/engineering/c/c-general', 'phone', 'dark')
    expect(screen.queryByRole('button', { name: 'Record a voice message' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Attach' }))
    for (const name of ['Record a video message', 'Record a voice message']) {
      const item = await screen.findByRole('menuitem', { name })
      expect(answersTouch(item), name).toEqual([true, true, true, true])
    }
    expect(sidewaysScroll()).toBeNull()
    await recordVoice(() => userEvent.click(screen.getByRole('menuitem', { name: 'Record a voice message' })))
    expect((await trayCard()).textContent).toContain('Voice message')
  })

  it('a browser that can’t record shows no buttons and no menu items', async () => {
    vi.mocked(recorder.canRecord).mockReturnValue(false)
    await open()
    expect(screen.queryByRole('button', { name: 'Record a voice message' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Record a video message' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Attach' }))
    await screen.findAllByRole('menuitem')
    expect(screen.queryByRole('menuitem', { name: /^Record a/ })).toBeNull()
  })

  it('an 11th file is refused with the tray’s sentence, and nothing uploads', async () => {
    await open()
    const picker = document.querySelector<HTMLInputElement>('input[type="file"]')!
    await userEvent.upload(picker, Array.from({ length: 10 }, (_, i) => new File([`note ${i}`], `note-${i}.txt`, { type: 'text/plain' })))
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Remove note-/ })).toHaveLength(10), { timeout: 3000 })
    const upload = vi.spyOn(api.files, 'uploadForChat')
    await recordVoice(() => userEvent.click(screen.getByRole('button', { name: 'Record a voice message' })))
    expect(await screen.findByText('Add up to 10 files at a time.')).toBeTruthy()
    expect(upload).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /^Remove Voice message/ })).toBeNull()
  })

  it('axe finds no serious problems with the dialog open, light and dark', async () => {
    for (const theme of ['light', 'dark'] as const) {
      await open('/w/engineering/c/c-general', 'desktop', theme)
      await userEvent.click(screen.getByRole('button', { name: 'Record a voice message' }))
      const dialog = await screen.findByRole('dialog', { name: 'Record a voice message' })
      await within(dialog).findByRole('button', { name: 'Stop' })
      expect(await axeProblems(), theme).toEqual([])
      await userEvent.click(within(dialog).getByRole('button', { name: 'Stop' }))
      await within(dialog).findByRole('button', { name: 'Attach' })
      expect(await axeProblems(), `${theme}, stopped`).toEqual([])
    }
  })
})
