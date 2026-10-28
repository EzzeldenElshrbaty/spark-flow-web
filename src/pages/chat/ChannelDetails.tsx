import { IconChevronDown, IconHash, IconLink, IconLock, IconStar, IconStarFilled, IconUserPlus } from '@tabler/icons-react'
import clsx from 'clsx'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { Channel, ChannelPatch, NotifyLevel, User, WhoCanPost } from '@/api/types'
import { Avatar } from '@/components/sf/Avatar'
import { Button, IconButton } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Modal } from '@/components/sf/Modal'
import { Tabs } from '@/components/sf/Tabs'
import { TokenInput, type Token } from '@/components/sf/TokenInput'
import { channelFormErrors, descriptionError, MAX_TOPIC } from '@/lib/channelForm'
import { levelLabel, NotifyLevelMenu } from '@/pages/chat/NotifyLevelMenu'

export type DetailsTab = 'about' | 'members' | 'settings'
type Person = Pick<User, 'id' | 'name' | 'title' | 'presence'>

const COPIED_MS = 2000
// A 44px touch target on phones (spec 6.16) around a 32px icon button.
const TOUCH = 'relative max-md:after:absolute max-md:after:-inset-1.5'

const message = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')

/**
 * Channel details (spec 6.10): the name with the star and the notification level, then About, Members and, for whoever
 * may manage the channel, Settings. Everything it changes goes through its callbacks; the page wires them to the API.
 */
export function ChannelDetails({
  channel,
  meId,
  people,
  takenNames,
  project,
  rights,
  tab: firstTab,
  editTopic = false,
  onClose,
  onSave,
  onAdd,
  onRemove,
  onStar,
  onNotifyLevel,
  onMute,
  onCopyLink,
  onLeave,
  onArchive,
}: {
  channel: Channel
  meId: string
  /** The workspace's people: the members are looked up here, and Add people picks from the rest. */
  people: Person[]
  /** Names other channels in the workspace use. */
  takenNames: string[]
  /** The project whose channel this is: it follows the project, so its details and people are the project's. */
  project: { name: string; key: string; href: string } | null
  /** manage: edit, add, remove, Settings; leave: Leave channel; restrictPosting: choose who can post (Admins). */
  rights: { manage: boolean; leave: boolean; restrictPosting: boolean }
  tab: DetailsTab
  /** Opened from "Add a topic": the topic field starts open. */
  editTopic?: boolean
  onClose: () => void
  onSave: (patch: ChannelPatch) => Promise<unknown>
  onAdd: (userIds: string[]) => Promise<unknown>
  onRemove: (userId: string) => Promise<unknown>
  onStar: (starred: boolean) => void
  onNotifyLevel: (level: NotifyLevel) => void
  onMute: (muted: boolean) => void
  onCopyLink: () => Promise<void>
  onLeave: () => void
  onArchive: () => void
}) {
  const [tab, setTab] = useState<DetailsTab>(firstTab === 'settings' && !rights.manage ? 'about' : firstTab)
  const panelId = useId()
  const tabs = [
    { id: 'about' as const, label: 'About' },
    { id: 'members' as const, label: 'Members', count: channel.memberIds.length },
    ...(rights.manage ? [{ id: 'settings' as const, label: 'Settings' }] : []),
  ]
  const bell = 'Channel notifications'
  const state = channel.muted ? 'Muted' : levelLabel(channel.notifyLevel)

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span className="inline-flex min-w-0 items-center gap-1">
          <Icon icon={channel.isPrivate ? IconLock : IconHash} size={20} className="flex-none text-sf-text-secondary" />
          <span className="truncate">{channel.name}</span>
        </span>
      }
      actions={
        <>
          <IconButton
            label="Star channel"
            icon={channel.starred ? IconStarFilled : IconStar}
            pressed={channel.starred}
            tone="muted"
            className={TOUCH}
            onClick={() => onStar(!channel.starred)}
          />
          <NotifyLevelMenu
            channel={channel}
            label={bell}
            onNotifyLevel={onNotifyLevel}
            onMute={onMute}
            trigger={(props) => (
              <Button size="sm" touch aria-label={`${bell}: ${state}`} {...props}>
                {state}
                <Icon icon={IconChevronDown} size={16} className="text-sf-text-secondary" />
              </Button>
            )}
          />
        </>
      }
    >
      <div className="-mx-6">
        <Tabs label="Channel details" tabs={tabs} tab={tab} onChange={setTab} panelId={panelId} />
      </div>
      <div id={panelId} role="tabpanel" aria-label={tabs.find((t) => t.id === tab)!.label} className="pt-4">
        {tab === 'about' && <About channel={channel} takenNames={takenNames} project={project} rights={rights} editTopic={editTopic} onSave={onSave} onCopyLink={onCopyLink} onLeave={onLeave} />}
        {tab === 'members' && <Members channel={channel} meId={meId} people={people} project={project} manage={rights.manage} onAdd={onAdd} onRemove={onRemove} />}
        {tab === 'settings' && rights.manage && <Settings channel={channel} restrictPosting={rights.restrictPosting} onSave={onSave} onArchive={onArchive} />}
      </div>
    </Modal>
  )
}

/** A labelled card (About): its value, and for whoever may change it, Edit, which opens the field in place. */
function DetailCard({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  const labelId = useId()
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1 rounded-sf-lg border border-sf-line p-4">
      <div className="flex items-center gap-2">
        <span id={labelId} className="sf-ui-medium text-sf-text">
          {label}
        </span>
        {action && <span className="ms-auto">{action}</span>}
      </div>
      {children}
    </div>
  )
}

function EditableCard({
  label,
  value,
  shown,
  empty,
  editable,
  multiline = false,
  startOpen = false,
  prepare = (text) => text,
  check,
  onSave,
}: {
  label: string
  value: string
  /** The value as the card shows it (#backend). */
  shown?: string
  /** What an empty value reads as ("Add a description"). */
  empty: string
  editable: boolean
  multiline?: boolean
  startOpen?: boolean
  /** How typing is cleaned as it goes (a name: lowercase, hyphens). */
  prepare?: (text: string) => string
  /** What's wrong with the value, checked before it's sent. */
  check: (text: string) => string | undefined
  onSave: (text: string) => Promise<unknown>
}) {
  const [editing, setEditing] = useState(startOpen && editable)
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const labelId = useId()
  const errorId = useId()

  useEffect(() => {
    if (!editing || !field.current) return
    field.current.focus()
    field.current.setSelectionRange(field.current.value.length, field.current.value.length)
  }, [editing])

  const open = () => {
    setDraft(value)
    setError(null)
    setEditing(true)
  }
  const save = async () => {
    const wrong = check(draft)
    if (wrong) return setError(wrong)
    setPending(true)
    try {
      await onSave(draft.trim())
      setEditing(false)
    } catch (failure) {
      setError(message(failure))
    } finally {
      setPending(false)
    }
  }

  const fieldProps = {
    ref: field,
    'aria-labelledby': labelId,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
    value: draft,
    onChange: (event: { target: { value: string } }) => setDraft(prepare(event.target.value)),
    className: 'sf-ui w-full rounded-sf-md border border-sf-line-strong bg-sf-surface px-3 py-2 text-sf-text outline-none focus:border-sf-focus focus:shadow-[0_0_0_3px_var(--surface-mention)]',
  }
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1 rounded-sf-lg border border-sf-line p-4">
      <div className="flex items-center gap-2">
        <span id={labelId} className="sf-ui-medium text-sf-text">
          {label}
        </span>
        {editable && !editing && (
          <span className="ms-auto">
            <Button size="sm" touch variant="ghost" aria-label={`Edit ${label.toLowerCase()}`} onClick={open}>
              Edit
            </Button>
          </span>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          {multiline ? <textarea rows={3} {...fieldProps} /> : <input {...fieldProps} />}
          {error && (
            <p id={errorId} role="alert" className="sf-small m-0 text-sf-error">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" touch onClick={() => setEditing(false)} disabled={pending}>
              Cancel
            </Button>
            <Button size="sm" touch variant="primary" onClick={() => void save()} disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      ) : (
        <p className={clsx('sf-body m-0 break-words', value ? 'text-sf-text-secondary' : 'text-sf-text-muted')}>{value ? (shown ?? value) : empty}</p>
      )}
    </div>
  )
}

function About({
  channel,
  takenNames,
  project,
  rights,
  editTopic,
  onSave,
  onCopyLink,
  onLeave,
}: {
  channel: Channel
  takenNames: string[]
  project: { name: string; key: string; href: string } | null
  rights: { manage: boolean; leave: boolean }
  editTopic: boolean
  onSave: (patch: ChannelPatch) => Promise<unknown>
  onCopyLink: () => Promise<void>
  onLeave: () => void
}) {
  const [copied, setCopied] = useState<'' | 'Link copied' | "Couldn't copy the link">('')
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(''), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])
  const nameError = (name: string) => channelFormErrors({ name, topic: '', isPrivate: false, memberIds: [] }, takenNames).name

  return (
    <div className="flex flex-col gap-3">
      <EditableCard
        label="Channel name"
        value={channel.name ?? ''}
        shown={`#${channel.name}`}
        empty="—"
        editable={rights.manage}
        prepare={(text) => text.toLowerCase().replace(/\s+/g, '-')}
        check={nameError}
        onSave={(name) => onSave({ name })}
      />
      <EditableCard
        label="Topic"
        value={channel.topic}
        empty={rights.manage ? 'Add a topic' : '—'}
        editable={rights.manage}
        startOpen={editTopic}
        check={(topic) => (topic.trim().length > MAX_TOPIC ? `Keep the topic under ${MAX_TOPIC} characters.` : undefined)}
        onSave={(topic) => onSave({ topic })}
      />
      <EditableCard
        label="Description"
        value={channel.description}
        empty={rights.manage ? 'Add a description' : '—'}
        editable={rights.manage}
        multiline
        check={descriptionError}
        onSave={(description) => onSave({ description })}
      />
      {project && (
        <DetailCard label="Project" action={<Link to={project.href} className="sf-focus sf-ui-medium rounded-sf-sm text-sf-accent hover:underline">Open project</Link>}>
          <p className="sf-body m-0 text-sf-text-secondary">
            {project.name} · task keys {project.key}-* open as cards here
          </p>
        </DetailCard>
      )}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button
          size="sm"
          touch
          icon={IconLink}
          onClick={() =>
            onCopyLink().then(
              () => setCopied('Link copied'),
              () => setCopied("Couldn't copy the link"),
            )
          }
        >
          Copy channel link
        </Button>
        <span role="status" className="sf-meta text-sf-text-muted">
          {copied}
        </span>
        {rights.leave && (
          <button type="button" onClick={onLeave} className="sf-focus sf-ui-medium ms-auto rounded-sf-sm text-sf-accent hover:underline max-md:min-h-11">
            Leave channel
          </button>
        )}
      </div>
    </div>
  )
}

function Members({
  channel,
  meId,
  people,
  project,
  manage,
  onAdd,
  onRemove,
}: {
  channel: Channel
  meId: string
  people: Person[]
  project: { name: string } | null
  manage: boolean
  onAdd: (userIds: string[]) => Promise<unknown>
  onRemove: (userId: string) => Promise<unknown>
}) {
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const changeable = manage && !project
  const members = channel.memberIds
    .map((id) => people.find((p) => p.id === id) ?? { id, name: 'Unknown person', title: '', presence: 'offline' as const })
    .sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : a.name.localeCompare(b.name)))
  const shown = members.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))

  const remove = async (person: Person) => {
    setRemoving(person.id)
    setError(null)
    try {
      await onRemove(person.id)
    } catch (failure) {
      setError(message(failure))
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          type="search"
          aria-label="Find members"
          placeholder="Find members"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="sf-ui h-sf-input min-w-0 flex-1 rounded-sf-md border border-sf-line-strong bg-sf-surface px-3 text-sf-text outline-none placeholder:text-sf-text-muted focus:border-sf-focus focus:shadow-[0_0_0_3px_var(--surface-mention)]"
        />
        {changeable && (
          <Button size="sm" touch icon={IconUserPlus} onClick={() => setAdding(true)}>
            Add people
          </Button>
        )}
      </div>
      {project && <p className="sf-small m-0 text-sf-text-secondary">People on {project.name} are in this channel.</p>}
      {error && (
        <p role="alert" className="sf-small m-0 text-sf-error">
          {error}
        </p>
      )}
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
              <Button size="sm" touch aria-label={`Remove ${person.name}`} disabled={removing === person.id} onClick={() => void remove(person)}>
                {removing === person.id ? 'Removing…' : 'Remove'}
              </Button>
            )}
          </li>
        ))}
        {shown.length === 0 && <li className="sf-small py-2 text-sf-text-muted">No one by that name.</li>}
      </ul>
      {adding && <AddPeople channel={channel} people={people} onAdd={onAdd} onClose={() => setAdding(false)} />}
    </div>
  )
}

/** Add people to a channel (spec 6.10), from the workspace's people not in it yet; email invites come in slice 5. */
function AddPeople({ channel, people, onAdd, onClose }: { channel: Channel; people: Person[]; onAdd: (userIds: string[]) => Promise<unknown>; onClose: () => void }) {
  const [tokens, setTokens] = useState<Token[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const needle = query.trim().toLowerCase()
  const suggestions = people
    .filter((p) => !channel.memberIds.includes(p.id) && !tokens.some((t) => t.id === p.id) && p.name.toLowerCase().includes(needle))
    .slice(0, 8)
    .map((p) => ({ id: p.id, label: p.name, description: p.title || undefined, person: true }))
  const count = tokens.length

  const add = async () => {
    setPending(true)
    setError(null)
    try {
      await onAdd(tokens.map((t) => t.id))
      onClose()
    } catch (failure) {
      setError(message(failure))
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
          <Button onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" disabled={count === 0 || pending} onClick={() => void add()}>
            {pending ? 'Adding…' : count === 0 ? 'Add people' : count === 1 ? 'Add 1 person' : `Add ${count} people`}
          </Button>
        </>
      }
    >
      <TokenInput
        label="Names"
        tokens={tokens}
        onRemove={(id) => setTokens((list) => list.filter((t) => t.id !== id))}
        onAdd={(s) => {
          setError(null)
          setTokens((list) => [...list, { id: s.id, label: s.label, person: true }])
        }}
        onCommit={() => setError('Pick someone in Spark Systems. Inviting by email comes later.')}
        query={query}
        onQueryChange={setQuery}
        suggestions={needle ? suggestions : []}
        placeholder="Type a name"
        error={error ?? undefined}
      />
    </Modal>
  )
}

const POSTERS: { value: WhoCanPost; label: string }[] = [
  { value: 'everyone', label: 'Everyone in the channel' },
  { value: 'admins', label: 'Only admins' },
]

function Settings({ channel, restrictPosting, onSave, onArchive }: { channel: Channel; restrictPosting: boolean; onSave: (patch: ChannelPatch) => Promise<unknown>; onArchive: () => void }) {
  const labelId = useId()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const choose = async (whoCanPost: WhoCanPost) => {
    setPending(true)
    setError(null)
    try {
      await onSave({ whoCanPost })
    } catch (failure) {
      setError(message(failure))
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-col gap-1 rounded-sf-lg border border-sf-line p-4">
        <span id={labelId} className="sf-ui-medium text-sf-text">
          Who can post
        </span>
        {POSTERS.map((option) => (
          <label key={option.value} className={clsx('sf-ui flex items-center gap-2 text-sf-text max-md:min-h-11', restrictPosting ? 'cursor-pointer' : 'cursor-not-allowed')}>
            <input
              type="radio"
              name={labelId}
              className="size-4 accent-[var(--accent-fill)]"
              checked={channel.whoCanPost === option.value}
              disabled={!restrictPosting || pending}
              onChange={() => void choose(option.value)}
            />
            {option.label}
          </label>
        ))}
        {!restrictPosting && <p className="sf-small m-0 text-sf-text-secondary">Only admins can change this.</p>}
        {error && (
          <p role="alert" className="sf-small m-0 text-sf-error">
            {error}
          </p>
        )}
      </div>
      {channel.isPrivate && <p className="sf-small m-0 text-sf-text-secondary">Private channel. Only its members can see it, and that can’t be changed.</p>}
      <div>
        <Button size="sm" touch onClick={onArchive}>
          Archive channel
        </Button>
      </div>
    </div>
  )
}
