import { FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { openFile } from '@/api/projects'
import type { Attachment } from '@/api/types'
import { FileViewer } from '@/components/ui/FileViewer'
import { previewOf } from '@/lib/fileTypes'
import { safeFileUrl } from '@/lib/safeFileUrl'

/** A blob: address for a stored file while the component is on screen; freed when it goes. Null `id`: nothing to open. */
export function useFileUrl(id: string | null) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!id) return
    let alive = true
    let made: string | null = null
    openFile(id).then(
      (u) => {
        made = u
        if (alive) setUrl(u)
        else URL.revokeObjectURL(u)
      },
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [id])
  return { url: url ? safeFileUrl(url) : null, failed }
}

import { sizeText } from '@/lib/fileTypes'

export { sizeText }

function One({ attachment }: { attachment: Attachment }) {
  const { url, failed } = useFileUrl(attachment.id)
  const [viewing, setViewing] = useState(false)
  // Images the browser shows (not HEIC), and videos it can play; anything else is a file row that opens to download.
  const playable = attachment.mimeType.startsWith('video/') && typeof document !== 'undefined' && document.createElement('video').canPlayType(attachment.mimeType) !== ''
  const kind = previewOf(attachment.name) === 'image' ? 'image' : playable ? 'video' : 'file'
  const viewer = viewing && url && <FileViewer files={[{ name: attachment.name, url, sizeKb: Math.round(attachment.size / 1024) }]} onClose={() => setViewing(false)} />

  if (failed) return <p className="text-xs text-red-600 dark:text-red-400">{attachment.name} couldn't be opened.</p>
  if (kind === 'image')
    return (
      <>
        <button type="button" onClick={() => setViewing(true)} className="block overflow-hidden rounded-lg border border-line" aria-label={`Open ${attachment.name}`}>
          {url ? <img src={url} alt={attachment.name} className="max-h-48 max-w-full object-contain" /> : <span className="block h-32 w-48 animate-pulse bg-surface-muted" />}
        </button>
        {viewer}
      </>
    )
  if (kind === 'video')
    return url ? (
      <video src={url} controls preload="metadata" className="max-h-64 max-w-full rounded-lg border border-line" aria-label={attachment.name} />
    ) : (
      <span className="block h-32 w-56 animate-pulse rounded-lg bg-surface-muted" />
    )
  return (
    <>
      <button type="button" onClick={() => setViewing(true)} disabled={!url} className="flex max-w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-start text-sm hover:bg-surface-muted disabled:opacity-60">
        <FileText className="size-4 shrink-0 text-fg-muted" />
        <span className="min-w-0 truncate text-fg">{attachment.name}</span>
        <span className="shrink-0 text-xs text-fg-muted">{sizeText(attachment.size)}</span>
      </button>
      {viewer}
    </>
  )
}

/** Files on a comment or chat card: images as thumbnails, videos with their own player, other files as rows. */
export function AttachmentView({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap items-start gap-2">
      {attachments.map((a) => (
        <One key={a.id} attachment={a} />
      ))}
    </div>
  )
}
