// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModeSwitch } from '@/layout/ModeSwitch'

afterEach(cleanup)

const show = (props: Partial<Parameters<typeof ModeSwitch>[0]> = {}) => {
  const onSelect = vi.fn()
  render(<ModeSwitch mode="projects" chatCount={0} projectNews={false} onSelect={onSelect} {...props} />)
  return onSelect
}

describe('ModeSwitch (spec 5.5)', () => {
  it('is a tablist of Projects and Chat with the side on screen selected and the only one in the tab order', () => {
    show({ mode: 'chat' })
    expect(screen.getByRole('tablist', { name: 'Workspace' })).toBeTruthy()
    const projects = screen.getByRole('tab', { name: 'Projects' })
    const chat = screen.getByRole('tab', { name: 'Chat' })
    expect(chat.getAttribute('aria-selected')).toBe('true')
    expect(projects.getAttribute('aria-selected')).toBe('false')
    expect(chat.tabIndex).toBe(0)
    expect(projects.tabIndex).toBe(-1)
  })

  it('moves to the other side on a click, and does nothing on the side already open', () => {
    const onSelect = show({ mode: 'projects' })
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }))
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }))
    expect(onSelect).toHaveBeenCalledWith('chat')
  })

  it('arrow keys, Home and End move focus between the two without switching', () => {
    const onSelect = show({ mode: 'projects' })
    const projects = screen.getByRole('tab', { name: 'Projects' })
    const chat = screen.getByRole('tab', { name: 'Chat' })
    projects.focus()
    fireEvent.keyDown(projects, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(chat)
    fireEvent.keyDown(chat, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(projects)
    fireEvent.keyDown(projects, { key: 'End' })
    expect(document.activeElement).toBe(chat)
    fireEvent.keyDown(chat, { key: 'Home' })
    expect(document.activeElement).toBe(projects)
    fireEvent.keyDown(projects, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(chat)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('the other side carries its news: Chat its red count, Projects a dot, both read out', () => {
    show({ mode: 'projects', chatCount: 3 })
    expect(screen.getByRole('tab', { name: /^Chat,\s*3\s*unread$/ })).toBeTruthy()
    cleanup()
    show({ mode: 'chat', projectNews: true, chatCount: 3 })
    expect(screen.getByRole('tab', { name: /^Projects,\s*new mentions in tasks$/ })).toBeTruthy()
    // The side on screen shows its news in the sidebar itself.
    expect(screen.getByRole('tab', { name: 'Chat' })).toBeTruthy()
  })

  it('the white thumb sits under the side on screen and slides unless motion is reduced', () => {
    show({ mode: 'chat' })
    const thumb = screen.getByRole('tablist').querySelector('[data-thumb]') as HTMLElement
    expect(thumb.className).toContain('bg-sf-white')
    expect(thumb.className).toContain('translate-x-full')
    expect(thumb.className).toContain('motion-reduce:transition-none')
  })

  it('in the collapsed sidebar it stands upright with the names for screen readers only', () => {
    show({ mode: 'projects', size: 'rail', chatCount: 2 })
    const list = screen.getByRole('tablist')
    expect(list.getAttribute('aria-orientation')).toBe('vertical')
    expect(screen.getByRole('tab', { name: /^Chat,\s*2\s*unread$/ })).toBeTruthy()
    expect(screen.getByText('Projects').className).toContain('sr-only')
  })

  it('on a phone each side is a 48px touch target', () => {
    show({ size: 'phone' })
    expect(screen.getByRole('tablist').className).toContain('h-12')
  })
})
