import {
  IconChevronDown,
  IconChevronRight,
  IconDots,
  IconDownload,
  IconFileText,
  IconFileTypePdf,
  IconInfoCircle,
  IconLink,
  IconListCheck,
  IconPencil,
  IconPhoto,
  IconShare3,
  IconTrash,
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { Attachment, ChatMessage, ThreadReply } from '@/api/types'
import { useFileUrl } from '@/components/AttachmentView'
import { IconButton } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Menu, MenuItem, MenuSeparator } from '@/components/sf/Menu'
import { usePhone } from '@/components/sf/usePhone'
import { FileViewer } from '@/components/ui/FileViewer'
import { downloadUrl, fileSubline, previewOf } from '@/lib/fileTypes'
import { useFileActions } from '@/pages/chat/files/FileActions'

const COPIED_MS = 2000

const subline = (a: Attachment) => fileSubline(a.name, a.size)

/** Saves a file under its own name. */
export function download(url: string, name: string) {
  const a = document.createElement('a')
  a.href = downloadUrl(url)
  a.download = name
  a.rel = 'noopener'
  a.click()
}

/** "PDF": a file's type, from its extension, as the label above its card says. */
const typeLabel = (a: Attachment) => (a.name.includes('.') ? a.name.split('.').pop()!.toUpperCase() : 'File')

/**
 * The action pill on a file (spec 6.9): Download, Share, Details and More, which holds Create task from file, Copy
 * link to file, Edit file details and Delete file, each as I may. It shows on hover and whenever focus is inside, so
 * keyboard users reach it; on a phone, where there's no hover, More is always there and holds everything.
 */
function FileActionsPill({ attachment, url, link, message }: { attachment: Attachment; url: string | null; link?: string; message?: ChatMessage | ThreadReply }) {
  const actions = useFileActions()
  const phone = usePhone()
  const manage = actions?.mayManage(attachment) ?? false
  const [said, setSaid] = useState<'' | 'Link copied' | "Couldn't copy the link">('')
  useEffect(() => {
    if (!said) return
    const timer = setTimeout(() => setSaid(''), COPIED_MS)
    return () => clearTimeout(timer)
  }, [said])
  const save = () => url && download(url, attachment.name)
  return (
    <div className="absolute end-2 top-2 flex items-center gap-1">
      <span role="status" className="sf-meta rounded-sf-sm bg-sf-surface-raised px-1 text-sf-text-muted empty:hidden">
        {said}
      </span>
      <div
        role="group"
        aria-label={`${attachment.name} actions`}
        className="flex gap-0.5 rounded-sf-md bg-sf-surface-raised p-0.5 opacity-0 shadow-sf-toolbar group-hover/file:opacity-100 focus-within:opacity-100 max-md:opacity-100"
      >
        {!phone && <IconButton label="Download" icon={IconDownload} size="sm" disabled={!url} onClick={save} />}
        {!phone && actions && manage && <IconButton label="Share" icon={IconShare3} size="sm" onClick={() => actions.share(attachment)} />}
        {!phone && actions && <IconButton label="Details" icon={IconInfoCircle} size="sm" onClick={() => actions.details(attachment)} />}
        {(link || actions) && (
          <Menu label="File actions" trigger={(props) => <IconButton label="More file actions" icon={IconDots} size="sm" className="max-md:relative max-md:after:absolute max-md:after:-inset-2" {...props} />}>
            {phone && (
              <MenuItem icon={IconDownload} disabled={!url} onSelect={save}>
                Download
              </MenuItem>
            )}
            {phone && actions && manage && (
              <MenuItem icon={IconShare3} onSelect={() => actions.share(attachment)}>
                Share
              </MenuItem>
            )}
            {phone && actions && (
              <MenuItem icon={IconInfoCircle} onSelect={() => actions.details(attachment)}>
                Details
              </MenuItem>
            )}
            {/* A task starts from a channel message, not a thread reply. */}
            {actions?.createTask && message && 'threadCount' in message && (
              <MenuItem icon={IconListCheck} onSelect={() => actions.createTask!(attachment, message)}>
                Create task from file
              </MenuItem>
            )}
            {link && (
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
            )}
            {actions && manage && (
              <>
                <MenuSeparator />
                <MenuItem icon={IconPencil} onSelect={() => actions.edit(attachment)}>
                  Edit file details
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={IconTrash} danger onSelect={() => actions.remove(attachment)}>
                  Delete file
                </MenuItem>
              </>
            )}
          </Menu>
        )}
      </div>
    </div>
  )
}

const cardIcon = (a: Attachment) => {
  const preview = previewOf(a.name)
  return preview === 'pdf' ? IconFileTypePdf : preview === 'image' ? IconPhoto : IconFileText
}

/** A file not yet checked clean: its card says so, and nothing opens it. */
function Unchecked({ attachment }: { attachment: Attachment }) {
  return (
    <div className="flex w-[380px] max-w-full items-center gap-3 rounded-sf-lg border border-sf-line bg-sf-surface p-3">
      <span aria-hidden className="grid size-10 flex-none place-items-center rounded-sf-md border border-sf-line bg-sf-surface-sunken text-sf-text-secondary">
        <Icon icon={cardIcon(attachment)} />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-sf text-[14px]/[20px] font-semibold text-sf-text">{attachment.title}</span>
        <span className={`sf-small block ${attachment.scanStatus === 'blocked' ? 'text-sf-error' : 'text-sf-text-secondary'}`}>
          {attachment.scanStatus === 'blocked' ? 'This file was blocked.' : 'Checking for viruses…'}
        </span>
      </span>
    </div>
  )
}

function Live({ attachment, link, message }: { attachment: Attachment; link?: string; message?: ChatMessage | ThreadReply }) {
  const clean = attachment.scanStatus === 'clean'
  const { url, failed } = useFileUrl(clean ? attachment.id : null)
  const [shown, setShown] = useState(true)
  const [viewing, setViewing] = useState(false)
  // Images the browser shows (not HEIC), and videos it can play; anything else is a file card that opens it.
  const playable = attachment.mimeType.startsWith('video/') && typeof document !== 'undefined' && document.createElement('video').canPlayType(attachment.mimeType) !== ''
  const preview = previewOf(attachment.name)
  const kind = preview === 'image' ? 'image' : playable ? 'video' : 'file'
  const open = () => setViewing(true)
  // An office file opens through the preview the backend converted it to, when there is one (spec 6.9).
  const viewed = preview === 'none' && attachment.previewUrl ? { name: attachment.name, url: attachment.previewUrl, preview: 'pdf' as const } : url && { name: attachment.name, url }
  const viewer = viewing && viewed && <FileViewer files={[{ ...viewed, sizeKb: Math.round(attachment.size / 1024) }]} onClose={() => setViewing(false)} />

  // The type label above the card folds it away and back (spec 6.9 "PDF ▾").
  const label = (
    <button
      type="button"
      aria-expanded={shown}
      onClick={() => setShown((s) => !s)}
      className="sf-focus inline-flex w-fit items-center gap-0.5 rounded-sf-sm font-sf text-[12px]/[16px] text-sf-text-muted hover:text-sf-text-secondary max-md:min-h-11"
    >
      {typeLabel(attachment)}
      <Icon icon={shown ? IconChevronDown : IconChevronRight} size={14} />
    </button>
  )
  let body
  if (!clean) body = <Unchecked attachment={attachment} />
  else if (failed) body = <p className="sf-small text-sf-error">{attachment.title} couldn't be opened.</p>
  else if (kind === 'image')
    body = (
      <div className="group/file relative w-fit">
        <button type="button" onClick={open} className="sf-focus block overflow-hidden rounded-sf-lg border border-sf-line" aria-label={`Open ${attachment.title}`}>
          {url ? <img src={url} alt={attachment.title} className="max-h-80 max-w-[min(420px,100%)] object-contain" /> : <span className="block h-32 w-48 animate-pulse bg-sf-surface-hover" />}
        </button>
        <FileActionsPill attachment={attachment} url={url} link={link} message={message} />
      </div>
    )
  else if (kind === 'video')
    body = url ? (
      <div className="group/file relative w-fit">
        <video src={url} controls preload="metadata" className="max-h-80 max-w-[min(420px,100%)] rounded-sf-lg border border-sf-line" aria-label={attachment.title} />
        <FileActionsPill attachment={attachment} url={url} link={link} message={message} />
      </div>
    ) : (
      <span className="block h-32 w-56 animate-pulse rounded-sf-lg bg-sf-surface-hover" />
    )
  else
    body = (
      <div className="group/file relative w-[380px] max-w-full rounded-sf-lg border border-sf-line bg-sf-surface hover:border-sf-line-strong">
        <button
          type="button"
          onClick={open}
          disabled={!url}
          aria-label={`Open ${attachment.title}`}
          className="sf-focus flex w-full items-center gap-3 rounded-sf-lg p-3 text-start disabled:text-sf-text-muted"
        >
          <span aria-hidden className="grid size-10 flex-none place-items-center rounded-sf-md border border-sf-line bg-sf-surface-sunken text-sf-text-secondary">
            <Icon icon={cardIcon(attachment)} />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-sf text-[14px]/[20px] font-semibold text-sf-text">{attachment.title}</span>
            <span className="sf-small block text-sf-text-secondary">{subline(attachment)}</span>
          </span>
        </button>
        <FileActionsPill attachment={attachment} url={url} link={link} message={message} />
      </div>
    )
  return (
    <div className="flex max-w-full flex-col gap-1">
      {label}
      {shown && body}
      {viewer}
    </div>
  )
}

/** A file deleted after it was shared (spec 6.9 Delete file): its place says so. */
function Deleted() {
  return (
    <p className="sf-small m-0 flex items-center gap-1 text-sf-text-muted">
      <Icon icon={IconTrash} size={16} />
      This file was deleted.
    </p>
  )
}

/**
 * A message's files (spec 6.9 file card): a type label over each; images and videos inline (up to 420px), other files
 * as 380px cards; each with its action pill. `link` is the permalink Copy link to file gives (the message the file
 * came in); `message` is what Create task from file starts from.
 */
export function MessageFiles({ attachments, link, message }: { attachments: Attachment[]; link?: string; message?: ChatMessage | ThreadReply }) {
  if (attachments.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap items-start gap-2">
      {attachments.map((a) => (a.deletedAt ? <Deleted key={a.id} /> : <Live key={a.id} attachment={a} link={link} message={message} />))}
    </div>
  )
}
