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
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import type { Attachment, ChatMessage, ThreadReply } from '@/api/types'
import { useFileUrl } from '@/components/AttachmentView'
import { IconButton } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Menu, MenuItem, MenuSeparator } from '@/components/sf/Menu'
import { useNoHover, usePhone } from '@/components/sf/usePhone'
import { FileViewer } from '@/components/ui/FileViewer'
import { downloadUrl, fileSubline, previewOf } from '@/lib/fileTypes'
import { useFileActions } from '@/pages/chat/files/FileActions'
import { canMakeTask } from '@/pages/chat/taskDraft'

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
function FileActionsPill({
  attachment,
  url,
  link,
  message,
  pending = false,
}: {
  attachment: Attachment
  url: string | null
  link?: string
  message?: ChatMessage | ThreadReply
  /** The message is still on its way: only Download (nothing else has anything to act on yet). */
  pending?: boolean
}) {
  const offered = useFileActions()
  const actions = pending ? null : offered
  // A file not checked clean keeps Details and Delete file only: nothing that opens or spreads it.
  const clean = attachment.scanStatus === 'clean'
  const change = Boolean(actions && !actions.frozen)
  const phone = usePhone()
  const noHover = useNoHover()
  // Where there's no hover (a phone, a tablet) the pill is always there; elsewhere on hover or focus, and while its
  // menu is open.
  const always = phone || noHover
  const manage = actions?.mayManage(attachment) ?? false
  const share = actions && manage && clean
  const task = actions?.createTask && clean && message && 'threadCount' in message && canMakeTask(message)
  const copy = Boolean(link) && !pending
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
        className={clsx(
          'flex gap-0.5 rounded-sf-md bg-sf-surface-raised p-0.5 shadow-sf-toolbar',
          always ? 'opacity-100' : 'opacity-0 group-hover/file:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100',
        )}
      >
        {!phone && clean && <IconButton label="Download" icon={IconDownload} size="sm" disabled={!url} onClick={save} />}
        {!phone && share && <IconButton label="Share" icon={IconShare3} size="sm" onClick={() => actions!.share(attachment)} />}
        {!phone && actions && <IconButton label="Details" icon={IconInfoCircle} size="sm" onClick={() => actions.details(attachment)} />}
        {(copy || actions) && (
          <Menu label="File actions" trigger={(props) => <IconButton label="More file actions" icon={IconDots} size="sm" className="max-md:relative max-md:after:absolute max-md:after:-inset-2" {...props} />}>
            {phone && clean && (
              <MenuItem icon={IconDownload} disabled={!url} onSelect={save}>
                Download
              </MenuItem>
            )}
            {phone && share && (
              <MenuItem icon={IconShare3} onSelect={() => actions!.share(attachment)}>
                Share
              </MenuItem>
            )}
            {phone && actions && (
              <MenuItem icon={IconInfoCircle} onSelect={() => actions.details(attachment)}>
                Details
              </MenuItem>
            )}
            {/* A task starts from a channel message, not a thread reply or its copy in the channel. */}
            {task && (
              <MenuItem icon={IconListCheck} onSelect={() => actions!.createTask!(attachment, message as ChatMessage)}>
                Create task from file
              </MenuItem>
            )}
            {copy && (
              <MenuItem
                icon={IconLink}
                onSelect={() => {
                  navigator.clipboard.writeText(link!).then(
                    () => setSaid('Link copied'),
                    () => setSaid("Couldn't copy the link"),
                  )
                }}
              >
                Copy link to file
              </MenuItem>
            )}
            {actions && manage && change && clean && (
              <>
                <MenuSeparator />
                <MenuItem icon={IconPencil} onSelect={() => actions.edit(attachment)}>
                  Edit file details
                </MenuItem>
              </>
            )}
            {actions && manage && change && (
              <>
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

/** A file not yet checked clean: its card says so, and nothing opens it; Details and Delete file stay. */
function Unchecked({ attachment, link, message, pending }: { attachment: Attachment; link?: string; message?: ChatMessage | ThreadReply; pending?: boolean }) {
  return (
    <div className="group/file relative flex w-[380px] max-w-full items-center gap-3 rounded-sf-lg border border-sf-line bg-sf-surface p-3">
      <span aria-hidden className="grid size-10 flex-none place-items-center rounded-sf-md border border-sf-line bg-sf-surface-sunken text-sf-text-secondary">
        <Icon icon={cardIcon(attachment)} />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-sf text-[14px]/[20px] font-semibold text-sf-text">{attachment.title}</span>
        <span className={`sf-small block ${attachment.scanStatus === 'blocked' ? 'text-sf-error' : 'text-sf-text-secondary'}`}>
          {attachment.scanStatus === 'blocked' ? 'This file was blocked.' : 'Checking for viruses…'}
        </span>
      </span>
      <FileActionsPill attachment={attachment} url={null} link={link} message={message} pending={pending} />
    </div>
  )
}

function Live({ attachment, link, message, pending }: { attachment: Attachment; link?: string; message?: ChatMessage | ThreadReply; pending?: boolean }) {
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
  // Download in the viewer still saves the file itself, under its own name, not the preview.
  const viewed =
    preview === 'none' && attachment.previewUrl
      ? { name: attachment.name, url: attachment.previewUrl, preview: 'pdf' as const, download: url ? { url, name: attachment.name } : null }
      : url && { name: attachment.name, url }
  const viewer = viewing && viewed && <FileViewer files={[{ ...viewed, sizeKb: Math.round(attachment.size / 1024) }]} onClose={() => setViewing(false)} />

  // The type label above the card folds it away and back (spec 6.9 "PDF ▾"); its name says which file.
  const label = (
    <button
      type="button"
      aria-expanded={shown}
      aria-label={`${typeLabel(attachment)} · ${attachment.title}`}
      onClick={() => setShown((s) => !s)}
      className="sf-focus inline-flex w-fit items-center gap-0.5 rounded-sf-sm font-sf text-[12px]/[16px] text-sf-text-muted hover:text-sf-text-secondary max-md:min-h-11 max-md:min-w-11"
    >
      {typeLabel(attachment)}
      <Icon icon={shown ? IconChevronDown : IconChevronRight} size={14} />
    </button>
  )
  let body
  if (!clean) body = <Unchecked attachment={attachment} link={link} message={message} pending={pending} />
  else if (failed) body = <p className="sf-small text-sf-error">{attachment.title} couldn't be opened.</p>
  else if (kind === 'image')
    body = (
      // The 420px cap is on the frame, not the image: a percentage cap on the image doesn't count while the frame
      // shrinks to fit, so a wide image left the frame at its full width (spec 6.9: the frame hugs the image).
      <div className="group/file relative w-fit max-w-[min(420px,100%)]">
        <button type="button" onClick={open} className="sf-focus block max-w-full overflow-hidden rounded-sf-lg border border-sf-line" aria-label={`Open ${attachment.title}`}>
          {url ? <img src={url} alt={attachment.title} className="block h-auto max-h-80 max-w-full object-contain" /> : <span className="block h-32 w-48 animate-pulse bg-sf-surface-hover" />}
        </button>
        <FileActionsPill attachment={attachment} url={url} link={link} message={message} pending={pending} />
      </div>
    )
  else if (kind === 'video')
    body = url ? (
      <div className="group/file relative w-fit max-w-[min(420px,100%)]">
        <video src={url} controls preload="metadata" className="block max-h-80 max-w-full rounded-sf-lg border border-sf-line" aria-label={attachment.title} />
        <FileActionsPill attachment={attachment} url={url} link={link} message={message} pending={pending} />
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
          className="sf-focus flex w-full items-center gap-3 rounded-sf-lg p-3 text-start disabled:text-sf-text-muted"
        >
          {/* Named by what it shows, after "Open", so the name and the visible text agree. */}
          <span className="sr-only">Open</span>{' '}
          <span aria-hidden className="grid size-10 flex-none place-items-center rounded-sf-md border border-sf-line bg-sf-surface-sunken text-sf-text-secondary">
            <Icon icon={cardIcon(attachment)} />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-sf text-[14px]/[20px] font-semibold text-sf-text">{attachment.title}</span>
            <span className="sf-small block text-sf-text-secondary">{subline(attachment)}</span>
          </span>
        </button>
        <FileActionsPill attachment={attachment} url={url} link={link} message={message} pending={pending} />
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
export function MessageFiles({
  attachments,
  link,
  message,
  pending = false,
}: {
  attachments: Attachment[]
  link?: string
  message?: ChatMessage | ThreadReply
  /** The message is still on its way (or failed to send): only Download. */
  pending?: boolean
}) {
  if (attachments.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap items-start gap-2">
      {attachments.map((a) => (a.deletedAt ? <Deleted key={a.id} /> : <Live key={a.id} attachment={a} link={link} message={message} pending={pending} />))}
    </div>
  )
}
