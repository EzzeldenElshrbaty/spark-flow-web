// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LinkPreview } from '@/api/types'
import { LinkPreviewView } from './LinkPreviewCard'

afterEach(cleanup)

const wide: LinkPreview = {
  url: 'https://elevenlabs.io/',
  title: 'Free AI Voice Generator & Voice Agents Platform | ElevenLabs',
  description: 'Create lifelike speech.',
  image: { url: '/link-previews/elevenlabs.svg', width: 1200, height: 630 },
}
const layout = (container: HTMLElement) => container.querySelector('[data-layout]')?.getAttribute('data-layout')

describe('LinkPreviewView under a message (spec 6.3)', () => {
  it('opens the page in a new tab, named by its title', () => {
    render(<LinkPreviewView preview={wide} />)
    const link = screen.getByRole('link', { name: /Free AI Voice Generator/ })
    expect(link.getAttribute('href')).toBe('https://elevenlabs.io/')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })
  it('puts a wide image on top, full width, sized before it loads', () => {
    const { container } = render(<LinkPreviewView preview={wide} />)
    expect(layout(container)).toBe('wide')
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe('/link-previews/elevenlabs.svg')
    expect(img.style.aspectRatio).toBe('1200 / 630')
    expect(img.compareDocumentPosition(screen.getByText(wide.title)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('shows a small or square image as a thumbnail beside the text', () => {
    const { container } = render(<LinkPreviewView preview={{ ...wide, image: { url: '/x.svg', width: 400, height: 400 } }} />)
    expect(layout(container)).toBe('thumb')
    const { container: small } = render(<LinkPreviewView preview={{ ...wide, image: { url: '/x.svg', width: 300, height: 150 } }} />)
    expect(layout(small)).toBe('thumb')
  })
  it('is text only without an image, and drops an image that fails to load', () => {
    const { container } = render(<LinkPreviewView preview={{ ...wide, image: null }} />)
    expect(layout(container)).toBe('text')
    expect(container.querySelector('img')).toBeNull()
    cleanup()
    const { container: failing } = render(<LinkPreviewView preview={wide} />)
    fireEvent.error(failing.querySelector('img')!)
    expect(failing.querySelector('img')).toBeNull()
    expect(layout(failing)).toBe('text')
  })
  it('never loads an image from an address that is not safe', () => {
    const { container } = render(<LinkPreviewView preview={{ ...wide, image: { url: 'javascript:alert(1)', width: 1200, height: 630 } }} />)
    expect(container.querySelector('img')).toBeNull()
  })
  it('links only to the address the message holds, whatever the server answered', () => {
    render(<LinkPreviewView preview={{ ...wide, url: 'javascript:alert(1)' }} url="https://elevenlabs.io/" />)
    expect(screen.getByRole('link').getAttribute('href')).toBe('https://elevenlabs.io/')
  })
  it('never loads an image from another site (the API serves it)', () => {
    const { container } = render(<LinkPreviewView preview={{ ...wide, image: { url: 'https://tracker.example.com/p.png', width: 1200, height: 630 } }} />)
    expect(container.querySelector('img')).toBeNull()
  })
  it('names the host with a link icon, unless the title already is the host', () => {
    render(<LinkPreviewView preview={{ ...wide, url: 'https://www.elevenlabs.io/' }} />)
    expect(screen.getByText('elevenlabs.io')).toBeTruthy()
    cleanup()
    render(<LinkPreviewView preview={{ url: 'https://example.com/', title: 'example.com', description: null, image: null }} />)
    expect(screen.getAllByText('example.com')).toHaveLength(1)
  })
})

describe('LinkPreviewView in the box (compact, with ×)', () => {
  it('is not a link, keeps the image small, and × removes it', () => {
    const onRemove = vi.fn()
    const { container } = render(<LinkPreviewView preview={wide} onRemove={onRemove} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByRole('group', { name: 'Link preview: elevenlabs.io' })).toBeTruthy()
    expect(layout(container)).toBe('thumb')
    fireEvent.click(screen.getByRole('button', { name: 'Remove preview' }))
    expect(onRemove).toHaveBeenCalledOnce()
  })
})
