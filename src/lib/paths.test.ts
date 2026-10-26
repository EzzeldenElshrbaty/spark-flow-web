import { describe, expect, it } from 'vitest'
import type { Channel } from '@/api/types'
import { landingPath, paths } from '@/lib/paths'
import { seed } from '@/mocks/seed'

const data = seed(new Date('2026-10-26T09:00:00Z'))
const toChannel = (c: (typeof data.channels)[number]): Channel => ({ ...c, unreadCount: 0 })
const engineering = data.channels.filter((c) => c.workspaceId === 'ws-eng').map(toChannel)
const design = data.channels.filter((c) => c.workspaceId === 'ws-design').map(toChannel)
const noGeneral = engineering.filter((c) => c.name !== 'general')

describe('paths', () => {
  it('builds every route', () => {
    expect(paths.workspace('engineering')).toBe('/w/engineering')
    expect(paths.channel('engineering', 'c-general')).toBe('/w/engineering/c/c-general')
    expect(paths.project('engineering', 'NEX')).toBe('/w/engineering/p/NEX/board')
    expect(paths.project('engineering', 'NEX', 'backlog')).toBe('/w/engineering/p/NEX/backlog')
    expect(paths.settings('engineering')).toBe('/w/engineering/settings')
  })
})

describe('landingPath', () => {
  it('uses the saved place for that workspace', () => {
    expect(landingPath('engineering', { engineering: '/w/engineering/p/NEX/backlog' }, engineering)).toBe('/w/engineering/p/NEX/backlog')
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
