import { describe, expect, it } from 'vitest'
import type { Channel } from '@/api/types'
import { workspaceShortcuts } from '@/layout/searchShortcuts'
import { seed } from '@/mocks/seed'

const data = seed(new Date('2026-10-26T09:00:00Z'))
const ws = data.workspaces.find((w) => w.slug === 'engineering')!
const chans: Channel[] = data.channels.filter((c) => c.workspaceId === ws.id).map((c) => ({ ...c, unreadCount: 0 }))
const projects = data.projects.filter((p) => p.workspaceId === ws.id)
const nour = data.users.find((u) => u.id === 'u-2')!

describe('workspaceShortcuts', () => {
  const shortcuts = workspaceShortcuts(ws, chans, projects, data.users, 'u-1')

  it('offers channels, DMs and project boards of the workspace', () => {
    expect(shortcuts.map((s) => s.title)).toEqual(expect.arrayContaining(['#general', nour.name, 'Nexus Core · Board']))
  })

  it('links with the route helpers', () => {
    expect(shortcuts.find((s) => s.title === '#general')!.link).toBe('/w/engineering/c/c-general')
    expect(shortcuts.find((s) => s.title === nour.name)!.link).toBe('/w/engineering/c/c-dm-1')
    expect(shortcuts.find((s) => s.title === 'Nexus Core · Board')!.link).toBe('/w/engineering/p/NEX/board')
  })

  it('leaves out channels of other workspaces', () => {
    expect(shortcuts.map((s) => s.title)).not.toContain('#design')
  })

  it('gives each shortcut a unique id', () => {
    const ids = shortcuts.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
