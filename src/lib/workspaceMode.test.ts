import { describe, expect, it } from 'vitest'
import type { Channel, Project } from '@/api/types'
import { modeOf, modeTarget } from '@/lib/workspaceMode'
import { seed } from '@/mocks/seed'

const data = seed(new Date('2026-10-26T09:00:00Z')).data
const toChannel = (c: (typeof data.channels)[number]): Channel => ({ ...c, unreadCount: 0, lastSeq: 0, lastReadSeq: 0, starred: false, muted: false, notifyLevel: 'all' as const })
const channels = data.channels.filter((c) => c.workspaceId === 'ws-eng').map(toChannel)
const projects: Project[] = data.projects.filter((p) => p.workspaceId === 'ws-eng')

describe('modeOf', () => {
  it('puts channels, DMs and the chat views on the Chat side', () => {
    for (const path of ['/w/engineering/c/c-backend', '/w/engineering/activity', '/w/engineering/saved', '/w/engineering/drafts', '/w/engineering/threads']) {
      expect(modeOf(path), path).toBe('chat')
    }
  })

  it('puts Home, the project pages and the manager pages on the Projects side', () => {
    for (const path of ['/w/engineering', '/w/engineering/', '/w/engineering/projects', '/w/engineering/tasks', '/w/engineering/teams', '/w/engineering/dashboard', '/w/engineering/time', '/w/engineering/p/NEX/overview', '/w/engineering/p/NEX/chat']) {
      expect(modeOf(path), path).toBe('projects')
    }
  })

  it('leaves Settings, search and unknown pages to the side you were on', () => {
    for (const path of ['/w/engineering/settings', '/w/engineering/settings/rates', '/w/engineering/search', '/', '/w/engineering/nope', '/dev/ui']) {
      expect(modeOf(path), path).toBeNull()
    }
  })

  it('reads the path only, not a query or a longer word that starts the same', () => {
    expect(modeOf('/w/engineering/c/c-backend?message=m-b07')).toBe('chat')
    expect(modeOf('/w/engineering/savedish')).toBeNull()
    expect(modeOf('/w/engineering/projects-old')).toBeNull()
  })
})

describe('modeTarget', () => {
  it('reopens the last place on that side', () => {
    const last = { engineering: { chat: '/w/engineering/c/c-backend', projects: '/w/engineering/p/NEX/tasks' } }
    expect(modeTarget('engineering', 'chat', last, channels, projects)).toBe('/w/engineering/c/c-backend')
    expect(modeTarget('engineering', 'projects', last, channels, projects)).toBe('/w/engineering/p/NEX/tasks')
  })

  it('starts on #general and Home when nothing is saved for that side', () => {
    expect(modeTarget('engineering', 'chat', {}, channels, projects)).toBe('/w/engineering/c/c-general')
    expect(modeTarget('engineering', 'projects', {}, channels, projects)).toBe('/w/engineering')
  })

  it('drops a saved place that no longer leads anywhere, or belongs to the other side or workspace', () => {
    const gone = { engineering: { chat: '/w/engineering/c/c-removed', projects: '/w/engineering/p/OLD/overview' } }
    expect(modeTarget('engineering', 'chat', gone, channels, projects)).toBe('/w/engineering/c/c-general')
    expect(modeTarget('engineering', 'projects', gone, channels, projects)).toBe('/w/engineering')
    const crossed = { engineering: { chat: '/w/engineering/p/NEX/overview', projects: '/w/design/projects' } }
    expect(modeTarget('engineering', 'chat', crossed, channels, projects)).toBe('/w/engineering/c/c-general')
    expect(modeTarget('engineering', 'projects', crossed, channels, projects)).toBe('/w/engineering')
  })

  it('keeps the Home of a saved projects place, which has no page of its own to check', () => {
    expect(modeTarget('engineering', 'projects', { engineering: { projects: '/w/engineering' } }, channels, projects)).toBe('/w/engineering')
  })

  it('waits while the channels or projects it needs are still loading', () => {
    expect(modeTarget('engineering', 'chat', {}, undefined, projects)).toBeUndefined()
    expect(modeTarget('engineering', 'projects', { engineering: { projects: '/w/engineering/p/NEX/tasks' } }, channels, undefined)).toBeUndefined()
  })
})
