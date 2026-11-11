import '@/index.css'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Attachment } from '@/api/types'
import { MessageFiles } from '@/pages/chat/MessageFiles'

// The frame's width needs real layout, so this runs in Chromium (the `browser` test project), with the app's CSS.

const urls: Record<string, string> = {}
vi.mock('@/components/AttachmentView', async (original) => ({
  ...(await original<typeof import('@/components/AttachmentView')>()),
  useFileUrl: (id: string | null) => ({ url: id ? (urls[id] ?? null) : null, failed: false }),
}))

afterEach(cleanup)

/** A clean PNG attachment `width` × `height`, its bytes drawn on a canvas. */
function image(width: number, height: number): Attachment {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.fillRect(0, 0, width, height)
  const id = `img-${width}x${height}`
  urls[id] = canvas.toDataURL('image/png')
  return {
    id, name: `${id}.png`, mimeType: 'image/png', size: 4096, createdAt: '2026-10-28T09:00:00.000Z',
    uploadedBy: 'u-2', title: `${id}.png`, description: '', scanStatus: 'clean', thumbUrl: null, previewUrl: null, deletedAt: null, snippet: null, clip: null, folderId: null,
  }
}

describe('MessageFiles image frame (spec 6.9: hugs the image, max 420px, radius-lg)', () => {
  it.each([
    [1600, 900],
    [2000, 300],
    [400, 1600],
    [100, 100],
  ])('a %i × %i image: the frame is the image plus its 1px border, never wider', async (width, height) => {
    render(
      <div className="sf" style={{ width: 760 }}>
        <MessageFiles attachments={[image(width, height)]} link="http://localhost/w/engineering/c/c-backend?message=m1" />
      </div>,
    )
    const img = screen.getByRole('img') as HTMLImageElement
    await vi.waitFor(() => expect(img.complete && img.naturalWidth).toBe(width))
    const frame = screen.getByRole('button', { name: new RegExp(`^Open ${img.alt}`) }).getBoundingClientRect()
    const shown = img.getBoundingClientRect()
    expect(shown.width).toBeLessThanOrEqual(420)
    expect(frame.width).toBeCloseTo(shown.width + 2, 0)
    expect(frame.height).toBeCloseTo(shown.height + 2, 0)
    // The file's pill sits on the image, not beside it.
    const pill = screen.getByRole('group', { name: `${img.alt} actions` }).getBoundingClientRect()
    expect(pill.right).toBeLessThanOrEqual(frame.right + 0.5)
  })
})

describe('a snippet card at 390px (spec 6.9, 6.16)', () => {
  it('a 5,000-line snippet with a 2,000-character line scrolls inside the card, never the page; Show all keeps up', async () => {
    const code = ['x'.repeat(2000), ...Array.from({ length: 4999 }, (_, i) => `SELECT ${i};`)].join('\n')
    urls['a-big'] = `data:text/plain;charset=utf-8,${encodeURIComponent(code)}`
    const big: Attachment = { ...image(10, 10), id: 'a-big', name: 'big.txt', title: 'big', mimeType: 'text/plain', snippet: { language: 'sql' } }
    render(
      <div className="sf" style={{ width: 390 }}>
        <MessageFiles attachments={[big]} />
      </div>,
    )
    const region = await screen.findByRole('region', { name: 'big' }, { timeout: 3000 })
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    expect(region.getBoundingClientRect().width).toBeLessThanOrEqual(390)
    expect(region.scrollWidth).toBeGreaterThan(region.clientWidth)
    const started = performance.now()
    screen.getByRole('button', { name: 'Show all 5000 lines' }).click()
    await vi.waitFor(() => expect(region.querySelectorAll('[data-line]')).toHaveLength(5000))
    expect(performance.now() - started).toBeLessThan(2000)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  })
})
