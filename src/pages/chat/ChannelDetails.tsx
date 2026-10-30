import { IconChevronDown, IconHash, IconLink, IconLock, IconStar, IconStarFilled } from '@tabler/icons-react'
import clsx from 'clsx'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { Bookmark, Channel, ChannelPatch, Invitation, NotifyLevel, Team, WhoCanPost } from '@/api/types'
import { Button, IconButton } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Modal } from '@/components/sf/Modal'
import { Tabs } from '@/components/sf/Tabs'
import { channelFormErrors, descriptionError, MAX_TOPIC } from '@/lib/channelForm'
import { BookmarksPanel } from '@/pages/chat/BookmarksPanel'
import { Members, type PeopleChange, type Person } from '@/pages/chat/ChannelMembers'
import { levelLabel, NotifyLevelMenu } from '@/pages/chat/NotifyLevelMenu'
import { errorText, usePicked } from '@/pages/chat/usePicked'

export type DetailsTab = 'about' | 'members' | 'tabs' | 'settings'

const COPIED_MS = 2000
// A 44px touch target on phones (spec 6.16) around a 32px icon button.
const TOUCH = 'relative max-md:after:absolute max-md:after:-inset-1.5'


export type DetailsRights = { manage: boolean; leave: boolean; restrictPosting: boolean; invite: boolean; setDefault: boolean; archive: boolean }

/**
 * What Channel details lets me do: manage and Leave as the channel allows; who can post, email invites and the default
 * channel for Admins (a private channel is never a default one). An archived channel is read-only until it's restored,
 * so neither its details nor its people change.
 */
export function detailsRights(
  channel: Pick<Channel, 'archivedAt' | 'isPrivate'>,
  rights: { manage: boolean; leave: boolean; archive: boolean },
  admin: { restrictPosting: boolean; inviteByEmail: boolean; setDefault: boolean },
): DetailsRights {
  const manage = rights.manage && !channel.archivedAt
  return {
    manage,
    leave: rights.leave,
    restrictPosting: admin.restrictPosting && manage,
    invite: admin.inviteByEmail && manage,
    setDefault: admin.setDefault && manage && !channel.isPrivate,
    archive: rights.archive && manage,
  }
}

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
  teams,
  invitations,
  mayRevoke,
  rights,
  tab: firstTab,
  editTopic = false,
  addPeople,
  bookmarks = [],
  onUpdateBookmark,
  onRemoveBookmark,
  headerError,
  fallbackFocus,
  onClose,
  onSave,
  onAdd,
  onRemove,
  onRevoke,
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
  /** The workspace's teams: Add people adds a team's people. */
  teams: Pick<Team, 'id' | 'name' | 'memberIds'>[]
  /** Pending email invites, shown under the members to whoever may change the channel. */
  invitations: Invitation[]
  mayRevoke: (invitation: Invitation) => boolean
  /** manage: edit, add, remove, Settings; leave: Leave channel; Admins: who can post, email invites, the default channel. */
  rights: DetailsRights
  tab: DetailsTab
  /** Opened from "Add a topic": the topic field starts open. */
  editTopic?: boolean
  /** /invite: open on Add people with these people filled in (spec 6.8). */
  addPeople?: string[]
  /** The Tabs tab: the channel's bookmarks; Rename and Remove where I may post. */
  bookmarks?: Bookmark[]
  onUpdateBookmark?: (id: string, patch: { title: string }) => Promise<unknown>
  onRemoveBookmark?: (id: string) => Promise<unknown>
  /** What went wrong with the star, the level or mute, shown under the header (they're changed from here too). */
  headerError?: string | null
  /** Where focus goes on close when what opened the details is gone ("Add a topic", once there's a topic). */
  fallbackFocus?: () => HTMLElement | null | undefined
  onClose: () => void
  onSave: (patch: ChannelPatch) => Promise<unknown>
  onAdd: (change: PeopleChange) => Promise<unknown>
  onRemove: (userId: string) => Promise<unknown>
  onRevoke: (invitationId: string) => Promise<unknown>
  onStar: (starred: boolean) => void
  onNotifyLevel: (level: NotifyLevel) => void
  onMute: (muted: boolean) => void
  onCopyLink: () => Promise<void>
  onLeave: () => void
  onArchive: () => void
}) {
  const [chosen, setTab] = useState<DetailsTab>(firstTab)
  const panelId = useId()
  const tabs = [
    { id: 'about' as const, label: 'About' },
    { id: 'members' as const, label: 'Members', count: channel.memberIds.length },
    { id: 'tabs' as const, label: 'Tabs', count: bookmarks.length || undefined },
    ...(rights.manage ? [{ id: 'settings' as const, label: 'Settings' }] : []),
  ]
  // Settings goes when the right to manage does (archived, or taken off a channel): About stands in.
  const tab = tabs.some((t) => t.id === chosen) ? chosen : 'about'
  const bell = 'Channel notifications'
  const state = channel.muted ? 'Muted' : levelLabel(channel.notifyLevel)

  return (
    <Modal
      open
      onClose={onClose}
      fallbackFocus={fallbackFocus}
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
      {headerError && (
        <p role="alert" className="sf-small m-0 mb-2 text-sf-error">
          {headerError}
        </p>
      )}
      <div className="-mx-6">
        <Tabs label="Channel details" tabs={tabs} tab={tab} onChange={setTab} panelId={panelId} />
      </div>
      <div id={panelId} role="tabpanel" aria-label={tabs.find((t) => t.id === tab)!.label} className="pt-4">
        {/* About stays mounted behind the other tabs: an open draft survives a switch, and "Add a topic" opens once. */}
        <div hidden={tab !== 'about'}>
          <About channel={channel} takenNames={takenNames} project={project} rights={rights} editTopic={editTopic} onSave={onSave} onCopyLink={onCopyLink} onLeave={onLeave} />
        </div>
        {tab === 'members' && (
          <Members
            channel={channel}
            meId={meId}
            people={people}
            teams={teams}
            project={project}
            rights={rights}
            invitations={invitations}
            mayRevoke={mayRevoke}
            addPeople={addPeople}
            onAdd={onAdd}
            onRemove={onRemove}
            onRevoke={onRevoke}
            onSave={onSave}
          />
        )}
        {tab === 'tabs' && <BookmarksPanel bookmarks={bookmarks} onUpdate={onUpdateBookmark} onRemove={onRemoveBookmark} />}
        {tab === 'settings' && rights.manage && <Settings channel={channel} restrictPosting={rights.restrictPosting} onSave={onSave} onArchive={rights.archive ? onArchive : undefined} />}
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
  opened,
  onOpen,
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
  /** Whether its field is open: About opens one card at a time, so there is one Save. */
  opened: boolean
  onOpen: (open: boolean) => void
  /** How typing is cleaned as it goes (a name: lowercase, hyphens). */
  prepare?: (text: string) => string
  /** What's wrong with the value, checked before it's sent. */
  check: (text: string) => string | undefined
  onSave: (text: string) => Promise<unknown>
}) {
  // The field closes when the right to change it goes while it's open.
  const editing = opened && editable
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
    onOpen(true)
  }
  const save = async () => {
    if (pending) return
    const wrong = check(draft)
    if (wrong) return setError(wrong)
    setPending(true)
    try {
      await onSave(draft.trim())
      onOpen(false)
    } catch (failure) {
      setError(errorText(failure))
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
    onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      // Esc cancels the edit only (the details stay open); preventDefault tells the dialog's Esc it's been used.
      if (event.key === 'Escape') {
        event.preventDefault()
        onOpen(false)
      } else if (event.key === 'Enter' && !event.nativeEvent.isComposing && (!multiline || event.ctrlKey || event.metaKey)) {
        // Enter saves; in the description Enter is a new line, and Ctrl or ⌘ + Enter saves.
        event.preventDefault()
        void save()
      }
    },
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
            <Button size="sm" touch onClick={() => onOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button size="sm" touch variant="primary" onClick={() => void save()} disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      ) : (
        <p className={clsx('sf-body m-0 break-words', multiline && 'whitespace-pre-line', value ? 'text-sf-text-secondary' : 'text-sf-text-muted')}>{value ? (shown ?? value) : empty}</p>
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
  // One card edits at a time; opened from "Add a topic", the topic's field starts open.
  const [editing, setEditing] = useState<'name' | 'topic' | 'description' | null>(editTopic ? 'topic' : null)
  const cardState = (card: 'name' | 'topic' | 'description') => ({
    opened: editing === card,
    onOpen: (open: boolean) => setEditing((now) => (open ? card : now === card ? null : now)),
  })

  return (
    <div className="flex flex-col gap-3">
      <EditableCard
        label="Channel name"
        value={channel.name ?? ''}
        shown={`#${channel.name}`}
        empty="—"
        editable={rights.manage}
        {...cardState('name')}
        prepare={(text) => text.toLowerCase().replace(/\s+/g, '-')}
        check={nameError}
        onSave={(name) => onSave({ name })}
      />
      <EditableCard
        label="Topic"
        value={channel.topic}
        empty={rights.manage ? 'Add a topic' : '—'}
        editable={rights.manage}
        {...cardState('topic')}
        check={(topic) => (topic.trim().length > MAX_TOPIC ? `Keep the topic under ${MAX_TOPIC} characters.` : undefined)}
        onSave={(topic) => onSave({ topic })}
      />
      <EditableCard
        label="Description"
        value={channel.description}
        empty={rights.manage ? 'Add a description' : '—'}
        editable={rights.manage}
        multiline
        {...cardState('description')}
        check={descriptionError}
        onSave={(description) => onSave({ description })}
      />
      {project && (
        <DetailCard label="Project" action={<Link to={project.href} className="sf-focus sf-ui-medium inline-flex items-center rounded-sf-sm text-sf-accent hover:underline max-md:min-h-11">Open project</Link>}>
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

const POSTERS: { value: WhoCanPost; label: string }[] = [
  { value: 'everyone', label: 'Everyone in the channel' },
  { value: 'admins', label: 'Only admins' },
]

function Settings({ channel, restrictPosting, onSave, onArchive }: { channel: Channel; restrictPosting: boolean; onSave: (patch: ChannelPatch) => Promise<unknown>; onArchive?: () => void }) {
  const labelId = useId()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [shown, pick, unpick] = usePicked(channel.whoCanPost)
  const choose = async (whoCanPost: WhoCanPost) => {
    // The radios stay enabled (and focused) while it saves; another pick waits.
    if (pending) return
    pick(whoCanPost)
    setPending(true)
    setError(null)
    try {
      await onSave({ whoCanPost })
    } catch (failure) {
      unpick()
      setError(errorText(failure))
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
              checked={shown === option.value}
              disabled={!restrictPosting}
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
      {onArchive && (
        <div>
          <Button size="sm" touch onClick={onArchive}>
            Archive channel
          </Button>
        </div>
      )}
    </div>
  )
}
