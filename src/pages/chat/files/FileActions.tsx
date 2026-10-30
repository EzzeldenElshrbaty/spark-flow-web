import { createContext, useContext, useId, useState, type ReactNode } from 'react'
import { useCreateFolder, useFolders } from '@/api/folders'
import { useRemoveSaved, useSave, useSaved } from '@/api/saved'
import { useChannels } from '@/api/chat'
import { useDeleteFile, useShareFile, useUpdateFile } from '@/api/files'
import type { Attachment, ChatMessage, Folder, User } from '@/api/types'
import { Button } from '@/components/sf/Button'
import { Modal } from '@/components/sf/Modal'
import { ROW_FOCUS } from '@/pages/chat/MessageActions'
import { channelLabel } from '@/lib/channels'
import { fileDescriptionError, fileTitleError, MAX_FILE_DESCRIPTION } from '@/lib/fileDetails'
import { usePermission } from '@/lib/usePermission'
import { errorText } from '@/pages/chat/usePicked'

/** What a file card may offer (spec 6.9): the page wires each to the API and its windows. */
export type FileActions = {
  /** Whoever uploaded it, or an Admin: Share, Edit file details, Delete file. */
  mayManage: (file: Attachment) => boolean
  share: (file: Attachment) => void
  details: (file: Attachment) => void
  edit: (file: Attachment) => void
  remove: (file: Attachment) => void
  /** In a project's channel, for whoever manages its tasks. */
  createTask?: (file: Attachment, message: ChatMessage) => void
  /** The channel (or its project) is archived: its files can't be edited or deleted until it's restored. */
  frozen?: boolean
  /** Save for later (spec 6.9 file menu): whether it's in my Saved, and the toggle. */
  save?: { isSaved: (file: Attachment) => boolean; toggle: (file: Attachment) => void }
  /** Add to folder ▸ (spec 6.9): the workspace's folders, filing a file in one (or none), and New folder…. */
  folders?: { list: Folder[]; set: (file: Attachment, folderId: string | null) => Promise<unknown>; create: (file: Attachment, name: string) => Promise<unknown> }
}

export const FileActionsContext = createContext<FileActions | null>(null)

/** The page's file actions, or null where there are none (a file card outside a channel). */
export const useFileActions = () => useContext(FileActionsContext)

const field =
  'sf-ui w-full rounded-sf-md border border-sf-line-strong bg-sf-surface px-3 py-2 text-sf-text outline-none focus:border-sf-focus focus:shadow-[0_0_0_3px_var(--surface-mention)]'

/**
 * Gives the file cards inside it their actions (spec 6.9 file menu): Share, Edit file details and Delete file open
 * their windows here; Details and Create task go to the page.
 */
export function FileActionsProvider({
  workspaceId,
  meId,
  people,
  onDetails,
  onCreateTask,
  frozen = false,
  children,
}: {
  workspaceId: string
  meId: string
  people: Pick<User, 'id' | 'name'>[]
  onDetails: (file: Attachment) => void
  onCreateTask?: (file: Attachment, message: ChatMessage) => void
  frozen?: boolean
  children: ReactNode
}) {
  const check = usePermission()
  const saved = useSaved(workspaceId)
  const saveFile = useSave()
  const removeSaved = useRemoveSaved()
  const folderList = useFolders(workspaceId)
  const createFolder = useCreateFolder()
  const updateFile = useUpdateFile()
  const savedItem = (file: Attachment) => saved.data?.find((s) => s.target.kind === 'file' && s.target.id === file.id && s.status === 'inProgress')
  const [open, setOpen] = useState<{ kind: 'share' | 'edit' | 'delete'; file: Attachment } | null>(null)
  const close = () => setOpen(null)
  const value: FileActions = {
    mayManage: (file) => check('file.manage', { uploadedBy: file.uploadedBy }),
    share: (file) => setOpen({ kind: 'share', file }),
    details: onDetails,
    edit: (file) => setOpen({ kind: 'edit', file }),
    remove: (file) => setOpen({ kind: 'delete', file }),
    createTask: onCreateTask,
    frozen,
    folders: {
      list: folderList.data ?? [],
      set: (file, folderId) => updateFile.mutateAsync({ id: file.id, patch: { folderId } }),
      create: (file, name) => createFolder.mutateAsync({ workspaceId, name }).then((folder) => updateFile.mutateAsync({ id: file.id, patch: { folderId: folder.id } })),
    },
    save: {
      isSaved: (file) => Boolean(savedItem(file)),
      toggle: (file) => {
        const item = savedItem(file)
        if (item) removeSaved.mutate(item.id)
        else saveFile.mutate({ target: { kind: 'file', id: file.id } })
      },
    },
  }
  return (
    <FileActionsContext.Provider value={value}>
      {children}
      {open?.kind === 'edit' && <EditFile file={open.file} onClose={close} />}
      {open?.kind === 'delete' && <DeleteFile file={open.file} onClose={close} />}
      {open?.kind === 'share' && <ShareFile file={open.file} workspaceId={workspaceId} meId={meId} people={people} onClose={close} />}
    </FileActionsContext.Provider>
  )
}

/** Edit file details (spec 6.9): its name and description. */
function EditFile({ file, onClose }: { file: Attachment; onClose: () => void }) {
  const update = useUpdateFile()
  const nameId = useId()
  const descriptionId = useId()
  const [title, setTitle] = useState(file.title)
  const [description, setDescription] = useState(file.description)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    const wrong = fileTitleError(title) ?? fileDescriptionError(description)
    if (wrong) return setError(wrong)
    setError(null)
    try {
      await update.mutateAsync({ id: file.id, patch: { title: title.trim(), description: description.trim() } })
      onClose()
    } catch (failure) {
      setError(errorText(failure))
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit file details"
      footer={
        <>
          <Button touch onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button touch variant="primary" onClick={() => void save()} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor={nameId} className="font-sf text-[13px]/[18px] font-medium text-sf-text">
            Name
          </label>
          <input id={nameId} value={title} onChange={(event) => setTitle(event.target.value)} className={field} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={descriptionId} className="font-sf text-[13px]/[18px] font-medium text-sf-text">
            Description
          </label>
          <textarea id={descriptionId} rows={3} maxLength={MAX_FILE_DESCRIPTION + 100} value={description} onChange={(event) => setDescription(event.target.value)} className={field} />
        </div>
        {error && (
          <p role="alert" className="sf-small m-0 text-sf-error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

/** Delete file (spec 6.9): asks first; whoever uploaded it, or an Admin. */
function DeleteFile({ file, onClose }: { file: Attachment; onClose: () => void }) {
  const remove = useDeleteFile()
  const [error, setError] = useState<string | null>(null)
  // Where focus goes once the file is gone, found now while what opened this is still there: its message's focus
  // stop, else the panel's title or the list. The card leaves with the file, before this dialog could give focus back.
  const [landing] = useState(() => {
    const from = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return [from?.closest('article')?.querySelector<HTMLElement>(`[${ROW_FOCUS}]`), from?.closest('aside')?.querySelector<HTMLElement>('h2'), from?.closest<HTMLElement>('[role="log"]')].filter(
      (el): el is HTMLElement => Boolean(el),
    )
  })
  const go = async () => {
    setError(null)
    try {
      await remove.mutateAsync(file.id)
      onClose()
      window.setTimeout(() => {
        const active = document.activeElement
        if (active && active !== document.body && active.isConnected) return
        landing.find((el) => el.isConnected)?.focus()
      })
    } catch (failure) {
      setError(errorText(failure))
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Delete ${file.title}?`}
      description="It's removed from every message it's shared in, for everyone."
      footer={
        <>
          <Button touch onClick={onClose} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button touch variant="primary" onClick={() => void go()} disabled={remove.isPending}>
            {remove.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="sf-small m-0 text-sf-error">
          {error}
        </p>
      )}
    </Modal>
  )
}

/** Share (spec 6.9): to a channel or DM I can post in, with an optional message. */
function ShareFile({ file, workspaceId, meId, people, onClose }: { file: Attachment; workspaceId: string; meId: string; people: Pick<User, 'id' | 'name'>[]; onClose: () => void }) {
  const share = useShareFile()
  const check = usePermission()
  const channels = useChannels(workspaceId).data ?? []
  const groupId = useId()
  const messageId = useId()
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const label = (c: (typeof channels)[number]) => (c.kind === 'channel' ? `#${c.name}` : channelLabel(c, people as User[], meId))
  // Where I can post: not archived, a DM of mine or a channel I'm in, and not one only Admins post in (unless I am one).
  const targets = channels
    .filter((c) => !c.archivedAt && c.memberIds.includes(meId) && check('channel.post', { channel: c }))
    .map((c) => ({ id: c.id, label: label(c) }))
  const shown = targets.filter((t) => t.label.toLowerCase().includes(query.trim().toLowerCase()))
  const go = async () => {
    if (!chosen) return
    setError(null)
    try {
      await share.mutateAsync({ id: file.id, channelId: chosen, content: content.trim() || undefined })
      onClose()
    } catch (failure) {
      setError(errorText(failure))
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Share ${file.title}`}
      footer={
        <>
          <Button touch onClick={onClose} disabled={share.isPending}>
            Cancel
          </Button>
          <Button touch variant="primary" onClick={() => void go()} disabled={!chosen || share.isPending}>
            {share.isPending ? 'Sharing…' : 'Share'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <input
          type="search"
          aria-label="Find a channel or person"
          placeholder="Find a channel or person"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={`${field} max-md:h-11`}
        />
        <div id={groupId} role="radiogroup" aria-label="Share to" className="flex max-h-60 flex-col overflow-auto">
          {shown.map((target) => (
            <label key={target.id} className="sf-ui flex min-h-9 cursor-pointer items-center gap-2 rounded-sf-md px-2 text-sf-text hover:bg-sf-surface-hover max-md:min-h-11">
              <input type="radio" name={groupId} className="size-4 accent-[var(--accent-fill)]" checked={chosen === target.id} onChange={() => setChosen(target.id)} />
              {target.label}
            </label>
          ))}
          {shown.length === 0 && <p className="sf-small m-0 px-2 py-2 text-sf-text-muted">Nothing by that name.</p>}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={messageId} className="font-sf text-[13px]/[18px] font-medium text-sf-text">
            Add a message (optional)
          </label>
          <textarea id={messageId} rows={2} value={content} onChange={(event) => setContent(event.target.value)} className={field} />
        </div>
        {error && (
          <p role="alert" className="sf-small m-0 text-sf-error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
