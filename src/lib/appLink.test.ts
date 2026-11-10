import { describe, expect, it } from 'vitest'
import { appPath } from '@/lib/appLink'

describe('appPath (chat spec 6.14 §8: bookmarks to Flow open in Flow)', () => {
  it('only Flow’s own addresses are app paths', () => {
    const origin = 'https://flow.spark-sys.com'
    expect(appPath('https://flow.spark-sys.com/w/engineering/p/NEX/overview?x=1#y', origin)).toBe('/w/engineering/p/NEX/overview?x=1#y')
    for (const url of ['https://wiki.spark-sys.com/a', 'https://flow.spark-sys.com:8443/w', 'http://flow.spark-sys.com/w', 'javascript:alert(1)', 'not a url']) {
      expect(appPath(url, origin), url).toBeNull()
    }
  })

  it('a path that a router would read as another site is not an app path (security review)', () => {
    const origin = 'https://flow.spark-sys.com'
    for (const url of ['https://flow.spark-sys.com//evil.example/x', 'https://flow.spark-sys.com/\\evil.example/x', 'https://flow.spark-sys.com/%5Cevil.example']) {
      expect(appPath(url, origin), url).toBeNull()
    }
  })

  it('with no origin (no window, as in the mock’s own tests) nothing is an app path', () => {
    expect(appPath('https://flow.spark-sys.com/w', '')).toBeNull()
  })
})
