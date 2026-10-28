import { IconEye, IconMail, IconUserPlus } from '@tabler/icons-react'
import { useId, useState } from 'react'
import type { Channel, ChannelPatch, Invitation, Team, User } from '@/api/types'
import { Avatar } from '@/components/sf/Avatar'
import { Tag } from '@/components/sf/Badge'
import { Button } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Modal } from '@/components/sf/Modal'
import { Toggle } from '@/components/sf/Toggle'
import { TokenInput, type Suggestion, type Token } from '@/components/sf/TokenInput'
import { timeAgo } from '@/lib/format'
import { inviteHelp, isEmail, normalEmail, notAnEmailLine } from '@/lib/invites'
import { errorText, usePicked } from '@/pages/chat/usePicked'

export type Person = Pick<User, 'id' | 'name' | 'email' | 'title' | 'presence'>
export type PeopleChange = { userIds: string[]; emails: string[] }

/** manage: Add people and Remove; invite: invite emails as guests (Admins); setDefault: the default-channel switch (Admins). */
type MembersRights = { manage: boolean; invite: boolean; setDefault: boolean }

const countPeople = (n: number) => (n === 1 ? '1 person' : `${n} people`)

/**
 * The Members tab of Channel details (spec 6.10): Find members, the people (me first), Add people and Remove for whoever
 * may change the channel, then who is invited by email and hasn't joined yet.
 */
export function Members({
  channel,
  meId,
  people,
  teams,
  project,
  rights,
  invitations,
  mayRevoke,
  onAdd,
  onRemove,
  onRevoke,
  onSave,
}: {
  channel: Channel
  meId: string
  people: Person[]
  teams: Pick<Team, 'id' | 'name' | 'memberIds'>[]
  project: { name: string } | null
  rights: MembersRights
  invitations: Invitation[]
  mayRevoke: (invitation: Invitation) => boolean
  onAdd: (change: PeopleChange) => Promise<unknown>
  onRemove: (userId: string) => Promise<unknown>
  onRevoke: (invitationId: string) => Promise<unknown>
  onSave: (patch: ChannelPatch) => Promise<unknown>
}) {
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Person | null>(null)
  const changeable = rights.manage && !project
  const needle = query.trim().toLowerCase()
  const members = channel.memberIds
    .map((id) => people.find((p) => p.id === id) ?? { id, name: 'Unknown person', email: '', title: '', presence: 'offline' as const })
    .sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : a.name.localeCompare(b.name)))
  const shown = members.filter((p) => p.name.toLowerCase().includes(needle))
  const invited = invitations.filter((i) => i.email.includes(needle))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          type="search"
          aria-label="Find members"
          placeholder="Find members"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="sf-ui h-sf-input min-w-0 flex-1 rounded-sf-md border border-sf-line-strong bg-sf-surface px-3 text-sf-text outline-none placeholder:text-sf-text-muted focus:border-sf-focus focus:shadow-[0_0_0_3px_var(--surface-mention)] max-md:h-11"
        />
        {changeable && (
          <Button size="sm" touch icon={IconUserPlus} onClick={() => setAdding(true)}>
            Add people
          </Button>
        )}
      </div>
      {project && <p className="sf-small m-0 text-sf-text-secondary">People on {project.name} are in this channel.</p>}
      <ul aria-label="Members" className="m-0 flex list-none flex-col p-0">
        {shown.map((person) => (
          <li key={person.id} className="flex min-h-12 items-center gap-3 py-1">
            <Avatar id={person.id} name={person.name} presence={person.presence} decorative />
            <span className="min-w-0 flex-1">
              <span data-name="" className="sf-ui-medium block truncate text-sf-text">
                {person.name}
                {person.id === meId && ' (you)'}
              </span>
              {person.title && <span className="sf-small block truncate text-sf-text-secondary">{person.title}</span>}
            </span>
            {changeable && person.id !== meId && (
              <Button size="sm" touch aria-label={`Remove ${person.name}`} onClick={() => setRemoving(person)}>
                Remove
              </Button>
            )}
          </li>
        ))}
        {shown.length === 0 && invited.length === 0 && <li className="sf-small py-2 text-sf-text-muted">No one by that name.</li>}
      </ul>
      {invited.length > 0 && <Invited invitations={invited} people={people} mayRevoke={mayRevoke} onRevoke={onRevoke} />}
      {adding && (
        <AddPeople
          channel={channel}
          meId={meId}
          people={people}
          teams={teams}
          invitedEmails={invitations.map((i) => i.email)}
          rights={rights}
          onAdd={onAdd}
          onSave={onSave}
          onClose={() => setAdding(false)}
        />
      )}
      {removing && <RemovePerson channel={channel} person={removing} onRemove={onRemove} onClose={() => setRemoving(null)} />}
    </div>
  )
}

/** Email invites that haven't been accepted yet, with Revoke for whoever sent one, or an Admin. */
function Invited({ invitations, people, mayRevoke, onRevoke }: { invitations: Invitation[]; people: Person[]; mayRevoke: (invitation: Invitation) => boolean; onRevoke: (invitationId: string) => Promise<unknown> }) {
  const headingId = useId()
  const [revoking, setRevoking] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Unknown person'
  const revoke = async (invitation: Invitation) => {
    setRevoking((ids) => [...ids, invitation.id])
    setError(null)
    try {
      await onRevoke(invitation.id)
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setRevoking((ids) => ids.filter((id) => id !== invitation.id))
    }
  }
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <h3 id={headingId} className="sf-ui-medium m-0 text-sf-text">
        {`Invited · ${invitations.length}`}
      </h3>
      {error && (
        <p role="alert" className="sf-small m-0 text-sf-error">
          {error}
        </p>
      )}
      <ul aria-label="Invited" className="m-0 flex list-none flex-col p-0">
        {invitations.map((invitation) => {
          const pending = revoking.includes(invitation.id)
          return (
            <li key={invitation.id} className="flex min-h-12 items-center gap-3 py-1">
              <span aria-hidden="true" className="grid size-sf-avatar flex-none place-items-center rounded-sf-md border border-sf-line bg-sf-surface-sunken text-sf-text-secondary">
                <Icon icon={IconMail} size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span data-name="" className="sf-ui-medium truncate text-sf-text">
                    {invitation.email}
                  </span>
                  <Tag tone="accent">Guest</Tag>
                </span>
                <span className="sf-small block truncate text-sf-text-secondary">{`Invited by ${nameOf(invitation.invitedBy)} · ${timeAgo(invitation.createdAt)}`}</span>
              </span>
              {mayRevoke(invitation) && (
                <Button size="sm" touch aria-label={`Revoke the invite to ${invitation.email}`} disabled={pending} onClick={() => void revoke(invitation)}>
                  {pending ? 'Revoking…' : 'Revoke'}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Asks before taking someone off the channel: everyone in it sees that they were removed. */
function RemovePerson({ channel, person, onRemove, onClose }: { channel: Channel; person: Person; onRemove: (userId: string) => Promise<unknown>; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const remove = async () => {
    setPending(true)
    setError(null)
    try {
      await onRemove(person.id)
      onClose()
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setPending(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Remove ${person.name} from #${channel.name}?`}
      description={channel.isPrivate ? `They won’t be able to read #${channel.name} until someone adds them back.` : `They can still open #${channel.name} and join again.`}
      footer={
        <>
          <Button touch onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button touch variant="primary" disabled={pending} onClick={() => void remove()}>
            {pending ? 'Removing…' : 'Remove'}
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

/**
 * Add people to a channel (spec 6.10): people from the workspace by name or email, a team's people, and for an Admin
 * an email from outside, invited as a guest who sees this channel only. One Add sends them all.
 */
function AddPeople({
  channel,
  meId,
  people,
  teams,
  invitedEmails,
  rights,
  onAdd,
  onSave,
  onClose,
}: {
  channel: Channel
  meId: string
  people: Person[]
  teams: Pick<Team, 'id' | 'name' | 'memberIds'>[]
  /** Emails with a pending invite here already. */
  invitedEmails: string[]
  rights: MembersRights
  onAdd: (change: PeopleChange) => Promise<unknown>
  onSave: (patch: ChannelPatch) => Promise<unknown>
  onClose: () => void
}) {
  const [tokens, setTokens] = useState<Token[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const needle = normalEmail(query)
  const picked = (id: string) => tokens.some((t) => t.id === id)
  // Never me: Join is the way into a channel I'm not in.
  const free = (id: string) => id !== meId && !channel.memberIds.includes(id) && !picked(id)
  const owner = (email: string) => people.find((p) => p.email.toLowerCase() === email)
  const invitable = rights.invite && isEmail(needle) && !owner(needle) && !picked(needle) && !invitedEmails.includes(needle)
  const suggestions: Suggestion[] = needle
    ? [
        ...people
          // An email matches from its start: a domain every address shares would match everyone.
          .filter((p) => free(p.id) && (p.name.toLowerCase().includes(needle) || p.email.toLowerCase().startsWith(needle)))
          .map((p) => ({ id: p.id, label: p.name, description: p.title || undefined, kind: 'person' as const })),
        ...teams
          .filter((t) => t.name.toLowerCase().includes(needle) && t.memberIds.some(free))
          .map((t) => ({ id: `team:${t.id}`, label: t.name, description: countPeople(t.memberIds.length), kind: 'group' as const })),
        ...(invitable ? [{ id: `email:${needle}`, label: needle, description: 'Invite as a guest', kind: 'email' as const }] : []),
      ].slice(0, 8)
    : []
  const emails = tokens.filter((t) => t.kind === 'email').map((t) => t.label)
  const count = tokens.length

  const pick = (s: Suggestion) => {
    setError(null)
    if (s.kind === 'group') {
      // A team adds those of its people who aren't in yet, each as their own chip.
      const team = teams.find((t) => `team:${t.id}` === s.id)
      const joining = people.filter((p) => team?.memberIds.includes(p.id) && free(p.id))
      setTokens((list) => [...list, ...joining.map((p) => ({ id: p.id, label: p.name, kind: 'person' as const }))])
    } else if (s.kind === 'email') {
      setTokens((list) => [...list, { id: s.label, label: s.label, kind: 'email' }])
    } else {
      setTokens((list) => [...list, { id: s.id, label: s.label, kind: 'person' }])
    }
  }
  /** Typed text no suggestion matched: why it can't be added. */
  const commit = (text: string) => {
    const email = normalEmail(text)
    const person = owner(email)
    if (person && channel.memberIds.includes(person.id)) return setError(`${person.name} is already in #${channel.name}.`)
    if (person?.id === meId) return setError('Join the channel instead.')
    if (invitedEmails.includes(email)) return setError(`${email} is already invited to #${channel.name}.`)
    if (person || picked(email)) return
    if (isEmail(email)) return setError('Only admins can invite people by email.')
    if (text.includes('@')) return setError(notAnEmailLine(text))
    setError(`No one in Spark Systems matches “${text}”.`)
  }
  const add = async () => {
    setPending(true)
    setError(null)
    try {
      await onAdd({ userIds: tokens.filter((t) => t.kind !== 'email').map((t) => t.id), emails })
      onClose()
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Add people to #${channel.name}`}
      footer={
        <>
          <Button touch onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button touch variant="primary" disabled={count === 0 || pending} onClick={() => void add()}>
            {pending ? 'Adding…' : count === 0 ? 'Add people' : `Add ${countPeople(count)}`}
          </Button>
        </>
      }
    >
      <TokenInput
        label="Names or emails"
        tokens={tokens}
        onRemove={(id) => setTokens((list) => list.filter((t) => t.id !== id))}
        onAdd={pick}
        onCommit={commit}
        query={query}
        onQueryChange={setQuery}
        suggestions={suggestions}
        placeholder="Type a name, team or email"
        help={inviteHelp(emails, channel.name ?? '')}
        error={error ?? undefined}
      />
      {rights.setDefault && <DefaultChannel channel={channel} onSave={onSave} />}
    </Modal>
  )
}

/** The admin-only block (spec 6.10): new people in the workspace join this channel. It saves at once. */
function DefaultChannel({ channel, onSave }: { channel: Channel; onSave: (patch: ChannelPatch) => Promise<unknown> }) {
  const labelId = useId()
  const [shown, pick, unpick] = usePicked(channel.isDefault)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const turn = async (on: boolean) => {
    pick(on)
    setPending(true)
    setError(null)
    try {
      await onSave({ isDefault: on })
    } catch (failure) {
      unpick()
      setError(errorText(failure))
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="mt-4 flex flex-col gap-2 rounded-sf-md border border-sf-line bg-sf-surface-sunken px-4 py-3">
      <p className="sf-meta m-0 flex items-center gap-1 text-sf-text-secondary">
        <Icon icon={IconEye} size={16} />
        Only admins can see this setting
      </p>
      <label className="sf-ui flex cursor-pointer items-center gap-4 text-sf-text max-md:min-h-11">
        <span id={labelId} className="flex-1">{`When new people join Spark Systems, add them to #${channel.name}`}</span>
        <Toggle checked={shown} onChange={(on) => void turn(on)} labelledBy={labelId} disabled={pending} />
      </label>
      {error && (
        <p role="alert" className="sf-small m-0 text-sf-error">
          {error}
        </p>
      )}
    </div>
  )
}
