import { useEffect } from 'react'
import { useArchiveChannel, useJoinChannel, useRestoreChannel } from '@/api/chat'
import { useArchivedProjects, useProjectSummaries } from '@/api/projects'
import type { Channel, ProjectSummary } from '@/api/types'
import { Button as SfButton } from '@/components/sf/Button'
import { Modal } from '@/components/sf/Modal'
import { Button } from '@/components/ui/Button'
import { isArchived } from '@/lib/channels'
import { can } from '@/lib/permissions'
import { useRole } from '@/lib/useRole'

/**
 * What I may do to this channel beyond reading it: manage (details) for its members and admins, archive for admins
 * (spec 6.1), and leave for a member. None for a project's channel (it follows its project) or a DM, and all stay
 * false until the project lists have loaded.
 */
export function useChannelRights(channel: Channel): { manage: boolean; leave: boolean; archive: boolean } {
  const { persona } = useRole()
  const { known, project } = useChannelProject(channel)
  const own = channel.kind === 'channel' && known && !project
  return {
    manage: own && can('channel.manage', { userId: persona.id, grants: persona.grants, channel }),
    archive: own && can('channel.archive', { userId: persona.id, grants: persona.grants, channel }),
    leave: own && !isArchived(channel) && channel.memberIds.includes(persona.id),
  }
}

/**
 * The project whose channel this is, if any. An archived project's channel is archived with it, and the active list
 * leaves that project out, so the archived ones are looked at too; `known` waits for the lists it needs.
 */
export function useChannelProject(channel: Channel): { known: boolean; project: ProjectSummary | undefined } {
  const projects = useProjectSummaries(channel.workspaceId)
  const archivedProjects = useArchivedProjects(channel.workspaceId, isArchived(channel))
  const known = projects.data != null && (!isArchived(channel) || archivedProjects.data != null)
  const project = [...(projects.data ?? []), ...(archivedProjects.data ?? [])].find((p) => p.channelId === channel.id)
  return { known, project }
}

/** Whether I may change this channel (details, archive): its members and admins; not a project's channel or a DM. */
export function useCanManageChannel(channel: Channel): boolean {
  return useChannelRights(channel).manage
}

/** Asks before archiving: nobody can post until it's restored; its messages stay. */
export function ArchiveChannelModal({ channel, open, onClose }: { channel: Channel; open: boolean; onClose: () => void }) {
  const archive = useArchiveChannel()
  const { reset } = archive
  useEffect(() => {
    if (open) reset()
  }, [open, reset])
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Archive #${channel.name}?`}
      description="No one can post in it until it's restored. Its messages stay."
      footer={
        <>
          <SfButton onClick={onClose}>Cancel</SfButton>
          <SfButton variant="primary" disabled={archive.isPending} onClick={() => archive.mutate(channel.id, { onSuccess: onClose })}>
            {archive.isPending ? 'Archiving…' : 'Archive channel'}
          </SfButton>
        </>
      }
    >
      {archive.error && <p className="sf-small text-sf-error">{(archive.error as Error).message}</p>}
    </Modal>
  )
}

/** A public channel I'm not in shows Join in place of the composer; once in, it's in my sidebar. */
export function JoinChannelLine({ channel }: { channel: Channel }) {
  const join = useJoinChannel()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm text-fg-muted">You're not in this channel.</p>
      <Button onClick={() => join.mutate(channel.id)} disabled={join.isPending}>
        {join.isPending ? 'Joining…' : 'Join channel'}
      </Button>
      {join.error && <p className="w-full text-sm text-red-600 dark:text-red-400">{(join.error as Error).message}</p>}
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
