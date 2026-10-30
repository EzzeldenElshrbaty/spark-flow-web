import { describe, expect, it } from 'vitest'
import { parseBody, validBody, type Body } from './messageBody'
import { dismissedPreview, firstPreviewable, ownImage, previewHost, previewable, withoutPreview } from './linkPreview'

describe('previewable (spec 6.3: any web link unfurls)', () => {
  it('allows any http or https address', () => {
    expect(previewable('https://elevenlabs.io/')).toBe(true)
    expect(previewable('http://example.com/a?b=1')).toBe(true)
    expect(previewable('https://staging.nexus.spark-sys.com')).toBe(true)
  })
  it('waits for a host with a dot, so a half-typed address is not fetched', () => {
    expect(previewable('https://ex')).toBe(false)
    expect(previewable('https://localhost:3000')).toBe(false)
  })
  it('refuses anything that is not a web address', () => {
    expect(previewable('ftp://spark-sys.com')).toBe(false)
    expect(previewable('javascript:alert(1)')).toBe(false)
    expect(previewable('not a url')).toBe(false)
  })
})

describe('previewHost', () => {
  it('is the host without www', () => {
    expect(previewHost('https://www.elevenlabs.io/voices')).toBe('elevenlabs.io')
    expect(previewHost('https://github.com/a')).toBe('github.com')
  })
})

describe('firstPreviewable', () => {
  it('is the first link in a body, or null', () => {
    expect(firstPreviewable(parseBody('see https://example.com and https://github.com/a'))).toBe('https://example.com')
    expect(firstPreviewable(parseBody('> https://figma.com/q'))).toBe('https://figma.com/q')
    expect(firstPreviewable(parseBody('- https://elevenlabs.io/'))).toBe('https://elevenlabs.io/')
    expect(firstPreviewable(parseBody('nothing here'))).toBeNull()
  })
  it('skips links in code', () => {
    expect(firstPreviewable(parseBody('```\nhttps://example.com\n```'))).toBeNull()
  })
  it('is null once the preview was removed (one card per message, so no later link takes its place)', () => {
    const body = withoutPreview(parseBody('https://example.com then https://github.com/a'), 'https://example.com')
    expect(firstPreviewable(body)).toBeNull()
  })
})

describe('withoutPreview and dismissedPreview (× on the card, spec 6.3)', () => {
  const body = parseBody('look https://elevenlabs.io/ now')
  it('marks the first link, and says which link was dismissed', () => {
    const off = withoutPreview(body, 'https://elevenlabs.io/')
    expect(dismissedPreview(off)).toBe('https://elevenlabs.io/')
    expect(dismissedPreview(body)).toBeNull()
  })
  it('changes nothing when the first link is another one', () => {
    expect(withoutPreview(body, 'https://github.com/a')).toEqual(body)
  })
  it('does not change the body it was given', () => {
    const copy: Body = structuredClone(body)
    withoutPreview(body, 'https://elevenlabs.io/')
    expect(body).toEqual(copy)
  })
  it('survives the server check of a client body', () => {
    const off = withoutPreview(body, 'https://elevenlabs.io/')
    expect(validBody(off)).toEqual(off)
  })
})

describe('ownImage (the browser never loads a site’s own image, spec 6.3)', () => {
  const origins = ['https://flow.spark-sys.com', 'https://api.spark-sys.com']
  it('allows the app’s and the API’s own addresses', () => {
    expect(ownImage('/link-previews/a.svg', origins)).toBe('/link-previews/a.svg')
    expect(ownImage('https://api.spark-sys.com/api/link-preview/image?u=1', origins)).toBe('https://api.spark-sys.com/api/link-preview/image?u=1')
  })
  it('refuses another site, a protocol-relative address, and anything not http(s)', () => {
    expect(ownImage('https://tracker.example.com/p.png', origins)).toBeNull()
    expect(ownImage('//tracker.example.com/p.png', origins)).toBeNull()
    expect(ownImage('javascript:alert(1)', origins)).toBeNull()
    expect(ownImage('data:image/svg+xml,<svg/>', origins)).toBeNull()
  })
})

describe('the server check keeps only a real noPreview mark', () => {
  it('drops anything but true', () => {
    for (const noPreview of [false, 'true', 1]) {
      expect(validBody([{ type: 'p', children: [{ type: 'link', href: 'https://a.com/', text: 'a', noPreview }] }])).toEqual([{ type: 'p', children: [{ type: 'link', href: 'https://a.com/', text: 'a' }] }])
    }
  })
})
