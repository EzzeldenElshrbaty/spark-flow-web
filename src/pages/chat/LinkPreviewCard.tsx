import { IconLink, IconX } from '@tabler/icons-react'
import clsx from 'clsx'
import { useState } from 'react'
import { useLinkPreview } from '@/api/chat'
import type { LinkPreview } from '@/api/types'
import { IconButton } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { apiUrl } from '@/lib/api'
import { ownImage, previewHost } from '@/lib/linkPreview'

/** An image wide enough to lead the card: at least 400px across and clearly landscape (og cards are 1.91:1). */
const isWide = ({ width, height }: { width: number; height: number }) => width >= 400 && height > 0 && width / height >= 1.3

/** Where a preview image may come from: this app, and the API that proxies it. */
const imageOrigins = () => [location.origin, new URL(apiUrl('/'), location.origin).origin]

/**
 * A link's preview (spec 6.3 URL unfurl): a wide image across the top, a small one as a thumbnail, or text only; then
 * the title, two lines of description and the host. Under a message it opens the page; in the box (`onRemove`) it is
 * compact, not a link, and × takes it off. `url` is the address the message holds (already checked): the card links
 * there, never to an address only the server answered.
 */
export function LinkPreviewView({ preview, url = preview.url, onRemove }: { preview: LinkPreview; url?: string; onRemove?: () => void }) {
  const [failed, setFailed] = useState(false)
  const compact = Boolean(onRemove)
  const src = preview.image && !failed ? ownImage(preview.image.url, imageOrigins()) : null
  const layout = !src ? 'text' : !compact && isWide(preview.image!) ? 'wide' : 'thumb'
  const host = previewHost(url)
  const image = src && (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={layout === 'wide' ? { aspectRatio: `${preview.image!.width} / ${preview.image!.height}` } : undefined}
      className={clsx(
        'bg-sf-surface-sunken object-cover',
        layout === 'wide' ? 'block max-h-[272px] w-full border-b border-sf-line' : clsx('flex-none rounded-sf-md border border-sf-line', compact ? 'size-12' : 'size-16'),
      )}
    />
  )
  const text = (
    <span className="min-w-0 flex-1">
      <span className={clsx('block font-sf text-[14px]/[20px] font-semibold text-sf-text', compact ? 'truncate' : 'line-clamp-2')}>{preview.title}</span>
      {preview.description && <span className={clsx('sf-small text-sf-text-secondary', compact ? 'block truncate' : 'line-clamp-2')}>{preview.description}</span>}
      {preview.title !== host && (
        <span className="sf-meta mt-0.5 flex min-w-0 items-center gap-1 text-sf-text-muted">
          <Icon icon={IconLink} size={14} />
          <bdi dir="ltr" className="truncate">
            {host}
          </bdi>
        </span>
      )}
    </span>
  )
  const inner = (
    <>
      {layout === 'wide' && image}
      <span className={clsx('flex items-center gap-3', compact ? 'py-2 ps-3 pe-1' : 'p-3')}>
        {text}
        {layout === 'thumb' && image}
        {onRemove && <IconButton label="Remove preview" icon={IconX} size="sm" tone="muted" className="relative self-start max-md:after:absolute max-md:after:-inset-2" onClick={onRemove} />}
      </span>
    </>
  )
  const frame = 'block overflow-hidden rounded-sf-lg border border-sf-line bg-sf-surface'
  return onRemove ? (
    <div role="group" aria-label={`Link preview: ${host}`} data-layout={layout} className={clsx(frame, 'mx-2 mt-2')}>
      {inner}
    </div>
  ) : (
    <a data-layout={layout} href={url} target="_blank" rel="noopener noreferrer" className={clsx(frame, 'sf-focus mt-1 max-w-[520px] hover:bg-sf-surface-hover')}>
      {inner}
    </a>
  )
}

/** The preview under a message, once the server has read the page; nothing while it loads or when there is none. */
export function LinkPreviewCard({ url }: { url: string }) {
  const preview = useLinkPreview(url).data
  return preview ? <LinkPreviewView key={url} preview={preview} url={url} /> : null
}

/** The preview above the box while I write (spec 6.3), with × to send the message without it. */
export function ComposerLinkPreview({ url, onRemove }: { url: string; onRemove: () => void }) {
  const preview = useLinkPreview(url).data
  return preview ? <LinkPreviewView key={url} preview={preview} url={url} onRemove={onRemove} /> : null
}

/** RichComposer's `linkPreview`: the card above the box, read through the API. */
export const composerLinkPreview = (url: string, onRemove: () => void) => <ComposerLinkPreview url={url} onRemove={onRemove} />
