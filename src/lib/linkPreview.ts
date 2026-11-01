import type { Block, Body, Inline } from '@/lib/messageBody'

/**
 * Whether a link gets a preview card (spec 6.3 URL unfurls): any http or https address whose host has a dot, so a
 * half-typed `https://ex` isn't sent to the server to fetch.
 */
export function previewable(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return ['http:', 'https:'].includes(protocol) && hostname.includes('.')
  } catch {
    return false
  }
}

/**
 * A preview image's address when it is served by the app or the API (`origins`), else null: the browser never loads
 * the linked site's own image, which would tell that site who is reading (spec 6.3, the API proxies it).
 */
export function ownImage(src: string, origins: string[]): string | null {
  if (src.startsWith('//')) return null
  try {
    const url = new URL(src, origins[0])
    return ['http:', 'https:'].includes(url.protocol) && origins.includes(url.origin) ? src : null
  } catch {
    return null
  }
}

/** The host a card names, without `www.`: "elevenlabs.io". */
export const previewHost = (url: string): string => new URL(url).hostname.replace(/^www\./, '')

/** A block's inlines in reading order; code blocks have none (their text isn't linked). */
const inlines = (b: Block): Inline[] => (b.type === 'p' ? b.children : b.type === 'quote' ? b.children.flatMap(inlines) : b.type === 'code' ? [] : b.items.flat())

type LinkInline = Extract<Inline, { type: 'link' }>
const firstLink = (body: Body): LinkInline | null =>
  (body.flatMap(inlines).find((n): n is LinkInline => n.type === 'link' && previewable(n.href)) ?? null)

/** The link a message previews: its first, unless its author removed that card (one card per message). */
export function firstPreviewable(body: Body): string | null {
  const link = firstLink(body)
  return link && !link.noPreview ? link.href : null
}

/** The link whose card the author removed, or null: an edit opens with that choice kept. */
export function dismissedPreview(body: Body): string | null {
  const link = firstLink(body)
  return link?.noPreview ? link.href : null
}

/** The body with its first link marked `noPreview` when that link is `href` (× on the card); a new body. */
export function withoutPreview(body: Body, href: string): Body {
  const target = firstLink(body)
  if (target?.href !== href) return body
  const mark = (n: Inline): Inline => (n === target ? { ...target, noPreview: true } : n)
  const block = (b: Block): Block =>
    b.type === 'p' ? { ...b, children: b.children.map(mark) } : b.type === 'quote' ? { ...b, children: b.children.map(block) } : b.type === 'code' ? b : { ...b, items: b.items.map((item) => item.map(mark)) }
  return body.map(block)
}
