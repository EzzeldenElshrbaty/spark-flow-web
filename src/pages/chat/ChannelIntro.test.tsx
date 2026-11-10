// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Channel, User } from '@/api/types'
import { ChannelIntro, introText } from '@/pages/chat/ChannelIntro'

window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

afterEach(cleanup)

const people = [
  { id: 'u-1', name: 'Youssef Abdelrahman' },
  { id: 'u-2', name: 'Nour El-Sayed' },
  { id: 'u-3', name: 'Mariam Fathy' },
  { id: 'u-9', name: 'Karim Hassan' },
] as User[]
const now = new Date(2026, 10, 11, 10, 0)
const release: Channel = {
  id: 'c-release', workspaceId: 'ws-eng', kind: 'channel', name: 'release-v2', topic: '', memberIds: ['u-1', 'u-2'], isPrivate: false, lastMessageAt: null,
  description: '', whoCanPost: 'everyone', isDefault: false, unreadCount: 0, lastSeq: 0, lastReadSeq: 0, starred: false, muted: false, notifyLevel: 'mentions', notifyLevelOwn: false,
  createdAt: new Date(2026, 10, 11, 9, 0).toISOString(), createdBy: 'u-1',
}
const text = (over: Partial<Channel>, project: { name: string } | null = null) => introText({ channel: { ...release, ...over }, people, me: 'u-1', project, now })

describe('introText (chat spec 6.14 §5.3)', () => {
  it('a channel: who made it, and when', () => {
    expect(text({})).toBe('You created this channel today. This is the very beginning of #release-v2.')
    expect(text({ createdBy: 'u-2', createdAt: new Date(2026, 9, 3, 12, 0).toISOString() })).toBe(
      'Nour El-Sayed created this channel on 3 Oct 2026. This is the very beginning of #release-v2.',
    )
    expect(text({ createdBy: 'u-2', createdAt: new Date(2026, 10, 10, 18, 0).toISOString() })).toBe('Nour El-Sayed created this channel yesterday. This is the very beginning of #release-v2.')
  })

  it('a channel made before anyone kept track says only where it begins', () => {
    expect(text({ createdBy: null, createdAt: '2026-10-01T09:00:00.000Z' })).toBe('This is the very beginning of #release-v2.')
    expect(text({ createdBy: undefined, createdAt: undefined })).toBe('This is the very beginning of #release-v2.')
  })

  it('a project’s channel names its project', () => {
    expect(text({ name: 'nexus-core' }, { name: 'Nexus Core' })).toBe('This is the very beginning of #nexus-core, Nexus Core’s chat.')
  })

  it('a conversation names the people in it', () => {
    expect(text({ kind: 'dm', name: null, memberIds: ['u-1', 'u-2'] })).toBe('This is the very beginning of your conversation with Nour El-Sayed.')
    expect(text({ kind: 'dm', name: null, memberIds: ['u-1', 'u-2', 'u-3'] })).toBe('This is the very beginning of your conversation with Nour El-Sayed and Mariam Fathy.')
    expect(text({ kind: 'dm', name: null, memberIds: ['u-1', 'u-2', 'u-3', 'u-9'] })).toBe(
      'This is the very beginning of your conversation with Nour El-Sayed, Mariam Fathy and Karim Hassan.',
    )
  })
})

const all = { addPeople: true, template: true, editDescription: true }
const none = { addPeople: false, template: false, editDescription: false }
const projects = [
  { key: 'NEX', name: 'Nexus Core' },
  { key: 'MOB', name: 'Mobile App' },
]

function show(props: Partial<Parameters<typeof ChannelIntro>[0]> = {}) {
  const handlers = { onAddPeople: vi.fn(), onEditDescription: vi.fn(), onPickTemplate: vi.fn(), onLinkProject: vi.fn(async () => {}) }
  render(<ChannelIntro channel={release} people={people} me="u-1" project={null} can={all} linkable={projects} now={now} {...handlers} {...props} />)
  return handlers
}

describe('ChannelIntro', () => {
  it('buttons follow what I may do', () => {
    show()
    for (const name of ['Add people', 'Pick a template', 'Link a project', 'Add a description']) expect(screen.getByRole('button', { name })).toBeTruthy()
    cleanup()
    show({ can: none, linkable: [] })
    for (const name of ['Add people', 'Pick a template', 'Link a project', 'Add a description', 'Edit description']) expect(screen.queryByRole('button', { name })).toBeNull()
  })

  it('an archived channel shows the words only', () => {
    show({ channel: { ...release, archivedAt: '2026-11-11T09:30:00.000Z' } })
    expect(screen.getByText('You created this channel today. This is the very beginning of #release-v2.')).toBeTruthy()
    expect(screen.queryAllByRole('button')).toEqual([])
  })

  it('a description reads under the line; Add a description when there is none', () => {
    const handlers = show({ channel: { ...release, description: 'Scope, QA status and the go/no-go call.' } })
    expect(screen.getByText('Scope, QA status and the go/no-go call.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit description' }))
    expect(handlers.onEditDescription).toHaveBeenCalled()
  })

  it('the buttons do what they say', () => {
    const handlers = show()
    fireEvent.click(screen.getByRole('button', { name: 'Add people' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pick a template' }))
    expect(handlers.onAddPeople).toHaveBeenCalled()
    expect(handlers.onPickTemplate).toHaveBeenCalled()
  })

  it('Link a project lists the projects and links the one picked', async () => {
    const handlers = show()
    fireEvent.click(screen.getByRole('button', { name: 'Link a project' }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Nexus Core', 'Mobile App'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Nexus Core' }))
    expect(handlers.onLinkProject).toHaveBeenCalledWith({ key: 'NEX', name: 'Nexus Core' })
  })

  it('the heading is an h2 and a private channel shows the lock', () => {
    show({ channel: { ...release, isPrivate: true } })
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading.textContent).toContain('release-v2')
    expect(heading.querySelector('[data-icon="lock"]')).not.toBeNull()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })
})
