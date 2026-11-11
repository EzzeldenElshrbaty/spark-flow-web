import { useState } from 'react'
import { useAddBookmark, useBookmarks } from '@/api/bookmarks'
import { useProjectSummaries } from '@/api/projects'
import type { Channel, User } from '@/api/types'
import { appPath } from '@/lib/appLink'
import { isArchived } from '@/lib/channels'
import { paths } from '@/lib/paths'
import { useChannelProject, useChannelRights } from '@/pages/chat/ChannelActions'
import { ChannelIntro } from '@/pages/chat/ChannelIntro'
import { useCanWrite } from '@/pages/chat/useCanPost'

/**
 * The intro as a channel shows it (chat spec 6.14): what I may do here, worked out from the channel's rights, and the
 * projects I can still link (those without a bookmark to their Overview).
 */
export function ChannelIntroRow({ channel, people, me, ws, onAddPeople, onEditDescription, onPickTemplate }: {
  channel: Channel
  people: User[]
  me: string
  ws: string
  onAddPeople: () => void
  onEditDescription: () => void
  onPickTemplate: () => void
}) {
  const rights = useChannelRights(channel)
  const { project } = useChannelProject(channel)
  const canWrite = useCanWrite(channel)
  const projects = useProjectSummaries(channel.workspaceId)
  const bookmarks = useBookmarks(channel.kind === 'channel' ? channel.id : undefined)
  const addBookmark = useAddBookmark()
  const open = !isArchived(channel)
  const manage = rights.manage && open
  // Templates and links are for a channel of its own: a project sets up its channel, a conversation has no page.
  const setUp = canWrite === true && open && channel.kind === 'channel' && !project
  const linked = new Set((bookmarks.data ?? []).map((b) => appPath(b.url)))
  // A pick counts at once: it stays out of the menu until the next list of bookmarks (which has it) arrives, so two
  // quick picks can't make two bookmarks; a refusal puts it back (polish pass).
  const [picked, setPicked] = useState<{ key: string; listAt: number }[]>([])
  const picking = new Set(picked.filter((p) => p.listAt === bookmarks.dataUpdatedAt).map((p) => p.key))
  // Offered once the bookmarks are known, so a project already linked never shows.
  const linkable =
    setUp && bookmarks.isSuccess
      ? (projects.data ?? []).filter((p) => !linked.has(paths.project(ws, p.key)) && !picking.has(p.key)).map((p) => ({ key: p.key, name: p.name }))
      : []
  const link = async (p: { key: string; name: string }) => {
    setPicked((all) => [...all, { key: p.key, listAt: bookmarks.dataUpdatedAt }])
    try {
      return await addBookmark.mutateAsync({ channelId: channel.id, bookmark: { title: p.name, url: `${window.location.origin}${paths.project(ws, p.key)}` } })
    } catch (error) {
      setPicked((all) => all.filter((one) => one.key !== p.key))
      throw error
    }
  }
  return (
    <ChannelIntro
      channel={channel}
      people={people}
      me={me}
      project={project ? { name: project.name } : null}
      can={{ addPeople: manage, editDescription: manage, template: setUp }}
      linkable={linkable}
      onAddPeople={onAddPeople}
      onEditDescription={onEditDescription}
      onPickTemplate={onPickTemplate}
      onLinkProject={link}
    />
  )
}
