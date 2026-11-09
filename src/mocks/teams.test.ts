import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

// UX Phase 2, 2.4: teams are made, renamed and removed by whoever may change settings (Admins by default).

let api: Api
let hub: MockHub
let db: MockDb
beforeEach(() => {
  latency.min = latency.max = 0
  hub = createMockHub(`test-teams-${Math.random()}`, null)
  db = createDb(createMemoryStore(), seed)
  api = createMockApi(db, hub)
})
afterEach(() => hub.close())
const detail = (p: Promise<unknown>) => p.then(() => 'no error', (e: { detail?: string; status?: number }) => `${e.status} ${e.detail}`)

describe('teams (UX Phase 2, 2.4)', () => {
  it('an Admin makes a team, its name trimmed; names are unique in the workspace, whatever their case', async () => {
    const made = await api.teams.create('ws-eng', '  Data ')
    expect(made).toMatchObject({ name: 'Data', workspaceId: 'ws-eng', memberIds: [] })
    expect((await api.teams.list('ws-eng')).map((t) => t.name)).toContain('Data')
    expect(await detail(api.teams.create('ws-eng', 'data'))).toBe("400 There's already a team called data.")
    expect(await detail(api.teams.create('ws-eng', '   '))).toBe('400 Name the team.')
    expect(await detail(api.teams.create('ws-eng', 'x'.repeat(41)))).toBe("400 A team's name has at most 40 characters.")
    // Another workspace may have its own Data.
    expect((await api.teams.create('ws-design', 'Data')).workspaceId).toBe('ws-design')
  })

  it('someone who may not change settings is refused', async () => {
    await api.users.viewAs('u-3')
    expect(await detail(api.teams.create('ws-eng', 'Data'))).toMatch(/^403 /)
    expect(await detail(api.teams.rename('t-qa', 'Quality'))).toMatch(/^403 /)
    expect(await detail(api.teams.remove('t-qa'))).toMatch(/^403 /)
  })

  it('renames a team', async () => {
    expect((await api.teams.rename('t-qa', 'Quality')).name).toBe('Quality')
    expect(await detail(api.teams.rename('t-qa', 'Backend'))).toBe("400 There's already a team called Backend.")
  })

  it('a team a project names can’t be removed; one no project names leaves its people', async () => {
    expect(await detail(api.teams.remove('t-backend'))).toBe('400 Take Backend off Nexus Core first.')
    const salma = (await api.users.directory()).find((u) => u.id === 'u-5')!
    expect(salma.teamIds).toContain('t-qa')
    await api.teams.remove('t-qa')
    expect((await api.teams.list('ws-eng')).some((t) => t.id === 't-qa')).toBe(false)
    expect((await api.users.directory()).find((u) => u.id === 'u-5')!.teamIds).not.toContain('t-qa')
  })
})
