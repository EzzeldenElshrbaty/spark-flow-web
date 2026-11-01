// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { Attachment } from '@/api/types'
import { fetchCredentials, viewedFile } from '@/lib/fileView'

const file = (name: string, previewUrl: string | null = null) => ({ id: 'a1', name, title: name, size: 2048, previewUrl }) as Attachment

describe('viewedFile (spec 6.9 previews)', () => {
  it('an office file opens as its converted PDF, and Download still saves the file itself', () => {
    expect(viewedFile(file('plan.docx', 'https://files.example.com/p.pdf'), 'blob:x/a1')).toEqual({
      name: 'plan.docx', url: 'https://files.example.com/p.pdf', preview: 'pdf', download: { url: 'blob:x/a1', name: 'plan.docx' }, sizeKb: 2,
    })
  })
  it('anything else opens as itself; nothing to open without an address', () => {
    expect(viewedFile(file('scope.pdf'), 'blob:x/a1')).toEqual({ name: 'scope.pdf', url: 'blob:x/a1', sizeKb: 2 })
    expect(viewedFile(file('scope.pdf'), null)).toBeNull()
  })
})

describe('fetchCredentials', () => {
  it('sends cookies only to our own API; a storage address (a converted preview) gets none', () => {
    expect(fetchCredentials('/api/files/a1')).toBe('include')
    expect(fetchCredentials(new URL('/api/files/a1', location.origin).href)).toBe('include')
    expect(fetchCredentials('https://files.example.com/p.pdf?sig=1')).toBe('omit')
    expect(fetchCredentials('blob:http://localhost/x')).toBe('omit')
  })
})
