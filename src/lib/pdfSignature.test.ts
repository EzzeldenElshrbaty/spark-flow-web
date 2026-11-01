import { describe, expect, it } from 'vitest'
import { isPdf } from './pdfSignature'

const bytes = (text: string) => new TextEncoder().encode(text)

describe('isPdf', () => {
  it('is true only for content that starts with %PDF-', () => {
    expect(isPdf(bytes('%PDF-1.7\n…'))).toBe(true)
    expect(isPdf(bytes('<html><script>alert(1)</script>'))).toBe(false)
    expect(isPdf(bytes(' %PDF-1.7'))).toBe(false)
    expect(isPdf(bytes('%PDF'))).toBe(false)
    expect(isPdf(new Uint8Array())).toBe(false)
  })
})
