import { IconDots, IconDownload, IconEye, IconFileText, IconFileTypePdf, IconLink, IconPhoto } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { Attachment } from '@/api/types'
import { useFileUrl } from '@/components/AttachmentView'
import { IconButton } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Menu, MenuItem } from '@/components/sf/Menu'
import { FileViewer } from '@/components/ui/FileViewer'
import { downloadUrl, fileSubline, previewOf } from '@/lib/fileTypes'

const COPIED_MS = 2000

const subline = (a: Attachment) => fileSubline(a.name, a.size)

/** Saves a file under its own name. */
function download(url: string, name: string) {
  const a = document.createElement('a')
  a.href = downloadUrl(url)
  a.download = name
  a.rel = 'noopener'
  a.click()
}

/**
 * The action pill on a file (spec 6.9): Open, Download and More (Copy link to file). It shows on hover and whenever
 * focus is inside, so keyboard users reach it too. Share, Details and the rest of the file menu come with Phase 2.
 */
function FileActions({ attachment, url, onOpen, link }: { attachment: Attachment; url: string | null; onOpen?: () => void; link?: string }) {
  const [said, setSaid] = useState<'' | 'Link copied' | "Couldn't copy the link">('')
  useEffect(() => {
    if (!said) return
    const timer = setTimeout(() => setSaid(''), COPIED_MS)
    return () => clearTimeout(timer)
  }, [said])
  return (
    <div className="absolute end-2 top-2 flex items-center gap-1">
      <span role="status" className="sf-meta rounded-sf-sm bg-sf-surface-raised px-1 text-sf-text-muted empty:hidden">
        {said}
      </span>
      <div
        role="group"
        aria-label={`${attachment.name} actions`}
        className="flex gap-0.5 rounded-sf-md bg-sf-surface-raised p-0.5 opacity-0 shadow-sf-toolbar group-hover/file:opacity-100 focus-within:opacity-100"
      >
        {onOpen && <IconButton label="Open" icon={IconEye} size="sm" onClick={onOpen} disabled={!url} />}
        <IconButton label="Download" icon={IconDownload} size="sm" disabled={!url} onClick={() => url && download(url, attachment.name)} />
        {link && (
          <Menu label="File actions" trigger={(props) => <IconButton label="More file actions" icon={IconDots} size="sm" {...props} />}>
            <MenuItem
              icon={IconLink}
              onSelect={() => {
                navigator.clipboard.writeText(link).then(
                  () => setSaid('Link copied'),
                  () => setSaid("Couldn't copy the link"),
                )
              }}
            >
              Copy link to file
            </MenuItem>
          </Menu>
        )}
      </div>
    </div>
  )
}

function One({ attachment, link }: { attachment: Attachment; link?: string }) {
  const { url, failed } = useFileUrl(attachment.id)
  const [viewing, setViewing] = useState(false)
  // Images the browser shows (not HEIC), and videos it can play; anything else is a file card that opens it.
  const playable = attachment.mimeType.startsWith('video/') && typeof document !== 'undefined' && document.createElement('video').canPlayType(attachment.mimeType) !== ''
  const preview = previewOf(attachment.name)
  const kind = preview === 'image' ? 'image' : playable ? 'video' : 'file'
  const open = () => setViewing(true)
  const viewer = viewing && url && <FileViewer files={[{ name: attachment.name, url, sizeKb: Math.round(attachment.size / 1024) }]} onClose={() => setViewing(false)} />

  if (failed) return <p className="sf-small text-sf-error">{attachment.name} couldn't be opened.</p>
  if (kind === 'image')
    return (
      <div className="group/file relative">
        <button type="button" onClick={open} className="sf-focus block overflow-hidden rounded-sf-lg border border-sf-line" aria-label={`Open ${attachment.name}`}>
          {url ? <img src={url} alt={attachment.name} className="max-h-60 max-w-full object-contain" /> : <span className="block h-32 w-48 animate-pulse bg-sf-surface-hover" />}
        </button>
        <FileActions attachment={attachment} url={url} onOpen={open} link={link} />
        {viewer}
      </div>
    )
  if (kind === 'video')
    return url ? (
      <div className="group/file relative">
        <video src={url} controls preload="metadata" className="max-h-64 max-w-full rounded-sf-lg border border-sf-line" aria-label={attachment.name} />
        <FileActions attachment={attachment} url={url} link={link} />
      </div>
    ) : (
      <span className="block h-32 w-56 animate-pulse rounded-sf-lg bg-sf-surface-hover" />
    )
  return (
    <div className="group/file relative w-[380px] max-w-full rounded-sf-lg border border-sf-line bg-sf-surface hover:border-sf-line-strong">
      <button
        type="button"
        onClick={open}
        disabled={!url}
        aria-label={`Open ${attachment.name}`}
        className="sf-focus flex w-full items-center gap-3 rounded-sf-lg p-3 text-start disabled:text-sf-text-muted"
      >
        <span aria-hidden className="grid size-10 flex-none place-items-center rounded-sf-md border border-sf-line bg-sf-surface-sunken text-sf-text-secondary">
          <Icon icon={preview === 'pdf' ? IconFileTypePdf : preview === 'image' ? IconPhoto : IconFileText} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-sf text-[14px]/[20px] font-semibold text-sf-text">{attachment.name}</span>
          <span className="sf-small block text-sf-text-secondary">{subline(attachment)}</span>
        </span>
      </button>
      <FileActions attachment={attachment} url={url} onOpen={open} link={link} />
      {viewer}
    </div>
  )
}

/**
 * A message's files (spec 6.9 file card): images as thumbnails, videos with their player, other files as cards, each
 * with its action pill. `link` is the permalink Copy link to file gives (the message the file came in).
 */
export function MessageFiles({ attachments, link }: { attachments: Attachment[]; link?: string }) {
  if (attachments.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap items-start gap-2">
      {attachments.map((a) => (
        <One key={a.id} attachment={a} link={link} />
      ))}
    </div>
  )
}
