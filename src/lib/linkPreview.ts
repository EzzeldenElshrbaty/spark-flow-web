import type { Block, Body, Inline } from '@/lib/messageBody'

/**
 * Domains whose pages get a preview card under the message (spec 6.3 URL unfurls). One list for the client and
 * the server; an admin setting can replace it later.
 */
export const PREVIEW_DOMAINS: Record<string, string> = {
  'spark-sys.com': 'Spark Systems',
  'github.com': 'GitHub',
  'figma.com': 'Figma',
  'docs.google.com': 'Google Docs',
}

/** The listed domain a web address belongs to (the domain itself or a subdomain), or null. */
export function previewDomain(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  const host = parsed.hostname.toLowerCase()
  return Object.keys(PREVIEW_DOMAINS).find((d) => host === d || host.endsWith(`.${d}`)) ?? null
}

/** Whether a link gets a preview card. */
export const previewable = (url: string): boolean => previewDomain(url) !== null

/** The first link in a body that gets a preview, or null (one card per message, like the task unfurl). */
export function firstPreviewable(body: Body): string | null {
  const inlines = (b: Block): Inline[] => (b.type === 'p' ? b.children : b.type === 'quote' ? b.children.flatMap(inlines) : b.type === 'code' ? [] : b.items.flat())
  for (const n of body.flatMap(inlines)) if (n.type === 'link' && previewable(n.href)) return n.href
  return null
}
