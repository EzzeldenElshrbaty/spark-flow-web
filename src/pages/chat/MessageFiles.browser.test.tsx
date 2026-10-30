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
    uploadedBy: 'u-2', title: `${id}.png`, description: '', scanStatus: 'clean', thumbUrl: null, previewUrl: null, deletedAt: null, snippet: null,
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
