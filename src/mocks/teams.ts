import type { Api, Team } from '@/api/types'
import { can } from '@/lib/permissions'
import { audit, recordOf } from './audit'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import type { MockHub } from './realtime'
import { grantsFor } from './roles'
import { badRequest, clone, currentUser, forbidden, newId, notFound } from './shared'

const MAX_NAME = 40

/** A team's name: trimmed, 1–40 characters, not another team's in the same workspace (whatever the case). */
function checkName(data: DbData, workspaceId: string, value: unknown, exceptId?: string): string {
  if (typeof value !== 'string' || !value.trim()) throw badRequest('Name the team.')
  const name = value.trim()
  if (name.length > MAX_NAME) throw badRequest(`A team's name has at most ${MAX_NAME} characters.`)
  if (data.teams.some((t) => t.workspaceId === workspaceId && t.id !== exceptId && t.name.toLowerCase() === name.toLowerCase())) throw badRequest(`There's already a team called ${name}.`)
  return name
}

/** "Nexus Core", "Nexus Core and El Moasser portal", "A, B and C". */
const listed = (names: string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

/**
 * Teams (UX Phase 2, 2.4): everyone reads them; making, renaming and removing one needs settings.manage. A team a
 * project names (archived ones too) can't be removed; removing one takes it off its people.
 */
export function teamsApi(db: MockDb, hub: MockHub): Api['teams'] {
  const requireManage = (data: DbData) => {
    const me = currentUser(data)
    if (!can('settings.manage', { userId: me.id, grants: grantsFor(data, me) })) throw forbidden('teams')
  }
  const find = (data: DbData, id: string): Team => {
    const team = data.teams.find((t) => t.id === id)
    if (!team) throw notFound('Team', id)
    return team
  }
  // People's teams decide who is on which project: everything refreshes.
  const changed = () => hub.publish({ type: 'peopleChanged' })
  return {
    async list(workspaceId) {
      await delay()
      const data = await db.read()
      if (!data.workspaces.some((w) => w.id === workspaceId)) throw notFound('Workspace', workspaceId)
      return data.teams.filter((t) => t.workspaceId === workspaceId)
    },
    async create(workspaceId, name) {
      await delay()
      const team = await db.update((data) => {
        requireManage(data)
        if (!data.workspaces.some((w) => w.id === workspaceId)) throw notFound('Workspace', workspaceId)
        const made: Team = { id: newId('t'), workspaceId, name: checkName(data, workspaceId, name), memberIds: [] }
        data.teams.push(made)
        audit(data, { action: 'created', group: 'settings', record: recordOf.team(made), changes: [] })
        return clone(made)
      })
      changed()
      return team
    },
    async rename(id, name) {
      await delay()
      const team = await db.update((data) => {
        requireManage(data)
        const stored = find(data, id)
        const was = stored.name
        stored.name = checkName(data, stored.workspaceId, name, id)
        if (stored.name !== was) audit(data, { action: 'changed', group: 'settings', record: recordOf.team(stored), changes: [{ field: 'Name', from: was, to: stored.name }] })
        return clone(stored)
      })
      changed()
      return team
    },
    async remove(id) {
      await delay()
      await db.update((data) => {
        requireManage(data)
        const stored = find(data, id)
        const projects = data.projects.filter((p) => p.teamIds.includes(id)).map((p) => p.name)
        if (projects.length) throw badRequest(`Take ${stored.name} off ${listed(projects)} first.`)
        for (const person of data.users) person.teamIds = person.teamIds.filter((t) => t !== id)
        data.teams = data.teams.filter((t) => t.id !== id)
        audit(data, { action: 'deleted', group: 'settings', record: recordOf.team(stored), changes: [] })
      })
      changed()
    },
  }
}
