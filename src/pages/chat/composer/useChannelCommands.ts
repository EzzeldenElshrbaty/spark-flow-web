import { useNavigate } from 'react-router'
import { useLeaveChannel, useSetMuted, useUpdateChannel } from '@/api/chat'
import type { Channel } from '@/api/types'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import type { SearchNavState } from '@/lib/openSearch'
import { paths } from '@/lib/paths'
import { COMMANDS, shrugBody, type CommandName, type CommandOutcome, type ComposerSlash, type ParsedCommand } from '@/lib/slashCommands'
import type { Body } from '@/lib/messageBody'
import { useChannelRights } from '@/pages/chat/ChannelActions'
import type { DetailsTab } from '@/pages/chat/ChannelDetails'

/** What the shortcuts open on the page. `newTask` and `remind` only where they're offered. */
export type ChannelCommandUi = {
  openDetails: (tab: DetailsTab, options?: { editTopic?: boolean; addPeople?: string[] }) => void
  /**
   * /task: the channel's project, where I manage its tasks (spec 6.8 "in the channel's linked project"); with no
   * `projectName`, a channel or DM with no project, where the sheet asks which.
   */
  newTask?: { projectName?: string; open: (draft: { title: string; assigneeId: string | null }) => void }
  /** Why /task isn't offered here, when the page knows: said instead of "doesn’t work here". */
  whyNoTask?: string
  /** /remind: the reminder dialog with the words filled in. */
  remind?: (what: string) => void
}

/**
 * The channel box's `/` shortcuts (spec 6.8): which this channel offers me, by the same rights as its menus, and what
 * each does. They call what the page's own buttons call; nothing new on the API.
 */
export function useChannelCommands(channel: Channel, ui: ChannelCommandUi): ComposerSlash {
  const rights = useChannelRights(channel)
  const mute = useSetMuted()
  const update = useUpdateChannel()
  const leave = useLeaveChannel()
  const navigate = useNavigate()
  const slug = useCurrentWorkspace().workspace?.slug
  const isChannel = channel.kind === 'channel'
  const where = isChannel ? `#${channel.name}` : 'This conversation'

  const offered: Record<CommandName, boolean> = {
    remind: Boolean(ui.remind),
    task: Boolean(ui.newTask),
    invite: rights.manage,
    topic: rights.manage,
    mute: true,
    leave: rights.leave,
    search: true,
    shrug: true,
  }
  const commands = COMMANDS.filter((c) => offered[c.name]).map((c) =>
    c.name === 'task' && ui.newTask?.projectName
      ? { ...c, description: `Create a Flow task in ${ui.newTask.projectName}` }
      : c.name === 'mute'
        ? { ...c, description: `${channel.muted ? 'Unmute' : 'Mute'} this ${isChannel ? 'channel' : 'conversation'}` }
        : c,
  )

  const run = async ({ name, args, text, userIds }: ParsedCommand, body: Body): Promise<CommandOutcome> => {
    switch (name) {
      case 'mute': {
        const muted = !channel.muted
        await mute.mutateAsync({ id: channel.id, muted })
        return { notice: muted ? `${where} is muted. Type /mute to unmute it.` : `${where} is unmuted.` }
      }
      case 'topic':
        if (!text) ui.openDetails('about', { editTopic: true })
        else await update.mutateAsync({ id: channel.id, patch: { topic: text } })
        return {}
      case 'invite':
        ui.openDetails('members', { addPeople: userIds })
        return {}
      case 'leave':
        await leave.mutateAsync(channel.id)
        if (slug) navigate(paths.start(slug))
        return {}
      case 'task':
        ui.newTask?.open({ title: args, assigneeId: userIds[0] ?? null })
        return {}
      case 'remind':
        ui.remind?.(text)
        return {}
      case 'search':
        // Across the workspace, as Slack's /search does; the channel's 🔍 and ⌘F search just here.
        if (slug) navigate(paths.search(slug, text), { state: { focus: 'search' } satisfies SearchNavState })
        return {}
      case 'shrug':
        return { send: shrugBody(body) }
      default:
        return {}
    }
  }
  return { commands, run, refused: ui.whyNoTask ? { task: ui.whyNoTask } : {} }
}
