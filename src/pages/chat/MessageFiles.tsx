import { IconFileText, IconFileTypePdf, IconPhoto } from '@tabler/icons-react'
import { useState } from 'react'
import type { Attachment } from '@/api/types'
import { sizeText, useFileUrl } from '@/components/AttachmentView'
import { Icon } from '@/components/sf/Icon'
import { FileViewer } from '@/components/ui/FileViewer'
import { previewOf } from '@/lib/fileTypes'

/** "PDF · 1.2 MB": the file's type from its extension, then its size. */
const subline = (a: Attachment) => {
  const ext = a.name.includes('.') ? a.name.split('.').pop()!.toUpperCase() : 'File'
  return `${ext} · ${sizeText(a.size)}`
}

function One({ attachment }: { attachment: Attachment }) {
  const { url, failed } = useFileUrl(attachment.id)
  const [viewing, setViewing] = useState(false)
  // Images the browser shows (not HEIC), and videos it can play; anything else is a file card that opens it.
  const playable = attachment.mimeType.startsWith('video/') && typeof document !== 'undefined' && document.createElement('video').canPlayType(attachment.mimeType) !== ''
  const preview = previewOf(attachment.name)
  const kind = preview === 'image' ? 'image' : playable ? 'video' : 'file'
  const viewer = viewing && url && <FileViewer files={[{ name: attachment.name, url, sizeKb: Math.round(attachment.size / 1024) }]} onClose={() => setViewing(false)} />

  if (failed) return <p className="sf-small text-sf-error">{attachment.name} couldn't be opened.</p>
  if (kind === 'image')
    return (
      <>
        <button type="button" onClick={() => setViewing(true)} className="sf-focus block overflow-hidden rounded-sf-lg border border-sf-line" aria-label={`Open ${attachment.name}`}>
          {url ? <img src={url} alt={attachment.name} className="max-h-60 max-w-full object-contain" /> : <span className="block h-32 w-48 animate-pulse bg-sf-surface-hover" />}
        </button>
        {viewer}
      </>
    )
  if (kind === 'video')
    return url ? (
      <video src={url} controls preload="metadata" className="max-h-64 max-w-full rounded-sf-lg border border-sf-line" aria-label={attachment.name} />
    ) : (
      <span className="block h-32 w-56 animate-pulse rounded-sf-lg bg-sf-surface-hover" />
    )
  return (
    <>
      <button
        type="button"
        onClick={() => setViewing(true)}
        disabled={!url}
        className="sf-focus flex w-[380px] max-w-full items-center gap-3 rounded-sf-lg border border-sf-line bg-sf-surface p-3 text-start enabled:hover:border-sf-line-strong disabled:text-sf-text-muted"
      >
        <span aria-hidden className="grid size-10 flex-none place-items-center rounded-sf-md border border-sf-line bg-sf-surface-sunken text-sf-text-secondary">
          <Icon icon={preview === 'pdf' ? IconFileTypePdf : preview === 'image' ? IconPhoto : IconFileText} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-sf text-[14px]/[20px] font-semibold text-sf-text">{attachment.name}</span>
          <span className="sf-small block text-sf-text-secondary">{subline(attachment)}</span>
        </span>
      </button>
      {viewer}
    </>
  )
}

/** A message's files (spec 6.9 file card): images as thumbnails, videos with their player, other files as cards. */
export function MessageFiles({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap items-start gap-2">
      {attachments.map((a) => (
        <One key={a.id} attachment={a} />
      ))}
    </div>
  )
}
