/**
 * The path (with its query and hash) of an address on Flow's own origin, so a link to it moves inside the app (chat
 * spec 6.14 §8: a bookmark to a project opens it in Flow); null for any other address, which opens in a new tab.
 */
export function appPath(url: string, origin: string = globalThis.location?.origin ?? ''): string | null {
  try {
    const parsed = new URL(url)
    if (!origin || !['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) return null
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return null
  }
}
