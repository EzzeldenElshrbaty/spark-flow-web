import '@/index.css'
import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { api } from '@/lib/api'
import { renderApp } from '@/test/app'

// Project channels on the Chat side list the chats I may write in (11 Nov 2026): a project's chat I may only read
// stays out of the sidebar unless I star it, and still opens from its address, the project's Chat tab and search.
// Channels lists the channels I'm in and, for whoever may manage every public channel (Admin), every public one.

// Start from a fresh seed, as the Admin, the only one who may reset it.
beforeEach(async () => {
  await api.auth.signOut().catch(() => {})
  localStorage.setItem('spark-flow.session', 'u-1')
  await api.db.reset()
})

/** The rows of one sidebar section, by link address. */
const section = (name: string) => {
  const button = screen.queryByRole('button', { name })
  if (!button) return []
  return within(document.getElementById(button.getAttribute('aria-controls')!)!)
    .getAllByRole('link')
    .map((a) => a.getAttribute('href'))
}

describe('Project channels', () => {
  it('lists only the chats of projects I’m on, as a Member', async () => {
    // Mariam is on Nexus Core and El Moasser portal, not on Mobile App or Sela booking.
    const app = await renderApp({ path: '/w/engineering/c/c-general', as: 'member', theme: 'light', size: 'desktop' })
    await app.settled()
    expect(section('Project channels')).toEqual(['/w/engineering/c/c-p-nex', '/w/engineering/c/c-p-elm'])
  })

  it('lists every project’s chat for the Admin, who may write in all of them', async () => {
    const app = await renderApp({ path: '/w/engineering/c/c-general', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    expect(section('Project channels')).toEqual(['/w/engineering/c/c-p-nex', '/w/engineering/c/c-p-mob', '/w/engineering/c/c-p-elm', '/w/engineering/c/c-p-sel'])
  })

  it('still opens a chat I may only read from its address, and a star keeps it under Starred', async () => {
    const app = await renderApp({ path: '/w/engineering/c/c-p-mob', as: 'member', theme: 'light', size: 'desktop' })
    await app.settled()
    expect(screen.getByText('You can read this channel. Only its project’s people can write here.')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Star channel' }))
    await waitFor(() => expect(section('Starred')).toContain('/w/engineering/c/c-p-mob'))
    expect(section('Project channels')).not.toContain('/w/engineering/c/c-p-mob')
  })
})

describe('Channels', () => {
  it('lists every public channel for the Admin, joined or not, and no private one he isn’t in', async () => {
    await api.chat.leave('c-frontend')
    // Nour makes one public and one private channel with Salma, without Youssef.
    localStorage.setItem('spark-flow.session', 'u-2')
    const open = await api.chat.createChannel({ workspaceId: 'ws-eng', name: 'ops-room', topic: '', isPrivate: false, memberIds: ['u-5'] })
    const closed = await api.chat.createChannel({ workspaceId: 'ws-eng', name: 'ops-secret', topic: '', isPrivate: true, memberIds: ['u-5'] })

    const app = await renderApp({ path: '/w/engineering/c/c-general', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    const listed = [...section('Starred'), ...section('Channels')]
    expect(listed).toEqual(expect.arrayContaining(['/w/engineering/c/c-frontend', `/w/engineering/c/${open.id}`]))
    expect(listed).not.toContain(`/w/engineering/c/${closed.id}`)
  })

  it('lists only the channels a Member is in', async () => {
    // Mariam isn’t in #backend, a public channel.
    const app = await renderApp({ path: '/w/engineering/c/c-general', as: 'member', theme: 'light', size: 'desktop' })
    await app.settled()
    expect([...section('Starred'), ...section('Channels')]).not.toContain('/w/engineering/c/c-backend')
  })
})
