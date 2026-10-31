import { describe, expect, it } from 'vitest'
import type { Channel, Project } from '@/api/types'
import { landingPath, legacyProjectPath, paths, projectTabs, validSavedPlace } from '@/lib/paths'
import { seed } from '@/mocks/seed'

const data = seed(new Date('2026-10-26T09:00:00Z')).data
const toChannel = (c: (typeof data.channels)[number]): Channel => ({ ...c, unreadCount: 0, lastSeq: 0, lastReadSeq: 0, starred: false, muted: false, notifyLevel: 'all' as const, notifyLevelOwn: false })
const engineering = data.channels.filter((c) => c.workspaceId === 'ws-eng').map(toChannel)
const design = data.channels.filter((c) => c.workspaceId === 'ws-design').map(toChannel)
const noGeneral = engineering.filter((c) => c.name !== 'general')
const engineeringProjects: Project[] = data.projects.filter((p) => p.workspaceId === 'ws-eng')

describe('paths', () => {
  it('builds every route', () => {
    expect(paths.workspace('engineering')).toBe('/w/engineering')
    expect(paths.channel('engineering', 'c-general')).toBe('/w/engineering/c/c-general')
    expect(paths.project('engineering', 'NEX')).toBe('/w/engineering/p/NEX/overview')
    expect(paths.project('engineering', 'NEX', 'tasks')).toBe('/w/engineering/p/NEX/tasks')
    expect(paths.project('engineering', 'NEX', 'tasks', { view: 'list', phase: 'ph-nex-build' })).toBe('/w/engineering/p/NEX/tasks?view=list&phase=ph-nex-build')
    expect(paths.project('engineering', 'NEX', 'tasks', { sprint: undefined })).toBe('/w/engineering/p/NEX/tasks')
    expect(paths.projects('engineering')).toBe('/w/engineering/projects')
    expect(paths.tasks('engineering')).toBe('/w/engineering/tasks')
    expect(paths.settings('engineering')).toBe('/w/engineering/settings')
    expect(paths.activity('engineering')).toBe('/w/engineering/activity')
    expect(paths.threads('engineering')).toBe('/w/engineering/threads')
  })
})

describe('paths.message', () => {
  it('is the channel with the message to jump to, its id escaped', () => {
    expect(paths.message('engineering', 'c-backend', 'm-b07')).toBe('/w/engineering/c/c-backend?message=m-b07')
    expect(paths.message('engineering', 'c-1', 'a&b')).toBe('/w/engineering/c/c-1?message=a%26b')
  })
})

describe('landingPath', () => {
  it('uses the saved place for that workspace', () => {
    expect(landingPath('engineering', { engineering: '/w/engineering/p/NEX/tasks' }, engineering)).toBe('/w/engineering/p/NEX/tasks')
  })

  it('ignores a saved place from another workspace', () => {
    expect(landingPath('design', { design: '/w/engineering/c/c-backend' }, design)).toBe('/w/design/c/c-design')
  })

  it('does not mistake a longer slug for the same workspace', () => {
    expect(landingPath('design', { design: '/w/design-2/c/x' }, design)).toBe('/w/design/c/c-design')
  })

  it('falls back to #general, then the first channel, then settings', () => {
    expect(landingPath('engineering', {}, engineering)).toBe('/w/engineering/c/c-general')
    expect(landingPath('engineering', {}, noGeneral)).toBe(paths.channel('engineering', noGeneral[0].id))
    expect(landingPath('engineering', {}, [])).toBe('/w/engineering/settings')
  })

  it('never lands on a DM before a channel', () => {
    const dmFirst = [...engineering.filter((c) => c.kind === 'dm'), ...noGeneral.filter((c) => c.kind === 'channel')]
    expect(landingPath('engineering', {}, dmFirst)).toBe(paths.channel('engineering', dmFirst.find((c) => c.kind === 'channel')!.id))
  })
})

describe('validSavedPlace', () => {
  const key = engineeringProjects[0].key

  it('accepts a channel that is loaded', () => {
    expect(validSavedPlace('/w/engineering/c/c-general', engineering, engineeringProjects)).toBe(true)
    expect(validSavedPlace('/w/engineering/settings/rates', engineering, engineeringProjects)).toBe(true)
    expect(paths.rates('engineering')).toBe('/w/engineering/settings/rates')
    expect(paths.roles('engineering')).toBe('/w/engineering/settings/roles')
    expect(validSavedPlace('/w/engineering/settings/roles', engineering, engineeringProjects)).toBe(true)
    expect(paths.home('engineering')).toBe('/w/engineering')
    expect(paths.dashboard('engineering')).toBe('/w/engineering/dashboard')
    expect(validSavedPlace(paths.saved('engineering'), engineering, engineeringProjects)).toBe(true)
    expect(validSavedPlace(paths.drafts('engineering'), engineering, engineeringProjects)).toBe(true)
    expect(validSavedPlace('/w/engineering/dashboard', engineering, engineeringProjects)).toBe(true)
  })

  it('rejects a channel that is gone', () => {
    expect(validSavedPlace('/w/engineering/c/c-removed', engineering, engineeringProjects)).toBe(false)
  })

  it('accepts a known project on any of its tabs, and the Projects and My tasks pages', () => {
    for (const tab of ['overview', 'tasks', 'chat', 'time']) expect(validSavedPlace(`/w/engineering/p/${key}/${tab}`, engineering, engineeringProjects)).toBe(true)
    expect(validSavedPlace('/w/engineering/projects', engineering, engineeringProjects)).toBe(true)
    expect(validSavedPlace('/w/engineering/tasks', engineering, engineeringProjects)).toBe(true)
    expect(validSavedPlace('/w/engineering/activity', engineering, engineeringProjects)).toBe(true)
    expect(validSavedPlace('/w/engineering/threads', engineering, engineeringProjects)).toBe(true)
    expect(validSavedPlace('/w/engineering/preferences', engineering, engineeringProjects)).toBe(true)
    expect(validSavedPlace(`/w/engineering/p/${key}/board`, engineering, engineeringProjects)).toBe(false) // old address: redirected, not saved
    expect(validSavedPlace(`/w/engineering/p/${key}/nope`, engineering, engineeringProjects)).toBe(false)
  })

  it('rejects an unknown project or view', () => {
    expect(validSavedPlace('/w/engineering/p/NOPE/overview', engineering, engineeringProjects)).toBe(false)
    expect(validSavedPlace(`/w/engineering/p/${key}/timeline`, engineering, engineeringProjects)).toBe(false)
    expect(validSavedPlace(`/w/engineering/p/${key}`, engineering, engineeringProjects)).toBe(false)
  })

  it('accepts settings and rejects anything else', () => {
    expect(validSavedPlace('/w/engineering/settings', engineering, engineeringProjects)).toBe(true)
    expect(validSavedPlace('/w/engineering/nowhere', engineering, engineeringProjects)).toBe(false)
    expect(validSavedPlace('/w/engineering/c/c-general/extra', engineering, engineeringProjects)).toBe(false)
  })
})

describe('legacyProjectPath', () => {
  it('legacy project paths map to the new tabs', () => {
    expect(legacyProjectPath('/w/engineering/p/NEX/board')).toBe('/w/engineering/p/NEX/tasks?view=board')
    expect(legacyProjectPath('/w/engineering/p/NEX/backlog')).toBe('/w/engineering/p/NEX/tasks?view=list')
    expect(legacyProjectPath('/w/engineering/p/NEX')).toBe('/w/engineering/p/NEX/overview')
    expect(legacyProjectPath('/w/engineering/p/NEX/tasks')).toBeNull()
    expect(legacyProjectPath('/w/engineering/c/c-general')).toBeNull()
  })
})

describe('project tabs', () => {
  it('history is a project tab', () => {
    expect(projectTabs).toContain('history')
  })
})
