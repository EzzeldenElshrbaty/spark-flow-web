// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Avatar, avatarTone, Facepile, initials } from './Avatar'

// UX Phase 3 (3.1): one avatar for people everywhere, in chat and on pages — the kit's round, coloured look.

afterEach(cleanup)

describe('one avatar', () => {
  it('shows two initials, without "Dr." or "Eng."', () => {
    expect(initials('Nour El-Sayed')).toBe('NE')
    expect(initials('Dr. Nour El-Sayed')).toBe('NE')
    expect(initials('Eng. Omar Hassan Ali')).toBe('OH')
    expect(initials('Flowbot')).toBe('F')
  })

  it('gives a person one colour wherever they show, and people different ones', () => {
    expect(avatarTone('Mariam Fathy')).toBe(avatarTone('Mariam Fathy'))
    const tones = new Set(['Mariam Fathy', 'Nour El-Sayed', 'Omar Hassan', 'Dina Mansour', 'Karim Hassan', 'Hossam Gaber'].map(avatarTone))
    expect(tones.size).toBeGreaterThan(1)
    for (const tone of tones) expect(tone).toMatch(/^bg-\w+-100 text-\w+-800 dark:bg-\w+-500\/20 dark:text-\w+-200$/)
  })

  it('is round, sized in pixels, and looks the same inside and outside the chat scope', () => {
    const { container } = render(
      <>
        <Avatar name="Mariam Fathy" size={20} />
        <div className="sf">
          <Avatar name="Mariam Fathy" size={20} />
        </div>
      </>,
    )
    const [outside, inside] = container.querySelectorAll('[role="img"]')
    expect(outside!.className).toContain('rounded-full')
    expect(outside!.className).toContain('size-5')
    expect(outside!.className).toContain(avatarTone('Mariam Fathy'))
    expect(inside!.className).toBe(outside!.className)
    expect(outside!.className).not.toMatch(/sf-/)
  })

  it('is named by the person, with their presence, unless decorative', () => {
    render(
      <>
        <Avatar name="Nour El-Sayed" presence="active" />
        <Avatar name="Omar Hassan" decorative />
      </>,
    )
    const nour = screen.getByRole('img', { name: 'Nour El-Sayed, active' })
    expect(nour.querySelector('[data-presence="active"]')!.className).toContain('bg-emerald-500')
    expect(screen.queryByRole('img', { name: /Omar/ })).toBeNull()
  })

  it('apps are ink, and so am I in the top bar', () => {
    render(
      <>
        <Avatar name="Flowbot" app />
        <Avatar name="Youssef Abdelrahman" self />
      </>,
    )
    expect(screen.getByRole('img', { name: 'Flowbot' }).className).toContain('bg-ink-950 text-white')
    expect(screen.getByRole('img', { name: 'Youssef Abdelrahman' }).className).toContain('bg-ink-800 text-white')
  })

  it('a facepile shows the first few small and counts the rest', () => {
    render(<Facepile people={['Mariam Fathy', 'Nour El-Sayed', 'Omar Hassan', 'Dina Mansour'].map((name, i) => ({ id: `u-${i}`, name }))} />)
    const pile = screen.getByRole('img', { name: 'Mariam Fathy, Nour El-Sayed, Omar Hassan, Dina Mansour' })
    expect(pile.querySelectorAll('.rounded-full.size-5')).toHaveLength(3)
    expect(pile.textContent).toContain('+1')
  })
})
