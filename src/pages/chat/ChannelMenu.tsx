import { MoreHorizontal, Pencil } from 'lucide-react'
import { useRef, useState } from 'react'
import { useProjectSummaries } from '@/api/projects'
import type { Channel } from '@/api/types'
import { MenuPanel } from '@/components/ui/Menu'
import { roundButtonClass, roundButtonFill } from '@/components/ui/styles'
import { useRole } from '@/lib/useRole'
import { ChannelSheet } from '@/pages/chat/ChannelSheet'
import { menuItemClass } from '@/pages/chat/MessageActions'

/** The channel header's ⋯: Edit details, for its members and admins; a project's channel and DMs have none. */
export function ChannelMenu({ channel, workspaceSlug }: { channel: Channel; workspaceSlug: string }) {
  const { persona } = useRole()
  const projects = useProjectSummaries(channel.workspaceId)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const editable =
    channel.kind === 'channel' &&
    projects.data != null &&
    !projects.data.some((p) => p.channelId === channel.id) &&
    (persona.role === 'admin' || channel.memberIds.includes(persona.id))
  if (!editable) return null
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
      </MenuPanel>
      {editing && <ChannelSheet workspaceId={channel.workspaceId} workspaceSlug={workspaceSlug} channel={channel} onClose={() => setEditing(false)} />}
    </div>
  )
}
