import { describe, expect, it } from 'vitest'
import { bottomTab } from './bottomTab'

describe('bottomTab (UX Phase 5B, 5.2): the phone bar marks where you are', () => {
  it('Dashboard, Projects and Chat for their own pages; More for what lives under More; nothing for Search', () => {
    expect(bottomTab('/w/eng/dashboard')).toBe('dashboard')
    for (const path of ['/w/eng/projects', '/w/eng/p/NEX/tasks', '/w/eng/p/NEX/overview']) expect(bottomTab(path), path).toBe('projects')
    for (const path of ['/w/eng/c/c-1', '/w/eng/activity', '/w/eng/threads', '/w/eng/saved']) expect(bottomTab(path), path).toBe('chat')
    for (const path of ['/w/eng', '/w/eng/', '/w/eng/tasks', '/w/eng/time', '/w/eng/teams', '/w/eng/settings', '/w/eng/settings/users', '/w/eng/preferences', '/w/eng/help', '/w/eng/help/time'])
      expect(bottomTab(path), path).toBe('more')
    expect(bottomTab('/w/eng/search')).toBeNull()
  })
})
