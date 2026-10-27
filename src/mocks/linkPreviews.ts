import type { LinkPreview } from '@/api/types'
import { PREVIEW_DOMAINS, previewDomain } from '@/lib/linkPreview'

/**
 * What the server would read from a few pages the demo links to. The prototype can't fetch other sites (and a real
 * server must only fetch allowed domains, see docs/flow-chat/api-contract.md), so any other allowed page is named
 * after its address.
 */
const KNOWN: Record<string, Pick<LinkPreview, 'title' | 'description'>> = {
  'https://staging.nexus.spark-sys.com': {
    title: 'Nexus Core · Staging',
    description: 'The staging build of Nexus Core. Sign in with your Spark Systems account.',
  },
}

export function linkPreviewFor(url: string): LinkPreview | null {
  const domain = previewDomain(url)
  if (!domain) return null
  const known = KNOWN[url.replace(/\/$/, '')]
  if (known) return { url, siteName: PREVIEW_DOMAINS[domain], ...known, image: null }
  const { pathname } = new URL(url)
  const path = pathname.replace(/^\/|\/$/g, '')
  return { url, siteName: PREVIEW_DOMAINS[domain], title: path || new URL(url).hostname, description: null, image: null }
}
