import { describe, expect, it } from 'vitest'
import { safeFileUrl } from './safeFileUrl'

const origin = 'https://flow.spark-sys.com'

describe('safeFileUrl', () => {
  it('keeps same-origin paths, https and blob addresses', () => {
    expect(safeFileUrl('/api/files/a-1', origin)).toBe('/api/files/a-1')
    expect(safeFileUrl('https://cdn.example.com/x.png', origin)).toBe('https://cdn.example.com/x.png')
    expect(safeFileUrl('blob:https://flow.spark-sys.com/1234-abcd', origin)).toBe('blob:https://flow.spark-sys.com/1234-abcd')
    expect(safeFileUrl('http://flow.spark-sys.com/api/files/a-1', 'http://flow.spark-sys.com')).toBe('http://flow.spark-sys.com/api/files/a-1')
  })

  it('refuses script, data, cross-origin http and other schemes', () => {
    for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', 'http://evil.example.com/x.pdf', 'file:///etc/passwd', ''])
      expect(safeFileUrl(bad, origin), bad).toBeNull()
  })
})
