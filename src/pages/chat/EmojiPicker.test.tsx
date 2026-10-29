// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmojiPicker } from '@/pages/chat/EmojiPicker'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const cell = (name: string) => screen.getAllByRole('button', { name })[0]

describe('EmojiPicker (spec 6.6)', () => {
  it('has search, the category tabs and a grid that starts with Frequently used', () => {
    render(<EmojiPicker onPick={vi.fn()} />)
    expect(screen.getByRole('searchbox', { name: 'Search emoji' })).toBeTruthy()
    const tabs = screen.getByRole('group', { name: 'Emoji categories' })
    expect([...tabs.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual([
      'Frequently used', 'Smileys & people', 'Nature', 'Food', 'Activities', 'Travel', 'Objects', 'Symbols', 'Flags',
    ])
    const first = screen.getByRole('group', { name: 'Frequently used' }).querySelector('button')!
    expect(first.getAttribute('aria-label')).toBe('thumbs up')
    expect(first.tabIndex).toBe(0)
  })

  it('picking an emoji hands it over and remembers it in Frequently used', () => {
    const onPick = vi.fn()
    render(<EmojiPicker onPick={onPick} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'snake' })[0])
    expect(onPick).toHaveBeenCalledWith('🐍')
    cleanup()
    render(<EmojiPicker onPick={vi.fn()} />)
    expect(screen.getByRole('group', { name: 'Frequently used' }).querySelector('button')!.getAttribute('aria-label')).toBe('snake')
  })

  it('search filters to the matches; nothing found says so', () => {
    render(<EmojiPicker onPick={vi.fn()} />)
    const search = screen.getByRole('searchbox', { name: 'Search emoji' })
    fireEvent.change(search, { target: { value: 'tada' } })
    const results = screen.getByRole('group', { name: 'Search results' })
    expect(results.querySelector('button')!.getAttribute('aria-label')).toBe('party popper')
    fireEvent.change(search, { target: { value: 'zzqx' } })
    expect(screen.getByText('No emoji match “zzqx”.')).toBeTruthy()
  })

  it('Enter in search picks the first match', () => {
    const onPick = vi.fn()
    render(<EmojiPicker onPick={onPick} />)
    const search = screen.getByRole('searchbox', { name: 'Search emoji' })
    fireEvent.change(search, { target: { value: '+1' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith('👍')
  })

  it('arrow keys move through the grid, the footer names the emoji in focus, typing goes to search', () => {
    render(<EmojiPicker onPick={vi.fn()} />)
    const first = cell('thumbs up')
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(document.activeElement?.getAttribute('aria-label')).toBe('red heart')
    expect(screen.getByTestId('emoji-preview').textContent).toContain('red heart')
    expect(screen.getByTestId('emoji-preview').textContent).toContain(':heart:')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    expect(document.activeElement?.getAttribute('aria-label')).toBe('thumbs up')
    fireEvent.keyDown(document.activeElement!, { key: 'c' })
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search emoji' }))
  })
})

describe('EmojiPicker category tabs (spec 6.6)', () => {
  it('the active category has the 2px accent bar under it; the others none', () => {
    render(<EmojiPicker onPick={vi.fn()} />)
    const tabs = [...screen.getByRole('group', { name: 'Emoji categories' }).querySelectorAll('button')]
    const active = tabs.filter((b) => b.getAttribute('aria-pressed') === 'true')
    expect(active).toHaveLength(1)
    expect(active[0].className.split(' ')).toEqual(expect.arrayContaining(['after:h-0.5', 'after:bg-sf-accent-fill', 'after:rounded-t-[2px]']))
    for (const b of tabs.filter((t) => t !== active[0])) expect(b.className).not.toContain('after:bg-sf-accent-fill')
  })
})
