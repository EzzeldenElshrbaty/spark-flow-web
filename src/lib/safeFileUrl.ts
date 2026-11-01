/**
 * The address to use for a file's src or href, or null when it isn't safe: only same-origin addresses, https, and
 * blob: (files from our own store) pass. javascript:, data:, cross-origin http and anything else are refused.
 */
export function safeFileUrl(url: string, origin: string = globalThis.location?.origin ?? 'http://localhost'): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  let parsed: URL
  try {
    parsed = new URL(trimmed, origin)
  } catch {
    return null
  }
  if (parsed.protocol === 'blob:' || parsed.protocol === 'https:') return trimmed
  if (parsed.origin === new URL(origin).origin) return trimmed
  return null
}
