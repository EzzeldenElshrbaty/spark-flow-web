import type { Attachment } from '@/api/types'
import { apiUrl } from '@/lib/api'
import { previewOf, type Preview } from '@/lib/fileTypes'

/** What the file viewer shows for a file: an office file opens as its converted PDF, and Download still saves the file itself. */
export type ViewedFile = { name: string; url: string; sizeKb?: number; preview?: Preview; download?: { url: string; name: string } | null }

/** How a file opens in the viewer (spec 6.9), from its address (`url`); null while there is none. */
export function viewedFile(file: Pick<Attachment, 'name' | 'size' | 'previewUrl'>, url: string | null): ViewedFile | null {
  const sizeKb = Math.round(file.size / 1024)
  if (previewOf(file.name) === 'none' && file.previewUrl) return { name: file.name, url: file.previewUrl, preview: 'pdf', download: url ? { url, name: file.name } : null, sizeKb }
  return url ? { name: file.name, url, sizeKb } : null
}

/**
 * Whether a fetch for a file sends cookies: only to our own API. A converted preview lives at a storage address
 * that must get none (it is signed instead, and with cookies the browser would refuse it).
 */
export function fetchCredentials(url: string): RequestCredentials {
  try {
    const target = new URL(url, location.href)
    const ours = new URL(apiUrl('/'), location.href)
    return (target.protocol === 'http:' || target.protocol === 'https:') && target.origin === ours.origin ? 'include' : 'omit'
  } catch {
    return 'omit'
  }
}
