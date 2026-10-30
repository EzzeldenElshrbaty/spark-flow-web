/**
 * A typed address as a web link: http or https, with https assumed when no scheme is given, and a host with a dot;
 * null otherwise (so never `javascript:`, `data:` or `ftp:`). Links in the composer and channel bookmarks use it.
 */
export function webAddress(typed: string): string | null {
  const text = typed.trim()
  if (!text) return null
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`
  try {
    const url = new URL(withScheme)
    return ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.') ? url.href : null
  } catch {
    return null
  }
}
