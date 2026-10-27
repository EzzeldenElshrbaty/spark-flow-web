import { describe, expect, it } from 'vitest'
import { parseBody } from './messageBody'
import { firstPreviewable, previewable } from './linkPreview'

describe('previewable (spec 6.3: unfurls for allowed domains)', () => {
  it('allows the listed domains and their subdomains, over http or https', () => {
    expect(previewable('https://spark-sys.com/docs')).toBe(true)
    expect(previewable('https://staging.nexus.spark-sys.com')).toBe(true)
    expect(previewable('http://github.com/spark/flow/pull/12')).toBe(true)
  })
  it('refuses other domains, look-alikes and anything that is not a web address', () => {
    expect(previewable('https://example.com')).toBe(false)
    expect(previewable('https://notspark-sys.com')).toBe(false)
    expect(previewable('https://spark-sys.com.evil.io/x')).toBe(false)
    expect(previewable('ftp://spark-sys.com')).toBe(false)
    expect(previewable('not a url')).toBe(false)
  })
})

describe('firstPreviewable', () => {
  it('is the first allowed link in a body, or null', () => {
    expect(firstPreviewable(parseBody('see https://example.com and https://github.com/a then https://figma.com/b'))).toBe('https://github.com/a')
    expect(firstPreviewable(parseBody('> https://figma.com/q'))).toBe('https://figma.com/q')
    expect(firstPreviewable(parseBody('nothing here'))).toBeNull()
  })
})
