// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Channel, User } from '@/api/types'
import { ChannelDetails, detailsRights } from '@/pages/chat/ChannelDetails'

afterEach(cleanup)
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const backend: Channel = {
  id: 'c-backend', workspaceId: 'ws-eng', kind: 'channel', name: 'backend', topic: 'APIs and jobs', memberIds: ['u-1', 'u-2', 'u-3'], isPrivate: false,
  lastMessageAt: null, description: '', whoCanPost: 'everyone', isDefault: false, unreadCount: 0, lastSeq: 9, lastReadSeq: 9, starred: false, muted: false, notifyLevel: 'mentions', notifyLevelOwn: false,
}
const people = [
  { id: 'u-1', name: 'Youssef Abdelrahman', email: 'youssef.abdelrahman@spark-sys.com', title: 'Managing Director', presence: 'active', roleIds: ['admin'] },
  { id: 'u-2', name: 'Nour El-Sayed', email: 'nour.elsayed@spark-sys.com', title: 'Backend lead', presence: 'away', roleIds: ['pm'] },
  { id: 'u-3', name: 'Mariam Fathy', email: 'mariam.fathy@spark-sys.com', title: 'Designer', presence: 'offline', roleIds: ['member'] },
  { id: 'u-4', name: 'Omar Hassan', email: 'omar.hassan@spark-sys.com', title: 'QA', presence: 'active', roleIds: ['member'] },
] as User[]

type Props = ComponentProps<typeof ChannelDetails>
const teams = [
  { id: 't-qa', name: 'QA', memberIds: ['u-4'] },
  { id: 't-backend', name: 'Backend', memberIds: ['u-2', 'u-4'] },
]
const base = (props: Partial<Props>) => ({ channel: backend, meId: 'u-1', people, takenNames: ['general', 'frontend-dev'], project: null, teams, invitations: [], mayRevoke: () => true, rights: { manage: true, leave: true, restrictPosting: true, invite: true, setDefault: true, archive: true }, tab: 'about' as const, ...props })
function show(props: Partial<Props> = {}) {
  const handlers = {
    onClose: vi.fn(), onSave: vi.fn(async () => {}), onAdd: vi.fn(async () => {}), onRemove: vi.fn(async () => {}), onStar: vi.fn(), onNotifyLevel: vi.fn(),
    onMute: vi.fn(), onCopyLink: vi.fn(async () => {}), onLeave: vi.fn(), onArchive: vi.fn(), onRevoke: vi.fn(async () => {}),
  }
  render(
    <MemoryRouter>
      <ChannelDetails
        channel={backend}
        meId="u-1"
        people={people}
        takenNames={['general', 'frontend-dev']}
        project={null}
        teams={teams}
        invitations={[]}
        mayRevoke={() => true}
        rights={{ manage: true, leave: true, restrictPosting: true, invite: true, setDefault: true, archive: true }}
        tab="about"
        {...handlers}
        {...props}
      />
    </MemoryRouter>,
  )
  return handlers
}
const dialog = () => screen.getByRole('dialog', { name: 'backend' })
const card = (name: string) => screen.getByRole('group', { name })

describe('Channel details: the header and tabs (spec 6.10)', () => {
  it('names the channel, with the star, the level button and ×; About, Members (count), Tabs and Settings', () => {
    const { onStar } = show()
    const head = within(dialog())
    fireEvent.click(head.getByRole('button', { name: 'Star channel' }))
    expect(onStar).toHaveBeenCalledWith(true)
    expect(head.getByRole('button', { name: 'Channel notifications: Mentions and keywords' }).textContent).toContain('Mentions and keywords')
    expect(head.getByRole('button', { name: 'Close' })).toBeTruthy()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['About', 'Members 3', 'Tabs', 'Settings'])
    expect(screen.getByRole('tab', { name: 'About' }).getAttribute('aria-selected')).toBe('true')
  })

  it('the level button opens the bell’s menu', () => {
    const { onNotifyLevel } = show()
    fireEvent.click(screen.getByRole('button', { name: 'Channel notifications: Mentions and keywords' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'All new messages' }))
    expect(onNotifyLevel).toHaveBeenCalledWith('all')
  })

  it('its menu also opens Preferences, with the Do Not Disturb note while it’s on (spec 6.11)', () => {
    const onOpen = vi.fn()
    show({ preferences: { dndEnd: 'tomorrow at 9:00 AM', onOpen } })
    fireEvent.click(screen.getByRole('button', { name: 'Channel notifications: Mentions and keywords' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Do Not Disturb until tomorrow at 9:00 AM' }))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('without the right to manage it there is no Settings and nothing to edit', () => {
    show({ rights: { manage: false, leave: true, restrictPosting: false, invite: false, setDefault: false, archive: false } })
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['About', 'Members 3', 'Tabs'])
    expect(screen.queryByRole('button', { name: /^Edit/ })).toBeNull()
  })

  it('opens on the tab it was asked for', () => {
    show({ tab: 'members' })
    expect(screen.getByRole('tab', { name: 'Members 3' }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('Channel details: About (spec 6.10)', () => {
  it('shows the name, topic and description cards, each with Edit; an empty one says what to add', () => {
    show()
    expect(card('Channel name').textContent).toContain('#backend')
    expect(card('Topic').textContent).toContain('APIs and jobs')
    expect(card('Description').textContent).toContain('Add a description')
    expect(screen.getAllByRole('button', { name: /^Edit/ }).map((b) => b.getAttribute('aria-label'))).toEqual(['Edit channel name', 'Edit topic', 'Edit description'])
  })

  it('Edit opens the field in place; Save sends the change and closes it; Cancel leaves it as it was', async () => {
    const { onSave } = show()
    fireEvent.click(screen.getByRole('button', { name: 'Edit topic' }))
    const field = within(card('Topic')).getByRole('textbox', { name: 'Topic' })
    expect(document.activeElement).toBe(field)
    fireEvent.change(field, { target: { value: 'Queues and the API' } })
    await act(async () => fireEvent.click(within(card('Topic')).getByRole('button', { name: 'Save' })))
    expect(onSave).toHaveBeenCalledWith({ topic: 'Queues and the API' })
    expect(within(card('Topic')).queryByRole('textbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Edit description' }))
    fireEvent.change(within(card('Description')).getByRole('textbox', { name: 'Description' }), { target: { value: 'Draft' } })
    fireEvent.click(within(card('Description')).getByRole('button', { name: 'Cancel' }))
    expect(onSave).toHaveBeenCalledOnce()
    expect(card('Description').textContent).toContain('Add a description')
  })

  it('checks the name and description before saving, and says why near the field; a refusal shows there too', async () => {
    const onSave = vi.fn(async () => Promise.reject(new Error('Only its members can change this channel.')))
    show({ onSave })
    fireEvent.click(screen.getByRole('button', { name: 'Edit channel name' }))
    const name = within(card('Channel name')).getByRole('textbox', { name: 'Channel name' })
    fireEvent.change(name, { target: { value: 'General' } })
    expect((name as HTMLInputElement).value).toBe('general')
    fireEvent.click(within(card('Channel name')).getByRole('button', { name: 'Save' }))
    expect(within(card('Channel name')).getByRole('alert').textContent).toBe('That name is taken.')
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.change(name, { target: { value: 'api' } })
    await act(async () => fireEvent.click(within(card('Channel name')).getByRole('button', { name: 'Save' })))
    expect(onSave).toHaveBeenCalledWith({ name: 'api' })
    expect(within(card('Channel name')).getByRole('alert').textContent).toBe('Only its members can change this channel.')
    fireEvent.click(screen.getByRole('button', { name: 'Edit description' }))
    fireEvent.change(within(card('Description')).getByRole('textbox', { name: 'Description' }), { target: { value: 'x'.repeat(251) } })
    fireEvent.click(within(card('Description')).getByRole('button', { name: 'Save' }))
    expect(within(card('Description')).getByRole('alert').textContent).toBe('Keep the description under 250 characters.')
  })

  it('opens with the description being edited (chat spec 6.14, the intro)', () => {
    show({ channel: { ...backend, description: '' }, editDescription: true })
    expect(document.activeElement).toBe(within(card('Description')).getByRole('textbox', { name: 'Description' }))
  })

  it('opened from Add a topic, the topic field is open and has the caret', () => {
    show({ channel: { ...backend, topic: '' }, editTopic: true })
    expect(document.activeElement).toBe(within(card('Topic')).getByRole('textbox', { name: 'Topic' }))
  })

  it('a project’s channel names its project, read-only, with a way there', () => {
    show({ project: { name: 'Nexus Core', key: 'NEX', href: '/w/engineering/p/NEX/overview' }, rights: { manage: false, leave: false, restrictPosting: false, invite: false, setDefault: false, archive: false } })
    expect(card('Project').textContent).toContain('Nexus Core · task keys NEX-* open as cards here')
    expect(within(card('Project')).getByRole('link', { name: 'Open project' }).getAttribute('href')).toBe('/w/engineering/p/NEX/overview')
  })

  it('Copy channel link says so; Leave channel leaves, for a member', async () => {
    const { onCopyLink, onLeave } = show()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy channel link' })))
    expect(onCopyLink).toHaveBeenCalledOnce()
    expect(screen.getByRole('status').textContent).toBe('Link copied')
    fireEvent.click(screen.getByRole('button', { name: 'Leave channel' }))
    expect(onLeave).toHaveBeenCalledOnce()
    cleanup()
    show({ rights: { manage: true, leave: false, restrictPosting: true, invite: true, setDefault: true, archive: true } })
    expect(screen.queryByRole('button', { name: 'Leave channel' })).toBeNull()
  })
})

describe('Channel details: Members (spec 6.10)', () => {
  const rows = () => within(screen.getByRole('list', { name: 'Members' })).getAllByRole('listitem').map((li) => li.querySelector('[data-name]')?.textContent)

  it('lists the members, me first, and Find members narrows them', () => {
    show({ tab: 'members' })
    expect(rows()).toEqual(['Youssef Abdelrahman (you)', 'Mariam Fathy', 'Nour El-Sayed'])
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find members' }), { target: { value: 'nour' } })
    expect(rows()).toEqual(['Nour El-Sayed'])
  })

  it('a manager removes someone else, never themselves; others see no Remove', async () => {
    const { onRemove } = show({ tab: 'members' })
    expect(screen.queryByRole('button', { name: 'Remove Youssef Abdelrahman' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Nour El-Sayed' }))
    // A removal is a danger confirm, not a primary one (UX Phase 3).
    expect(within(screen.getByRole('dialog', { name: /^Remove/ })).getByRole('button', { name: 'Remove' }).className).toContain('bg-sf-danger-fill')
    await act(async () => fireEvent.click(within(screen.getByRole('dialog', { name: /^Remove/ })).getByRole('button', { name: 'Remove' })))
    expect(onRemove).toHaveBeenCalledWith('u-2')
    cleanup()
    show({ tab: 'members', rights: { manage: false, leave: true, restrictPosting: false, invite: false, setDefault: false, archive: false } })
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add people' })).toBeNull()
  })

  it('a project’s channel says its people follow the project, with no Add or Remove', () => {
    show({ tab: 'members', project: { name: 'Nexus Core', key: 'NEX', href: '/w/engineering/p/NEX/overview' }, rights: { manage: false, leave: false, restrictPosting: false, invite: false, setDefault: false, archive: false } })
    expect(screen.getByText('People on Nexus Core are in this channel.')).toBeTruthy()
  })

  it('Add people picks from the workspace people not in it, and adds them', async () => {
    const { onAdd } = show({ tab: 'members' })
    fireEvent.click(screen.getByRole('button', { name: 'Add people' }))
    const add = screen.getByRole('dialog', { name: 'Add people to #backend' })
    const names = within(add).getByRole('combobox', { name: 'Names or emails' })
    expect((within(add).getByRole('button', { name: 'Add people' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.focus(names)
    fireEvent.change(names, { target: { value: 'a' } })
    // Only people not in it (Youssef, Nour and Mariam have an "a" too), then the teams that would add someone.
    expect(within(add).getAllByRole('option').map((o) => o.querySelector('.font-medium')?.textContent)).toEqual(['Omar Hassan', 'QA', 'Backend'])
    fireEvent.click(within(add).getByRole('option', { name: /Omar Hassan/ }))
    await act(async () => fireEvent.click(within(add).getByRole('button', { name: 'Add 1 person' })))
    expect(onAdd).toHaveBeenCalledWith({ userIds: ['u-4'], emails: [] })
    expect(screen.queryByRole('dialog', { name: 'Add people to #backend' })).toBeNull()
  })

  it('Add people says a refusal near the names, and that only Admins invite by email', async () => {
    show({ tab: 'members', rights: { manage: true, leave: true, restrictPosting: false, invite: false, setDefault: false, archive: true }, onAdd: vi.fn(async () => Promise.reject(new Error('Everyone you picked is already in #backend.'))) })
    fireEvent.click(screen.getByRole('button', { name: 'Add people' }))
    const add = screen.getByRole('dialog', { name: 'Add people to #backend' })
    const names = within(add).getByRole('combobox', { name: 'Names or emails' })
    fireEvent.focus(names)
    fireEvent.change(names, { target: { value: 'sam@client.com' } })
    fireEvent.keyDown(names, { key: 'Enter' })
    expect(within(add).getByRole('alert').textContent).toBe('Only admins can invite people by email.')
    fireEvent.change(names, { target: { value: 'om' } })
    fireEvent.keyDown(names, { key: 'Enter' })
    await act(async () => fireEvent.click(within(add).getByRole('button', { name: 'Add 1 person' })))
    expect(within(add).getByRole('alert').textContent).toBe('Everyone you picked is already in #backend.')
  })
})

describe('Channel details: Settings (spec 6.10, §9)', () => {
  it('an Admin chooses who can post; it saves at once', async () => {
    const { onSave } = show({ tab: 'settings' })
    const group = screen.getByRole('radiogroup', { name: 'Who can post' })
    expect((within(group).getByRole('radio', { name: 'Everyone in the channel' }) as HTMLInputElement).checked).toBe(true)
    await act(async () => fireEvent.click(within(group).getByRole('radio', { name: 'Only admins' })))
    expect(onSave).toHaveBeenCalledWith({ whoCanPost: 'admins' })
  })

  it('anyone else sees the choice but can’t change it', () => {
    show({ tab: 'settings', rights: { manage: true, leave: true, restrictPosting: false, invite: false, setDefault: false, archive: true } })
    for (const radio of screen.getAllByRole('radio')) expect((radio as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('Only admins can change this.')).toBeTruthy()
  })

  it('Archive channel asks first (the page’s question); a private channel says it stays private', () => {
    const { onArchive } = show({ tab: 'settings', channel: { ...backend, isPrivate: true } })
    fireEvent.click(screen.getByRole('button', { name: 'Archive channel' }))
    expect(onArchive).toHaveBeenCalledOnce()
    expect(screen.getByText('Private channel. Only its members can see it, and that can’t be changed.')).toBeTruthy()
  })
})

describe('Channel details when rights change while it is open (review)', () => {
  const handlers = () => ({
    onClose: vi.fn(), onSave: vi.fn(async () => {}), onAdd: vi.fn(async () => {}), onRemove: vi.fn(async () => {}), onStar: vi.fn(), onNotifyLevel: vi.fn(),
    onMute: vi.fn(), onCopyLink: vi.fn(async () => {}), onLeave: vi.fn(), onArchive: vi.fn(), onRevoke: vi.fn(async () => {}),
  })

  it('on Settings, losing the right to manage it goes back to About instead of failing', () => {
    const on = handlers()
    const { rerender } = render(<MemoryRouter><ChannelDetails {...base({ tab: 'settings' })} {...on} /></MemoryRouter>)
    expect(screen.getByRole('radiogroup', { name: 'Who can post' })).toBeTruthy()
    rerender(<MemoryRouter><ChannelDetails {...base({ tab: 'settings', rights: { manage: false, leave: true, restrictPosting: false, invite: false, setDefault: false, archive: false } })} {...on} /></MemoryRouter>)
    expect(screen.queryByRole('tab', { name: 'Settings' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'About' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel', { name: 'About' })).toBeTruthy()
  })

  it('an open field closes when the right to change it goes', () => {
    const on = handlers()
    const { rerender } = render(<MemoryRouter><ChannelDetails {...base({ editTopic: true })} {...on} /></MemoryRouter>)
    expect(within(card('Topic')).getByRole('textbox', { name: 'Topic' })).toBeTruthy()
    rerender(<MemoryRouter><ChannelDetails {...base({ editTopic: true, rights: { manage: false, leave: true, restrictPosting: false, invite: false, setDefault: false, archive: false } })} {...on} /></MemoryRouter>)
    expect(within(card('Topic')).queryByRole('textbox')).toBeNull()
    expect(within(card('Topic')).queryByRole('button', { name: 'Save' })).toBeNull()
  })
})

describe('Settings: Archive is an Admin’s (spec 6.1)', () => {
  it('someone who may manage the channel but isn’t an Admin has Settings without Archive', () => {
    show({ tab: 'settings', rights: { manage: true, leave: true, restrictPosting: false, invite: false, setDefault: false, archive: false } })
    expect(screen.queryByRole('button', { name: 'Archive channel' })).toBeNull()
  })
})

describe('detailsRights: what the details let me do (review)', () => {
  it('an archived channel is read-only: no edits, no Settings, no who can post', () => {
    const rights = { manage: true, leave: true, archive: true }
    const admin = { restrictPosting: true, inviteByEmail: true, setDefault: true }
    expect(detailsRights(backend, rights, admin)).toEqual({ manage: true, leave: true, restrictPosting: true, invite: true, setDefault: true, archive: true })
    expect(detailsRights({ ...backend, archivedAt: '2026-10-28T10:00:00.000Z' }, { manage: true, leave: false, archive: true }, admin)).toEqual({ manage: false, leave: false, restrictPosting: false, invite: false, setDefault: false, archive: false })
    expect(detailsRights(backend, { manage: false, leave: true, archive: false }, admin)).toEqual({ manage: false, leave: true, restrictPosting: false, invite: false, setDefault: false, archive: false })
  })

  it('a private channel is never a default one; email invites and the default are an Admin’s (slice 5)', () => {
    const rights = { manage: true, leave: true, archive: true }
    expect(detailsRights({ ...backend, isPrivate: true }, rights, { restrictPosting: true, inviteByEmail: true, setDefault: true })).toMatchObject({ invite: true, setDefault: false })
    expect(detailsRights(backend, rights, { restrictPosting: false, inviteByEmail: false, setDefault: false })).toMatchObject({ invite: false, setDefault: false })
  })
})


describe('Channel details: editing in place (review minors)', () => {
  it('first focus is the open tab, not the level button beside the title', () => {
    show()
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'About' }))
  })

  it('Enter saves a name or topic; the description saves with Ctrl or ⌘ + Enter, and Enter alone is a new line', async () => {
    const { onSave } = show()
    fireEvent.click(screen.getByRole('button', { name: 'Edit topic' }))
    const topic = within(card('Topic')).getByRole('textbox', { name: 'Topic' })
    fireEvent.change(topic, { target: { value: 'Queues' } })
    await act(async () => fireEvent.keyDown(topic, { key: 'Enter' }))
    expect(onSave).toHaveBeenLastCalledWith({ topic: 'Queues' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit description' }))
    const description = within(card('Description')).getByRole('textbox', { name: 'Description' })
    fireEvent.change(description, { target: { value: 'Line one' } })
    await act(async () => fireEvent.keyDown(description, { key: 'Enter' }))
    expect(onSave).toHaveBeenCalledOnce()
    await act(async () => fireEvent.keyDown(description, { key: 'Enter', metaKey: true }))
    expect(onSave).toHaveBeenLastCalledWith({ description: 'Line one' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit description' }))
    await act(async () => fireEvent.keyDown(within(card('Description')).getByRole('textbox'), { key: 'Enter', ctrlKey: true }))
    expect(onSave).toHaveBeenCalledTimes(3)
  })

  it('one card edits at a time, so there is one Save: opening another closes the first', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Edit topic' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit description' }))
    expect(within(card('Topic')).queryByRole('textbox')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(1)
    expect(document.activeElement).toBe(within(card('Description')).getByRole('textbox'))
  })

  it('a draft survives a tab switch, and "Add a topic" opens the field only once', async () => {
    show({ channel: { ...backend, topic: '' }, editTopic: true })
    const topic = within(card('Topic')).getByRole('textbox', { name: 'Topic' })
    fireEvent.change(topic, { target: { value: 'Queues' } })
    await act(async () => fireEvent.keyDown(topic, { key: 'Enter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit description' }))
    fireEvent.change(within(card('Description')).getByRole('textbox'), { target: { value: 'Draft' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Members 3' }))
    fireEvent.click(screen.getByRole('tab', { name: 'About' }))
    expect(within(card('Topic')).queryByRole('textbox')).toBeNull()
    expect((within(card('Description')).getByRole('textbox') as HTMLTextAreaElement).value).toBe('Draft')
  })

  it('a description keeps its line breaks', () => {
    show({ channel: { ...backend, description: 'Line one\nLine two' } })
    const text = within(card('Description')).getByText(/Line one/)
    expect(text.className).toContain('whitespace-pre-line')
  })

  it('an error from the star or the level shows under the details’ header, not behind them', () => {
    show({ headerError: "Couldn't change your notifications. Try again." })
    expect(within(dialog()).getByRole('alert').textContent).toBe("Couldn't change your notifications. Try again.")
  })
})

describe('Channel details: Remove asks first (review minors)', () => {
  it('names the person and the channel, and says what it means; Cancel keeps them', async () => {
    const { onRemove } = show({ tab: 'members' })
    fireEvent.click(screen.getByRole('button', { name: 'Remove Nour El-Sayed' }))
    const ask = screen.getByRole('dialog', { name: 'Remove Nour El-Sayed from #backend?' })
    expect(screen.getByRole('dialog', { description: 'They can still open #backend and join again.' })).toBe(ask)
    fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }))
    expect(onRemove).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: /^Remove/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Nour El-Sayed' }))
    await act(async () => fireEvent.click(within(screen.getByRole('dialog', { name: /^Remove/ })).getByRole('button', { name: 'Remove' })))
    expect(onRemove).toHaveBeenCalledWith('u-2')
    expect(screen.queryByRole('dialog', { name: /^Remove/ })).toBeNull()
  })

  it('a private channel says they lose it; a refusal shows in the question, which stays', async () => {
    show({ tab: 'members', channel: { ...backend, isPrivate: true }, onRemove: vi.fn(async () => Promise.reject(new Error('They’re not in #backend.'))) })
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mariam Fathy' }))
    const ask = screen.getByRole('dialog', { name: 'Remove Mariam Fathy from #backend?' })
    expect(screen.getByRole('dialog', { description: 'They won’t be able to read #backend until someone adds them back.' })).toBe(ask)
    await act(async () => fireEvent.click(within(ask).getByRole('button', { name: 'Remove' })))
    expect(within(ask).getByRole('alert').textContent).toBe('They’re not in #backend.')
  })

  it('while one removal is saving, the question says so and can’t be sent twice', async () => {
    let finish = () => {}
    const onRemove = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    show({ tab: 'members', onRemove })
    fireEvent.click(screen.getByRole('button', { name: 'Remove Nour El-Sayed' }))
    const ask = screen.getByRole('dialog', { name: /^Remove/ })
    await act(async () => fireEvent.click(within(ask).getByRole('button', { name: 'Remove' })))
    const pending = within(ask).getByRole('button', { name: 'Removing…' }) as HTMLButtonElement
    expect(pending.disabled).toBe(true)
    fireEvent.click(pending)
    expect(onRemove).toHaveBeenCalledOnce()
    await act(async () => finish())
  })
})

describe('Channel details: Settings and Add people (review minors)', () => {
  it('Who can post shows the picked choice while it saves; a refusal puts it back', async () => {
    let fail: (error: Error) => void = () => {}
    const onSave = vi.fn(() => new Promise<void>((_, reject) => (fail = reject)))
    show({ tab: 'settings', onSave })
    const admins = screen.getByRole('radio', { name: 'Only admins' }) as HTMLInputElement
    await act(async () => fireEvent.click(admins))
    expect(admins.checked).toBe(true)
    await act(async () => fail(new Error('Only admins can change who can post.')))
    expect(admins.checked).toBe(false)
    expect((screen.getByRole('radio', { name: 'Everyone in the channel' }) as HTMLInputElement).checked).toBe(true)
  })

  it('Who can post keeps the saved choice until the channel catches up', async () => {
    const on = { onSave: vi.fn(async () => {}) }
    const { rerender } = render(<MemoryRouter><ChannelDetails {...base({ tab: 'settings' })} {...handlersFor(on)} /></MemoryRouter>)
    await act(async () => fireEvent.click(screen.getByRole('radio', { name: 'Only admins' })))
    expect((screen.getByRole('radio', { name: 'Only admins' }) as HTMLInputElement).checked).toBe(true)
    rerender(<MemoryRouter><ChannelDetails {...base({ tab: 'settings', channel: { ...backend, whoCanPost: 'admins' } })} {...handlersFor(on)} /></MemoryRouter>)
    expect((screen.getByRole('radio', { name: 'Only admins' }) as HTMLInputElement).checked).toBe(true)
    rerender(<MemoryRouter><ChannelDetails {...base({ tab: 'settings', channel: { ...backend, whoCanPost: 'everyone' } })} {...handlersFor(on)} /></MemoryRouter>)
    expect((screen.getByRole('radio', { name: 'Everyone in the channel' }) as HTMLInputElement).checked).toBe(true)
  })

  it('Add people never suggests me: Join is the way in', () => {
    show({ tab: 'members', channel: { ...backend, memberIds: ['u-2', 'u-3'] } })
    fireEvent.click(screen.getByRole('button', { name: 'Add people' }))
    const names = screen.getByRole('combobox', { name: 'Names or emails' })
    fireEvent.focus(names)
    fireEvent.change(names, { target: { value: 'o' } })
    expect(screen.getAllByRole('option').map((o) => o.querySelector('.font-medium')?.textContent)).toEqual(['Omar Hassan'])
  })
})

function handlersFor(over: Partial<Props>) {
  return {
    onClose: vi.fn(), onSave: vi.fn(async () => {}), onAdd: vi.fn(async () => {}), onRemove: vi.fn(async () => {}), onStar: vi.fn(), onNotifyLevel: vi.fn(),
    onMute: vi.fn(), onCopyLink: vi.fn(async () => {}), onLeave: vi.fn(), onArchive: vi.fn(), onRevoke: vi.fn(async () => {}), ...over,
  }
}

describe('Add people with emails and teams (spec 6.10, slice 5)', () => {
  const openAdd = (props: Partial<Props> = {}) => {
    const handlers = show({ tab: 'members', ...props })
    fireEvent.click(screen.getByRole('button', { name: 'Add people' }))
    const add = within(screen.getByRole('dialog', { name: 'Add people to #backend' }))
    const names = add.getByRole('combobox', { name: 'Names or emails' })
    fireEvent.focus(names)
    const type = (text: string) => fireEvent.change(names, { target: { value: text } })
    const options = () => add.queryAllByRole('option').map((o) => o.textContent)
    return { ...handlers, add, names, type, options }
  }

  it('suggests people by name or email, teams with their size, and for an Admin the typed email, as a guest', async () => {
    const { add, names, type, options, onAdd } = openAdd()
    type('omar.hassan@')
    expect(options()).toEqual(['OHOmar HassanQA'])
    type('back')
    expect(options()).toEqual(['Backend2 people'])
    fireEvent.keyDown(names, { key: 'Enter' })
    expect(add.getByRole('button', { name: 'Remove Omar Hassan' })).toBeTruthy()
    type('Sam@Client.com')
    expect(options()).toEqual(['sam@client.comInvite as a guest'])
    fireEvent.keyDown(names, { key: 'Enter' })
    expect(add.getByRole('button', { name: 'Remove sam@client.com' }).parentElement!.textContent).toContain('Guest')
    expect(add.getByText("sam@client.com isn’t in Spark Systems yet. They’ll get an email invite as a guest who can see #backend only.")).toBeTruthy()
    await act(async () => fireEvent.click(add.getByRole('button', { name: 'Add 2 people' })))
    expect(onAdd).toHaveBeenCalledWith({ userIds: ['u-4'], emails: ['sam@client.com'] })
  })

  it('says why a typed name or email can’t be added', () => {
    const { add, names, type } = openAdd({ invitations: [invite('inv-1', 'lina@partner.io', 'u-1')] })
    const answer = (text: string) => {
      type(text)
      fireEvent.keyDown(names, { key: 'Enter' })
      return add.getByRole('alert').textContent
    }
    expect(answer('zed')).toBe('No one in Spark Systems matches “zed”.')
    expect(answer('sam@client')).toBe("sam@client isn’t an email address.")
    expect(answer('lina@partner.io')).toBe('lina@partner.io is already invited to #backend.')
    expect(answer('nour.elsayed@spark-sys.com')).toBe('Nour El-Sayed is already in #backend.')
  })

  it('the admin-only switch makes it a default channel, at once; nobody else sees it', async () => {
    const { add, onSave } = openAdd()
    expect(add.getByText('Only admins can see this setting')).toBeTruthy()
    const toggle = add.getByRole('switch', { name: 'When new people join Spark Systems, add them to #backend' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await act(async () => fireEvent.click(toggle))
    expect(onSave).toHaveBeenCalledWith({ isDefault: true })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    cleanup()
    openAdd({ rights: { manage: true, leave: true, restrictPosting: false, invite: false, setDefault: false, archive: true } })
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByText('Only admins can see this setting')).toBeNull()
  })
})

function invite(id: string, email: string, invitedBy: string, hoursAgo = 2) {
  return { id, email, invitedBy, workspaceId: 'ws-eng', channelId: 'c-backend', role: 'guest' as const, status: 'pending' as const, createdAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString() }
}

describe('Members: who is invited (spec 6.10, slice 5)', () => {
  const invited = () => within(screen.getByRole('list', { name: 'Invited' })).getAllByRole('listitem')

  it('lists pending invites under the members: the email, Guest, who sent it and when', () => {
    show({ tab: 'members', invitations: [invite('inv-1', 'sam@client.com', 'u-1'), invite('inv-2', 'lina@partner.io', 'u-2', 30)] })
    expect(screen.getByText('Invited · 2')).toBeTruthy()
    expect(invited().map((li) => li.querySelector('[data-name]')?.textContent)).toEqual(['sam@client.com', 'lina@partner.io'])
    expect(invited()[0].textContent).toContain('Guest')
    expect(invited()[0].textContent).toContain('Invited by Youssef Abdelrahman · 2h ago')
    expect(invited()[1].textContent).toContain('Invited by Nour El-Sayed · 1d ago')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find members' }), { target: { value: 'lina' } })
    expect(invited()).toHaveLength(1)
    cleanup()
    show({ tab: 'members' })
    expect(screen.queryByRole('list', { name: 'Invited' })).toBeNull()
  })

  it('Revoke is there for whoever may revoke it, and says so while it goes', async () => {
    let done = () => {}
    const onRevoke = vi.fn(() => new Promise<void>((resolve) => (done = resolve)))
    show({ tab: 'members', invitations: [invite('inv-1', 'sam@client.com', 'u-1'), invite('inv-2', 'lina@partner.io', 'u-2')], mayRevoke: (i) => i.invitedBy === 'u-1', onRevoke })
    expect(screen.queryByRole('button', { name: 'Revoke the invite to lina@partner.io' })).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Revoke the invite to sam@client.com' })))
    expect(onRevoke).toHaveBeenCalledWith('inv-1')
    // Busy, not disabled: a disabled button would drop keyboard focus to the page (review).
    expect(screen.getByRole('button', { name: 'Revoke the invite to sam@client.com' }).getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Revoke the invite to sam@client.com' }))
    expect(onRevoke).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Revoke the invite to sam@client.com' }).textContent).toBe('Revoking…')
    await act(async () => done())
  })

  it('a refused revoke says why near the list', async () => {
    show({ tab: 'members', invitations: [invite('inv-1', 'sam@client.com', 'u-1')], onRevoke: vi.fn(async () => Promise.reject(new Error('This invitation was revoked already.'))) })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Revoke the invite to sam@client.com' })))
    expect(screen.getByRole('alert').textContent).toBe('This invitation was revoked already.')
  })
})

describe('Add people after the slice 5 review', () => {
  const openAdd = (props: Partial<Props> = {}) => {
    const handlers = show({ tab: 'members', ...props })
    fireEvent.click(screen.getByRole('button', { name: 'Add people' }))
    const add = within(screen.getByRole('dialog', { name: /^Add people to/ }))
    const names = add.getByRole('combobox', { name: 'Names or emails' })
    fireEvent.focus(names)
    const type = (text: string) => fireEvent.change(names, { target: { value: text } })
    const answer = (text: string) => {
      type(text)
      fireEvent.keyDown(names, { key: 'Enter' })
      return add.queryByRole('alert')?.textContent
    }
    const chips = () => add.queryAllByRole('button', { name: /^Remove / }).map((b) => b.getAttribute('aria-label'))
    return { ...handlers, add, names, type, answer, chips }
  }
  const everyone = { ...backend, memberIds: ['u-1', 'u-2', 'u-3', 'u-4'] }

  it('a name already in the channel, mine, or a team that is all in says so, not that nobody matches', () => {
    const { answer } = openAdd({ channel: everyone })
    expect(answer('Nour')).toBe('Nour El-Sayed is already in #backend.')
    expect(answer('youssef')).toBe('Youssef Abdelrahman is already in #backend.')
    expect(answer('Backend')).toBe('Everyone in Backend is already in #backend.')
    expect(answer('a')).toBe('Everyone matching “a” is already in #backend.')
    expect(answer('zed')).toBe('No one in Spark Systems matches “zed”.')
    cleanup()
    const away = openAdd({ channel: { ...backend, memberIds: ['u-2', 'u-3'] } })
    expect(away.answer('Youssef')).toBe('Join the channel instead.')
  })

  it('a pasted list of addresses becomes a chip each; trailing punctuation goes; what can’t be added stays typed, with why', () => {
    const { type, chips, names, add } = openAdd()
    type('lina@partner.io, Omar@Client.com;')
    expect(chips()).toEqual(['Remove lina@partner.io', 'Remove omar@client.com'])
    expect((names as HTMLInputElement).value).toBe('')
    type('sam@client.com;')
    expect(chips()).toEqual(['Remove lina@partner.io', 'Remove omar@client.com', 'Remove sam@client.com'])
    type('zed@; nour.elsayed@spark-sys.com, mariam@client.com')
    expect(chips()).toContain('Remove mariam@client.com')
    expect((names as HTMLInputElement).value).toBe('zed@, nour.elsayed@spark-sys.com')
    expect(add.getByRole('alert').textContent).toBe("zed@ isn’t an email address.")
  })

  it('what is typed and not yet a chip goes with Add, and counts; text that can’t be added stops the Add and says why', async () => {
    const { type, add, onAdd, names } = openAdd()
    type('om')
    fireEvent.keyDown(names, { key: 'Enter' })
    type('sam@client.com')
    expect(add.getByText("sam@client.com isn’t in Spark Systems yet. They’ll get an email invite as a guest who can see #backend only.")).toBeTruthy()
    await act(async () => fireEvent.click(add.getByRole('button', { name: 'Add 2 people' })))
    expect(onAdd).toHaveBeenCalledWith({ userIds: ['u-4'], emails: ['sam@client.com'] })
    cleanup()
    const alone = openAdd()
    alone.type('sam@client.com')
    expect((alone.add.getByRole('button', { name: 'Add 1 person' }) as HTMLButtonElement).disabled).toBe(false)
    alone.type('zed')
    await act(async () => fireEvent.click(alone.add.getByRole('button', { name: 'Add people' })))
    expect(alone.add.getByRole('alert').textContent).toBe('No one in Spark Systems matches “zed”.')
    expect(alone.onAdd).not.toHaveBeenCalled()
  })
})

describe('Add people errors go with their cause (slice 5 review minors)', () => {
  const openAdd = (props: Partial<Props> = {}) => {
    const handlers = show({ tab: 'members', ...props })
    fireEvent.click(screen.getByRole('button', { name: 'Add people' }))
    const add = within(screen.getByRole('dialog', { name: /^Add people to/ }))
    const names = add.getByRole('combobox', { name: 'Names or emails' })
    fireEvent.focus(names)
    const type = (text: string) => fireEvent.change(names, { target: { value: text } })
    return { ...handlers, add, names, type }
  }
  const help = "sam@client.com isn’t in Spark Systems yet. They’ll get an email invite as a guest who can see #backend only."

  it('removing the chip a refusal was about takes the refusal away', async () => {
    const { add, names, type } = openAdd({ onAdd: vi.fn(async () => Promise.reject(new Error('Everyone you picked is already in #backend or invited.'))) })
    type('sam@client.com')
    fireEvent.keyDown(names, { key: 'Enter' })
    await act(async () => fireEvent.click(add.getByRole('button', { name: 'Add 1 person' })))
    expect(add.getByRole('alert').textContent).toBe('Everyone you picked is already in #backend or invited.')
    fireEvent.click(add.getByRole('button', { name: 'Remove sam@client.com' }))
    expect(add.queryByRole('alert')).toBeNull()
  })

  it('typing again takes a refusal away, and the guest notice comes back', () => {
    const { add, names, type } = openAdd()
    type('sam@client.com')
    fireEvent.keyDown(names, { key: 'Enter' })
    type('zed')
    fireEvent.keyDown(names, { key: 'Enter' })
    expect(add.getByRole('alert').textContent).toBe('No one in Spark Systems matches “zed”.')
    expect(add.queryByText(help)).toBeNull()
    type('o')
    expect(add.queryByRole('alert')).toBeNull()
    expect(add.getByText(help)).toBeTruthy()
  })
})

describe('Channel details: /invite opens Add people filled in (spec 6.8)', () => {
  it('starts on Add people with the people named who are not in the channel yet', () => {
    show({ tab: 'members', addPeople: ['u-4', 'u-2'] })
    const add = within(screen.getByRole('dialog', { name: 'Add people to #backend' }))
    expect(add.getByText('Omar Hassan')).toBeTruthy()
    expect(add.queryByText('Nour El-Sayed')).toBeNull()
  })
})

describe('Channel details › Tabs (spec 6.10): the channel’s bookmarks', () => {
  const bookmarks = [{ id: 'b1', channelId: 'c-backend', title: 'Runbook', url: 'https://wiki.spark-sys.com/runbook', createdBy: 'u-1', createdAt: '' }]
  it('lists them; Rename and Remove for whoever may post', async () => {
    const onUpdateBookmark = vi.fn(async () => {})
    const onRemoveBookmark = vi.fn(async () => {})
    show({ tab: 'tabs', bookmarks, onUpdateBookmark, onRemoveBookmark })
    expect(screen.getByRole('tab', { name: /Tabs/ }).getAttribute('aria-selected')).toBe('true')
    const row = within(screen.getByRole('listitem'))
    expect(row.getByRole('link', { name: 'Runbook' })).toBeTruthy()
    fireEvent.click(row.getByRole('button', { name: 'Rename Runbook' }))
    fireEvent.change(row.getByRole('textbox', { name: 'Name' }), { target: { value: 'On-call runbook' } })
    await act(async () => {
      fireEvent.click(row.getByRole('button', { name: 'Save' }))
    })
    expect(onUpdateBookmark).toHaveBeenCalledWith('b1', { title: 'On-call runbook' })
    await act(async () => {
      fireEvent.click(within(screen.getByRole('listitem')).getByRole('button', { name: 'Remove Runbook' }))
    })
    expect(onRemoveBookmark).toHaveBeenCalledWith('b1')
  })

  it('says when there are none; read-only without the handlers', () => {
    show({ tab: 'tabs', bookmarks: [] })
    expect(screen.getByText('No bookmarks yet. Add one with + after the channel’s tabs.')).toBeTruthy()
  })
})
