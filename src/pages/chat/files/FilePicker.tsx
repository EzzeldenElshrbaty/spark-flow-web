import { IconSearch } from '@tabler/icons-react'
import { useDeferredValue, useId, useState, type ReactNode } from 'react'
import { useChannels } from '@/api/chat'
import { useShareableFiles } from '@/api/files'
import { useProjectSummaries } from '@/api/projects'
import type { Attachment, ShareableFile } from '@/api/types'
import { Button } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Modal } from '@/components/sf/Modal'
import { fileSubline } from '@/lib/fileTypes'

/**
 * Add from Flow files (spec 6.8 Attach menu): the files in this workspace I may share (my own; an Admin's, any they
 * can see), searchable, each with where it is; the ones ticked join the composer's tray, as if just uploaded.
 */
export function FilePicker({ workspaceId, where, onAdd, onClose }: { workspaceId: string; where: (file: ShareableFile) => string; onAdd: (files: Attachment[]) => void; onClose: () => void }) {
  const ids = useId()
  const [q, setQ] = useState('')
  const query = useDeferredValue(q.trim())
  const files = useShareableFiles(workspaceId, query)
  const [picked, setPicked] = useState<Attachment[]>([])
  const toggle = (file: Attachment, on: boolean) => setPicked((list) => (on ? [...list, file] : list.filter((f) => f.id !== file.id)))
  const label = picked.length === 0 ? 'Add files' : `Add ${picked.length} ${picked.length === 1 ? 'file' : 'files'}`
  return (
    <Modal
      open
      onClose={onClose}
      title="Add from Flow files"
      description="Files you uploaded in this workspace."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={picked.length === 0}
            onClick={() => {
              onAdd(picked)
              onClose()
            }}
          >
            {label}
          </Button>
        </>
      }
    >
      <div className="flex h-sf-input items-center gap-2 rounded-sf-md border border-sf-line-strong bg-sf-surface px-3 focus-within:border-sf-focus focus-within:shadow-[0_0_0_3px_var(--surface-mention)] max-md:h-11">
        <Icon icon={IconSearch} size={18} className="text-sf-text-muted" />
        <input id={`${ids}-q`} type="search" aria-label="Find files" placeholder="Find files" value={q} onChange={(e) => setQ(e.target.value)} className="sf-ui min-w-0 flex-1 bg-transparent text-sf-text outline-none" />
      </div>
      <div className="mt-3 max-h-80 overflow-y-auto">
        {files.isError ? (
          <p className="sf-small text-sf-error">Your files couldn’t be loaded. Try again.</p>
        ) : !files.data ? (
          <div aria-hidden className="h-24 animate-pulse rounded-sf-lg bg-sf-surface-hover" />
        ) : files.data.length === 0 ? (
          <p className="sf-small text-sf-text-muted">{query ? `No files of yours match “${query}”.` : 'You haven’t shared any files in this workspace yet.'}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {files.data.map((s) => (
              <li key={s.file.id}>
                <label className="sf-ui flex min-h-11 cursor-pointer items-center gap-3 rounded-sf-md px-2 py-1 text-sf-text hover:bg-sf-surface-hover">
                  <input type="checkbox" className="size-4 flex-none accent-[var(--accent-fill)]" checked={picked.some((f) => f.id === s.file.id)} onChange={(e) => toggle(s.file, e.target.checked)} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.file.title}</span>
                    <span className="sf-meta block truncate text-sf-text-muted">
                      {fileSubline(s.file.name, s.file.size)} · {where(s)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

/** The picker as a box offers it: `open` shows it, and the files picked go to `onAdd` (the box's tray). */
export function useFlowFilePicker(workspaceId: string, onAdd: (files: Attachment[]) => void): { open: () => void; dialog: ReactNode } {
  const [shown, setShown] = useState(false)
  const channels = useChannels(shown ? workspaceId : undefined).data ?? []
  const projects = useProjectSummaries(shown ? workspaceId : undefined).data ?? []
  const where = (s: ShareableFile) => {
    const channel = channels.find((c) => c.id === s.channelId)
    if (channel) return channel.kind === 'channel' ? `#${channel.name}` : 'a conversation'
    return projects.find((p) => p.id === s.projectId)?.name ?? 'Flow'
  }
  return { open: () => setShown(true), dialog: shown && <FilePicker workspaceId={workspaceId} where={where} onAdd={onAdd} onClose={() => setShown(false)} /> }
}
