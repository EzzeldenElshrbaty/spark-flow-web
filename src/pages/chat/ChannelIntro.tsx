import { IconHash, IconLink, IconLock, IconTemplate, IconUserPlus } from '@tabler/icons-react'
import { useState } from 'react'
import type { Channel, User } from '@/api/types'
import { announce } from '@/components/sf/Announcer'
import { Button } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Menu, MenuItem } from '@/components/sf/Menu'
import { isArchived } from '@/lib/channels'
import { senderName } from '@/lib/flowbot'
import { formatDate } from '@/lib/format'
import { ApiError } from '@/lib/apiError'

/** "A", "A and B", "A, B and C". */
function listNames(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '')
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** "today", "yesterday" or "on 3 Oct 2026", by the viewer's own days. */
function madeOn(iso: string, now: Date): string {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000)
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `on ${formatDate(iso)}`
}

/**
 * Where a channel's history begins (chat spec 6.14 §5.3): who made it and when, a project's channel by its project,
 * a conversation by the people in it.
 */
export function introText({ channel, people, me, project, now }: { channel: Channel; people: User[]; me: string; project: { name: string } | null; now: Date }): string {
  if (channel.kind === 'dm') {
    const others = channel.memberIds.filter((id) => id !== me).map((id) => senderName(id, people))
    return `This is the very beginning of your conversation with ${listNames(others.length ? others : [senderName(me, people)])}.`
  }
  const start = `This is the very beginning of #${channel.name}`
  if (project) return `${start}, ${project.name}’s chat.`
  if (!channel.createdBy || !channel.createdAt) return `${start}.`
  const who = channel.createdBy === me ? 'You' : senderName(channel.createdBy, people)
  return `${who} created this channel ${madeOn(channel.createdAt, now)}. ${start}.`
}

export type ChannelIntroProps = {
  channel: Channel
  people: User[]
  me: string
  /** Set for a project's channel. */
  project: { name: string } | null
  /** What I may do here; nothing in an archived channel or a conversation. */
  can: { addPeople: boolean; template: boolean; editDescription: boolean }
  /** Projects I may link (not linked yet); none, no Link a project. */
  linkable: { key: string; name: string }[]
  now?: Date
  onAddPeople(): void
  onEditDescription(): void
  onPickTemplate(): void
  onLinkProject(project: { key: string; name: string }): Promise<unknown>
}

/**
 * The first row of a channel's history (chat spec 6.14, the kit's `.sf-intro`): its name as an h2 under the screen's
 * h1, where it began, its description, and ways to set it up for whoever may.
 */
export function ChannelIntro({ channel, people, me, project, can, linkable, now = new Date(), onAddPeople, onEditDescription, onPickTemplate, onLinkProject }: ChannelIntroProps) {
  const [error, setError] = useState<string | null>(null)
  const open = !isArchived(channel) && channel.kind === 'channel'
  const may = open ? can : { addPeople: false, template: false, editDescription: false }
  const links = open ? linkable : []
  const dm = channel.kind === 'dm'
  const name = dm ? listNames(channel.memberIds.filter((id) => id !== me).map((id) => senderName(id, people))) || senderName(me, people) : channel.name

  const link = async (picked: { key: string; name: string }) => {
    setError(null)
    try {
      await onLinkProject(picked)
      announce(`${picked.name} linked.`)
    } catch (e) {
      const sentence = e instanceof ApiError ? (e.detail ?? e.title) : 'Couldn’t link the project. Check your connection.'
      setError(sentence)
      announce(sentence)
    }
  }

  return (
    <div className="px-4 pt-8 pb-4 md:px-6">
      <h2 className="mb-2 flex items-center gap-2 font-sf text-[28px]/[36px] font-semibold tracking-[-0.01em] text-sf-text">
        {!dm && (
          <span aria-hidden data-icon={channel.isPrivate ? 'lock' : 'hash'} className="text-sf-text-secondary">
            <Icon icon={channel.isPrivate ? IconLock : IconHash} />
          </span>
        )}
        <span className="min-w-0 break-words">{name}</span>
      </h2>
      <p className="sf-body max-w-[640px] text-sf-text-secondary">
        {introText({ channel, people, me, project, now })}
        {may.editDescription && (
          <>
            {' '}
            <button type="button" onClick={onEditDescription} className="sf-focus cursor-pointer rounded-sf-sm text-sf-accent hover:underline max-md:touch-target">
              {channel.description ? 'Edit description' : 'Add a description'}
            </button>
          </>
        )}
      </p>
      {channel.description && <p className="sf-body mt-1 max-w-[640px] break-words whitespace-pre-line text-sf-text-secondary [overflow-wrap:anywhere]">{channel.description}</p>}
      {(may.addPeople || may.template || links.length > 0) && (
        <div className="flex flex-wrap gap-2 pt-4 max-md:gap-x-3 max-md:gap-y-5 max-md:pt-6">
          {may.addPeople && (
            <Button icon={IconUserPlus} touch onClick={onAddPeople}>
              Add people
            </Button>
          )}
          {may.template && (
            <Button icon={IconTemplate} touch onClick={onPickTemplate}>
              Pick a template
            </Button>
          )}
          {links.length > 0 && (
            <span className="relative">
              <Menu
                label="Link a project"
                trigger={(props) => (
                  <Button {...props} icon={IconLink} touch>
                    Link a project
                  </Button>
                )}
              >
                {links.map((p) => (
                  <MenuItem key={p.key} onSelect={() => void link(p)}>
                    {p.name}
                  </MenuItem>
                ))}
              </Menu>
            </span>
          )}
        </div>
      )}
      {error && <p className="sf-small mt-2 text-sf-error">{error}</p>}
    </div>
  )
}
