import '@/index.css'
import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { api } from '@/lib/api'
import { renderApp } from '@/test/app'
import { axeProblems } from '@/test/axe'
import { answersTouch } from '@/test/touch'

// The seeded voice message (Nour's m-g04 in #general, a 4-second WAV), in the whole app, as Youssef (Admin).

beforeEach(async () => {
  await api.auth.signOut().catch(() => {})
  localStorage.setItem('spark-flow.session', 'u-1')
  await api.db.reset()
})

async function openGeneral(theme: 'light' | 'dark' = 'light', size: 'desktop' | 'phone' = 'desktop') {
  const app = await renderApp({ path: '/w/engineering/c/c-general', as: 'admin', theme, size })
  await app.settled()
  const play = await screen.findByRole('button', { name: 'Play voice message' }, { timeout: 3000 })
  play.scrollIntoView({ block: 'center' })
  return play
}

describe('a voice message in the channel (chat spec 6.9)', () => {
  it('plays its recording, and the time and waveform follow', async () => {
    const play = await openGeneral()
    const audio = play.closest('div')!.querySelector('audio')!
    expect(screen.getByText('0:04')).toBeTruthy()
    await userEvent.click(play)
    await vi.waitFor(() => expect(audio.currentTime).toBeGreaterThan(0.3), { timeout: 3000 })
    expect(screen.getByRole('button', { name: 'Pause voice message' })).toBeTruthy()
    await vi.waitFor(() => expect(play.closest('div')!.querySelectorAll('[data-played]').length).toBeGreaterThan(0))
    await userEvent.click(screen.getByRole('button', { name: 'Pause voice message' }))
    expect(audio.paused).toBe(true)
  })

  it('axe finds no serious problems, light and dark', async () => {
    for (const theme of ['light', 'dark'] as const) {
      await openGeneral(theme)
      expect(await axeProblems(), theme).toEqual([])
    }
  })

  it('on a phone every bar fits the slider, the slider answers touch, and the file pill stays off the player (final review)', async () => {
    const play = await openGeneral('dark', 'phone')
    const card = play.parentElement!
    const slider = within(card).getByRole('slider', { name: 'Position' })
    const box = slider.getBoundingClientRect()
    const bars = [...slider.querySelectorAll('[data-bar]')].map((bar) => bar.getBoundingClientRect())
    expect(bars).toHaveLength(48)
    expect(bars.every((b) => b.left >= box.left - 0.5 && b.right <= box.right + 0.5)).toBe(true)
    // The bars run the slider's width, so a seek lands where the bar is.
    expect(bars.at(-1)!.right).toBeGreaterThan(box.right - 4)
    expect(answersTouch(slider)).toEqual([true, true, true, true])
    const pill = screen.getByRole('group', { name: 'Voice message.wav actions' }).getBoundingClientRect()
    const player = card.getBoundingClientRect()
    expect(pill.bottom <= player.top || pill.top >= player.bottom).toBe(true)
  })
})
