import {
  IconChevronDown,
  IconChevronRight,
  IconDots,
  IconBookmark,
  IconBookmarkFilled,
  IconCopy,
  IconDownload,
  IconFolder,
  IconFolderPlus,
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
import { noteDownload } from '@/api/audit'
import type { Attachment, ChatMessage, ThreadReply } from '@/api/types'
import { useFileUrl } from '@/components/AttachmentView'
import { IconButton } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Menu, MenuItem, MenuSeparator, Submenu } from '@/components/sf/Menu'
import { useNoHover, usePhone } from '@/components/sf/usePhone'
import { FileViewer } from '@/components/ui/FileViewer'
import { viewedFile } from '@/lib/fileView'
import { downloadUrl, fileSubline, previewOf } from '@/lib/fileTypes'
import { clipLabel } from '@/lib/clips'
import { useFileActions } from '@/pages/chat/files/FileActions'
import { NewFolderDialog } from '@/pages/chat/files/NewFolderDialog'
import { canMakeTask } from '@/pages/chat/taskDraft'
import { snippetLabel, SnippetView, useSnippetText } from '@/pages/chat/snippets/SnippetCard'
import { VoicePlayer } from '@/pages/chat/clips/VoicePlayer'

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
const typeLabel = (a: Attachment) => (a.clip ? clipLabel(a.clip) : a.snippet ? snippetLabel(a) : a.name.includes('.') ? a.name.split('.').pop()!.toUpperCase() : 'File')

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
  copyText,
}: {
  attachment: Attachment
  url: string | null
  link?: string
  message?: ChatMessage | ThreadReply
  /** The message is still on its way: only Download (nothing else has anything to act on yet). */
  pending?: boolean
  /** A snippet's code: Copy snippet puts it on the clipboard (spec 6.9). */
  copyText?: string
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
  // What the pill last did (Link copied, Copied) or why it couldn't, beside it for a moment.
  const [said, setSaid] = useState('')
  useEffect(() => {
    if (!said) return
    const timer = setTimeout(() => setSaid(''), COPIED_MS)
    return () => clearTimeout(timer)
  }, [said])
  const save = () => {
    if (!url) return
    download(url, attachment.name)
    noteDownload(attachment.id)
  }
  const [newFolder, setNewFolder] = useState(false)
  // Add to folder ▸ (spec 6.9): whoever may edit the file's details files it; a refusal is said beside the pill.
  const fileIn = (folderId: string | null) => actions?.folders?.set(attachment, folderId).catch((e: Error) => setSaid(e.message || "Couldn’t file it. Try again."))
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
        {copyText !== undefined && (
          <IconButton
            label="Copy snippet"
            icon={IconCopy}
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(copyText).then(
                () => setSaid('Copied'),
                () => setSaid("Couldn’t copy"),
              )
            }}
          />
        )}
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
            {actions?.save && clean && (
              <MenuItem icon={actions.save.isSaved(attachment) ? IconBookmarkFilled : IconBookmark} onSelect={() => actions.save!.toggle(attachment)}>
                {actions.save.isSaved(attachment) ? 'Remove from Saved' : 'Save for later'}
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
                    () => setSaid("Couldn’t copy the link"),
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
                {actions.folders && (
                  <Submenu icon={IconFolder} label="Add to folder">
                    <MenuItem checked={attachment.folderId === null} onSelect={() => void fileIn(null)}>
                      No folder
                    </MenuItem>
                    {actions.folders.list.map((folder) => (
                      <MenuItem key={folder.id} checked={attachment.folderId === folder.id} onSelect={() => void fileIn(folder.id)}>
                        {folder.name}
                      </MenuItem>
                    ))}
                    <MenuSeparator />
                    <MenuItem icon={IconFolderPlus} onSelect={() => setNewFolder(true)}>
                      New folder…
                    </MenuItem>
                  </Submenu>
                )}
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
      {newFolder && actions?.folders && (
        <NewFolderDialog fileTitle={attachment.title} onCreate={(name) => actions.folders!.create(attachment, name)} onClose={() => setNewFolder(false)} />
      )}
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
  // A snippet shows its code (spec 6.9), read from the file once it's clean.
  const code = useSnippetText(attachment.snippet && clean ? url : null)
  const [shown, setShown] = useState(true)
  const [viewing, setViewing] = useState(false)
  // Images the browser shows (not HEIC), and videos it can play; anything else is a file card that opens it.
  const playable = attachment.mimeType.startsWith('video/') && typeof document !== 'undefined' && document.createElement('video').canPlayType(attachment.mimeType) !== ''
  // A voice message the browser can play gets its player (chat spec 6.9); any other audio stays a file card.
  const voice = attachment.clip?.kind === 'voice' && typeof document !== 'undefined' && document.createElement('audio').canPlayType(attachment.mimeType) !== ''
  const preview = previewOf(attachment.name)
  const kind = voice ? 'voice' : preview === 'image' ? 'image' : playable ? 'video' : 'file'
  const open = () => setViewing(true)
  // An office file opens through the preview the backend converted it to (spec 6.9); Download still saves the file.
  const viewed = viewedFile(attachment, url)
  const viewer = viewing && viewed && <FileViewer files={[viewed]} onClose={() => setViewing(false)} onDownload={() => noteDownload(attachment.id)} />

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
  else if (failed || code === false) body = <p className="sf-small text-sf-error">{attachment.title} couldn’t be opened.</p>
  else if (attachment.snippet)
    body =
      typeof code === 'string' ? (
        <div className="group/file relative w-[720px] max-w-full">
          <SnippetView attachment={attachment} text={code} />
          <FileActionsPill attachment={attachment} url={url} link={link} message={message} pending={pending} copyText={code} />
        </div>
      ) : (
        <span aria-hidden className="block h-24 w-[min(720px,100%)] animate-pulse rounded-sf-lg bg-sf-surface-hover" />
      )
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
  else if (kind === 'voice')
    body = url ? (
      <div className="group/file relative w-fit max-w-full">
        <VoicePlayer src={url} clip={attachment.clip!} />
        <FileActionsPill attachment={attachment} url={url} link={link} message={message} pending={pending} />
      </div>
    ) : (
      <span className="block h-11 w-[min(380px,100%)] animate-pulse rounded-sf-lg bg-sf-surface-hover" />
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
