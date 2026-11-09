// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Trash2 } from 'lucide-react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IconButton } from './IconButton'

// UX Phase 3 (3.5, 3.7): one icon button for the kit look; its label is both its name and its tooltip.

afterEach(cleanup)

describe('IconButton', () => {
  it('is named and titled by its label, with the icon hidden', () => {
    const onClick = vi.fn()
    render(<IconButton label="Delete phase" icon={Trash2} onClick={onClick} />)
    const button = screen.getByRole('button', { name: 'Delete phase' })
    expect(button.getAttribute('title')).toBe('Delete phase')
    expect(button.getAttribute('type')).toBe('button')
    expect(button.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('sizes: md is 36px, sm 32px, touch 44px on phones; a focus ring in brand red', () => {
    render(
      <>
        <IconButton label="A" icon={Trash2} />
        <IconButton label="B" icon={Trash2} size="sm" />
        <IconButton label="C" icon={Trash2} touch />
      </>,
    )
    expect(screen.getByRole('button', { name: 'A' }).className).toContain('size-9')
    expect(screen.getByRole('button', { name: 'B' }).className).toContain('size-8')
    expect(screen.getByRole('button', { name: 'C' }).className).toContain('max-sm:size-11')
    expect(screen.getByRole('button', { name: 'A' }).className).toContain('focus-visible:outline-brand-500')
    expect(screen.getByRole('button', { name: 'A' }).className).toContain('dark:focus-visible:outline-brand-400')
  })

  it('a danger one turns red on hover; pressed, disabled and a ref pass through', () => {
    const ref = createRef<HTMLButtonElement>()
    render(
      <>
        <IconButton label="Remove" icon={Trash2} tone="danger" />
        <IconButton ref={ref} label="Bold" icon={Trash2} aria-pressed disabled />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Remove' }).className).toContain('hover:text-red-600')
    const bold = screen.getByRole('button', { name: 'Bold' })
    expect(bold.getAttribute('aria-pressed')).toBe('true')
    expect((bold as HTMLButtonElement).disabled).toBe(true)
    expect(ref.current).toBe(bold)
  })
})
