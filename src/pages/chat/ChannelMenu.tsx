import { Archive, MoreHorizontal, Pencil } from 'lucide-react'
import { useRef, useState } from 'react'
import { useArchiveChannel, useRestoreChannel } from '@/api/chat'
import { useProjectSummaries } from '@/api/projects'
import type { Channel } from '@/api/types'
import { ConfirmDeleteSheet } from '@/components/ConfirmDeleteSheet'
import { Button } from '@/components/ui/Button'
import { MenuPanel } from '@/components/ui/Menu'
import { roundButtonClass, roundButtonFill } from '@/components/ui/styles'
import { isArchived } from '@/lib/channels'
import { useRole } from '@/lib/useRole'
import { ChannelSheet } from '@/pages/chat/ChannelSheet'
import { menuItemClass } from '@/pages/chat/MessageActions'

/** Whether I may change this channel (details, archive): its members and admins; not a project's channel or a DM. */
export function useCanManageChannel(channel: Channel): boolean {
  const { persona } = useRole()
  const projects = useProjectSummaries(channel.workspaceId)
  return (
    channel.kind === 'channel' &&
    projects.data != null &&
    !projects.data.some((p) => p.channelId === channel.id) &&
    (persona.role === 'admin' || channel.memberIds.includes(persona.id))
  )
}

/** The channel header's ⋯: Edit details and Archive channel, for its members and admins. */
export function ChannelMenu({ channel, workspaceSlug }: { channel: Channel; workspaceSlug: string }) {
  const editable = useCanManageChannel(channel)
  const archive = useArchiveChannel()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  if (!editable || isArchived(channel)) return null
  return (
    <div className="relative">
      <button ref={triggerRef} type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="Channel actions" title="Channel actions" className={`${roundButtonClass} ${roundButtonFill}`}>
        <MoreHorizontal className="size-4 text-fg-secondary" />
      </button>
      <MenuPanel open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} label="Channel actions" className="p-1.5 sm:w-56">
        <button
          type="button"
          role="menuitem"
          className={menuItemClass}
          onClick={() => {
            setOpen(false)
            setEditing(true)
          }}
        >
          <Pencil className="size-4 shrink-0" /> Edit details
        </button>
        <button
          type="button"
          role="menuitem"
          className={menuItemClass}
          onClick={() => {
            setOpen(false)
            setArchiving(true)
          }}
        >
          <Archive className="size-4 shrink-0" /> Archive channel
        </button>
      </MenuPanel>
      {editing && <ChannelSheet workspaceId={channel.workspaceId} workspaceSlug={workspaceSlug} channel={channel} onClose={() => setEditing(false)} />}
      <ConfirmDeleteSheet
        open={archiving}
        tone="primary"
        title={`Archive #${channel.name}?`}
        description="No one can post in it until it's restored. Its messages stay."
        actionLabel="Archive channel"
        pendingLabel="Archiving…"
        onConfirm={() => archive.mutateAsync(channel.id)}
        onClose={() => setArchiving(false)}
      />
    </div>
  )
}

/** What an archived channel shows instead of the composer, with Restore for whoever may. */
export function ArchivedChannelLine({ channel }: { channel: Channel }) {
  const editable = useCanManageChannel(channel)
  const restore = useRestoreChannel()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm text-fg-muted">This channel is archived.</p>
      {editable && (
        <Button variant="secondary" onClick={() => restore.mutate(channel.id)} disabled={restore.isPending}>
          {restore.isPending ? 'Restoring…' : 'Restore channel'}
        </Button>
      )}
      {restore.error && <p className="w-full text-sm text-red-600 dark:text-red-400">{(restore.error as Error).message}</p>}
    </div>
  )
}
