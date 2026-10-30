import type { LinkPreview } from '@/api/types'
import { previewable, previewHost } from '@/lib/linkPreview'

/**
 * What the server would read from a few pages the demo links to (sample data: the prototype can't fetch other sites;
 * see docs/flow-chat/api-contract.md for the real fetch). Keys are the host and path without `www.` or a trailing `/`.
 */
const image = (name: string, width: number, height: number) => ({ url: `${import.meta.env.BASE_URL}link-previews/${name}.svg`, width, height })
const KNOWN: Record<string, Omit<LinkPreview, 'url'>> = {
  'elevenlabs.io': {
    title: 'Free AI Voice Generator & Voice Agents Platform | ElevenLabs',
    description: 'Create lifelike speech with our AI voice generator and build voice agents. Text to speech in 70+ languages, voice cloning and dubbing.',
    image: image('elevenlabs', 1200, 630),
  },
  'github.com/spark-sys/flow': {
    title: 'spark-sys/flow: Spark Flow, projects and chat for Spark Systems',
    description: 'The Spark Flow web client: React, TypeScript and Vite.',
    image: image('github', 1200, 600),
  },
  'figma.com/design/flow-chat': {
    title: 'Flow chat redesign',
    description: 'Channels, threads and the composer, light and dark.',
    image: image('figma', 400, 400),
  },
  'staging.nexus.spark-sys.com': {
    title: 'Nexus Core · Staging',
    description: 'The staging build of Nexus Core. Sign in with your Spark Systems account.',
    image: null,
  },
}

/** A page's address as the card shows it: host and path, without `www.` or a trailing `/`. */
const address = (url: string) => {
  const { pathname } = new URL(url)
  return `${previewHost(url)}${pathname.replace(/\/+$/, '')}`
}

export function linkPreviewFor(url: string): LinkPreview | null {
  if (!previewable(url)) return null
  const where = address(url)
  return { url, ...(KNOWN[where] ?? { title: where, description: null, image: null }) }
}
