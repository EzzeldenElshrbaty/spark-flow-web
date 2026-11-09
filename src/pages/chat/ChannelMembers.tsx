import { IconEye, IconMail, IconUserPlus } from '@tabler/icons-react'
import { isActive } from '@/lib/people'
import { useEffect, useId, useRef, useState } from 'react'
import type { Channel, ChannelPatch, Invitation, Team, User } from '@/api/types'
import { Avatar } from '@/components/sf/Avatar'
import { Tag } from '@/components/sf/Badge'
import { Button } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Modal } from '@/components/sf/Modal'
import { Toggle } from '@/components/sf/Toggle'
import { TokenInput, type Suggestion, type Token } from '@/components/sf/TokenInput'
import { timeAgo } from '@/lib/format'
import { inviteHelp, isEmail, normalEmail, notAnEmailLine, splitAddresses } from '@/lib/invites'
import { errorText, usePicked } from '@/pages/chat/usePicked'

export type Person = Pick<User, 'id' | 'name' | 'email' | 'title' | 'presence' | 'deactivated'>
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
  addPeople,
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
  /** /invite: Add people starts open, with these people filled in. */
  addPeople?: string[]
  onAdd: (change: PeopleChange) => Promise<unknown>
  onRemove: (userId: string) => Promise<unknown>
  onRevoke: (invitationId: string) => Promise<unknown>
  onSave: (patch: ChannelPatch) => Promise<unknown>
}) {
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(addPeople !== undefined && rights.manage)
  const [removing, setRemoving] = useState<Person | null>(null)
  const find = useRef<HTMLInputElement>(null)
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
          ref={find}
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
      <Invited invitations={invited} people={people} mayRevoke={mayRevoke} onRevoke={onRevoke} onEmpty={() => find.current?.focus()} />
      {adding && (
        <AddPeople
          channel={channel}
          meId={meId}
          people={people}
          teams={teams}
          invitedEmails={invitations.map((i) => i.email)}
          rights={rights}
          initial={addPeople}
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
function Invited({
  invitations,
  people,
  mayRevoke,
  onRevoke,
  onEmpty,
}: {
  invitations: Invitation[]
  people: Person[]
  mayRevoke: (invitation: Invitation) => boolean
  onRevoke: (invitationId: string) => Promise<unknown>
  /** Where focus goes when the last Revoke has gone (Find members). */
  onEmpty: () => void
}) {
  const headingId = useId()
  const list = useRef<HTMLUListElement>(null)
  const [revoking, setRevoking] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  // A revoked row goes: the focus it had moves to the Revoke that takes its place, or the one before, or Find members.
  const [refocus, setRefocus] = useState<{ id: string; index: number } | null>(null)
  useEffect(() => {
    if (!refocus || invitations.some((i) => i.id === refocus.id)) return
    const buttons = [...(list.current?.querySelectorAll('button') ?? [])]
    const next = buttons[Math.min(refocus.index, buttons.length - 1)]
    if (next) next.focus()
    else onEmpty()
    setRefocus(null)
  }, [refocus, invitations, onEmpty])
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Unknown person'
  const revoke = async (invitation: Invitation) => {
    if (revoking.includes(invitation.id)) return
    const index = [...(list.current?.querySelectorAll('button') ?? [])].indexOf(document.activeElement as HTMLButtonElement)
    setRevoking((ids) => [...ids, invitation.id])
    setError(null)
    try {
      await onRevoke(invitation.id)
      if (index >= 0) setRefocus({ id: invitation.id, index })
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setRevoking((ids) => ids.filter((id) => id !== invitation.id))
    }
  }
  if (invitations.length === 0) return null
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
      <ul ref={list} aria-label="Invited" className="m-0 flex list-none flex-col p-0">
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
                // Busy, not disabled: a disabled button would drop keyboard focus to the page.
                <Button size="sm" touch aria-label={`Revoke the invite to ${invitation.email}`} aria-disabled={pending || undefined} onClick={() => void revoke(invitation)}>
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
          <Button touch variant="danger" disabled={pending} onClick={() => void remove()}>
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
  initial = [],
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
  /** People to start with; anyone already in the channel (or me) is left out. */
  initial?: string[]
  onAdd: (change: PeopleChange) => Promise<unknown>
  onSave: (patch: ChannelPatch) => Promise<unknown>
  onClose: () => void
}) {
  const [tokens, setTokens] = useState<Token[]>(() =>
    people.filter((p) => initial.includes(p.id) && p.id !== meId && !channel.memberIds.includes(p.id)).map((p) => ({ id: p.id, label: p.name, kind: 'person' as const })),
  )
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const needle = normalEmail(query)
  const inChannel = (id: string) => channel.memberIds.includes(id)
  // Never me: Join is the way into a channel I'm not in. Never someone deactivated (slice 3).
  const active = new Set(people.filter(isActive).map((p) => p.id))
  const free = (id: string, chosen = tokens) => id !== meId && active.has(id) && !inChannel(id) && !chosen.some((t) => t.id === id)
  const owner = (email: string) => people.find((p) => p.email.toLowerCase() === email)
  const invitable = rights.invite && isEmail(needle) && !owner(needle) && !tokens.some((t) => t.id === needle) && !invitedEmails.includes(needle)
  const suggestions: Suggestion[] = needle
    ? [
        ...people
          // An email matches from its start: a domain every address shares would match everyone.
          .filter((p) => free(p.id) && (p.name.toLowerCase().includes(needle) || p.email.toLowerCase().startsWith(needle)))
          .map((p) => ({ id: p.id, label: p.name, description: p.title || undefined, kind: 'person' as const })),
        ...teams
          .filter((t) => t.name.toLowerCase().includes(needle) && t.memberIds.some((id) => free(id)))
          .map((t) => ({ id: `team:${t.id}`, label: t.name, description: countPeople(t.memberIds.length), kind: 'group' as const })),
        ...(invitable ? [{ id: `email:${needle}`, label: needle, description: 'Invite as a guest', kind: 'email' as const }] : []),
      ].slice(0, 8)
    : []

  const personChip = (p: Person): Token => ({ id: p.id, label: p.name, kind: 'person' })
  /** The chips a suggestion adds: a team adds those of its people who aren't in yet, each as their own chip. */
  const chipsFor = (s: Suggestion): Token[] => {
    if (s.kind === 'group') {
      const team = teams.find((t) => `team:${t.id}` === s.id)
      return people.filter((p) => team?.memberIds.includes(p.id) && free(p.id)).map(personChip)
    }
    if (s.kind === 'email') return [{ id: s.label, label: s.label, kind: 'email' }]
    return [{ id: s.id, label: s.label, kind: 'person' }]
  }
  /**
   * What typed text adds, as Enter would, beside the chips `chosen` so far: chips, or the sentence that says why it
   * can't be added. Nothing and no sentence when it's picked already.
   */
  const resolve = (text: string, chosen: Token[]): { chips: Token[]; why?: string } => {
    const blocked = (p: Person) => (inChannel(p.id) ? `${p.name} is already in #${channel.name}.` : p.id === meId ? 'Join the channel instead.' : undefined)
    const email = normalEmail(text)
    if (isEmail(email)) {
      const person = owner(email)
      if (person) {
        const why = blocked(person)
        return why ? { chips: [], why } : { chips: free(person.id, chosen) ? [personChip(person)] : [] }
      }
      if (invitedEmails.includes(email)) return { chips: [], why: `${email} is already invited to #${channel.name}.` }
      if (chosen.some((t) => t.id === email)) return { chips: [] }
      if (!rights.invite) return { chips: [], why: 'Only admins can invite people by email.' }
      return { chips: [{ id: email, label: email, kind: 'email' }] }
    }
    if (text.includes('@')) return { chips: [], why: notAnEmailLine(text) }
    const lower = text.toLowerCase()
    const named = people.filter((p) => p.name.toLowerCase().includes(lower))
    const open = named.filter((p) => free(p.id, chosen))
    if (open.length === 1) return { chips: [personChip(open[0])] }
    if (open.length > 1) return { chips: [], why: 'Pick who you mean from the list.' }
    if (named.length === 1) {
      const why = blocked(named[0])
      return why ? { chips: [], why } : { chips: [] }
    }
    if (named.length > 1) {
      return { chips: [], why: named.every((p) => inChannel(p.id)) ? `Everyone matching “${text}” is already in #${channel.name}.` : `No one matching “${text}” can be added.` }
    }
    const team = teams.find((t) => t.name.toLowerCase().includes(lower))
    if (team) {
      const joining = people.filter((p) => team.memberIds.includes(p.id) && free(p.id, chosen))
      if (joining.length) return { chips: joining.map(personChip) }
      return { chips: [], why: team.memberIds.every(inChannel) ? `Everyone in ${team.name} is already in #${channel.name}.` : `No one in ${team.name} can be added.` }
    }
    return { chips: [], why: `No one in Spark Systems matches “${text}”.` }
  }

  const pick = (s: Suggestion) => {
    setError(null)
    setTokens((list) => [...list, ...chipsFor(s)])
  }
  /** Typed text no suggestion matched (Enter or a comma): its chips, or why it can't be added. */
  const commit = (text: string) => {
    const { chips, why } = resolve(text, tokens)
    if (why) return setError(why)
    setTokens((list) => [...list, ...chips])
  }
  // A pasted list ("lina@partner.io, sam@client.com", or one address with a ";" after it): each address becomes a chip;
  // what can't be added stays typed, with why.
  const changeQuery = (text: string) => {
    if (!/[,;]/.test(text)) {
      // Typing again answers a refusal: it goes (an emptied field, after a pick or a refusal, keeps it).
      if (text) setError(null)
      return setQuery(text)
    }
    const added: Token[] = []
    const left: string[] = []
    let first: string | undefined
    for (const part of splitAddresses(text)) {
      const { chips, why } = resolve(part, [...tokens, ...added])
      if (why) {
        left.push(part)
        first ??= why
      } else added.push(...chips)
    }
    setTokens((list) => [...list, ...added])
    setQuery(left.join(', '))
    setError(first ?? null)
  }
  // What's typed but not a chip yet goes with Add too, as Enter would add it (and counts); text that can't be added
  // stops the Add and says why.
  const typed = query.trim() ? resolve(query.trim(), tokens) : { chips: [] }
  const sending = [...tokens, ...typed.chips]
  const emails = sending.filter((t) => t.kind === 'email').map((t) => t.label)
  const count = sending.length

  const add = async () => {
    if (typed.why) return setError(typed.why)
    setPending(true)
    setError(null)
    try {
      await onAdd({ userIds: sending.filter((t) => t.kind !== 'email').map((t) => t.id), emails })
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
          <Button touch variant="primary" disabled={(count === 0 && !query.trim()) || pending} onClick={() => void add()}>
            {pending ? 'Adding…' : count === 0 ? 'Add people' : `Add ${countPeople(count)}`}
          </Button>
        </>
      }
    >
      <TokenInput
        label="Names or emails"
        tokens={tokens}
        onRemove={(id) => {
          // A refusal is about what's picked: taking a chip away answers it.
          setError(null)
          setTokens((list) => list.filter((t) => t.id !== id))
        }}
        onAdd={pick}
        onCommit={commit}
        query={query}
        onQueryChange={changeQuery}
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
    // It stays enabled (and focused) while it saves, so a screen reader hears the new state; a second press waits.
    if (pending) return
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
        <Toggle checked={shown} onChange={(on) => void turn(on)} labelledBy={labelId} />
      </label>
      {error && (
        <p role="alert" className="sf-small m-0 text-sf-error">
          {error}
        </p>
      )}
    </div>
  )
}
