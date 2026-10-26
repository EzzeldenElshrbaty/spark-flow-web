import type { Api, Deliverable, Phase, Project } from '@/api/types'
import type { DbData, MockDb } from './db'
import { summarize } from './derive'
import { delay } from './latency'
import { badRequest, clone, currentUser, newId, notFound, requireCan } from './shared'

const KEY = /^[A-Z]{2,5}$/
const WATERFALL = ['Analysis', 'Design', 'Build', 'QA', 'Delivery']

export function findProject(data: DbData, id: string): Project {
  const project = data.projects.find((p) => p.id === id)
  if (!project) throw notFound('Project', id)
  return project
}

function findPhase(data: DbData, id: string): Phase {
  const phase = data.phases.find((p) => p.id === id)
  if (!phase) throw notFound('Phase', id)
  return phase
}

function checkDates(startDate: string, dueDate: string) {
  if (Number.isNaN(Date.parse(startDate)) || Number.isNaN(Date.parse(dueDate))) throw badRequest('Pick a start and a due date.')
  if (new Date(dueDate).getTime() < new Date(startDate).getTime()) throw badRequest('The due date is before the start date.')
}

/** `wanted` when nothing uses it yet, else a fresh id. */
const freeId = (wanted: string, taken: { id: string }[], prefix: string) => (taken.some((x) => x.id === wanted) ? newId(prefix) : wanted)

/** Splits start→due into `names.length` equal back-to-back phases. */
function splitPhases(projectId: string, names: string[], startDate: string, dueDate: string): Phase[] {
  const start = new Date(startDate).getTime()
  const span = (new Date(dueDate).getTime() - start) / names.length
  return names.map((name, i) => ({
    id: newId('ph'),
    projectId,
    name,
    order: i + 1,
    startDate: new Date(start + span * i).toISOString(),
    dueDate: i === names.length - 1 ? dueDate : new Date(start + span * (i + 1)).toISOString(),
    status: 'notStarted',
  }))
}

const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'

export function projectsApi(db: MockDb, now: () => Date): Pick<Api, 'projects' | 'phases' | 'deliverables'> & { summaries: Api['tickets']['projects'] } {
  const summaries = async (workspaceId: string) => {
    await delay()
    const data = await db.read()
    if (!data.workspaces.some((w) => w.id === workspaceId)) throw notFound('Workspace', workspaceId)
    const viewer = currentUser(data)
    return data.projects.filter((p) => p.workspaceId === workspaceId).map((p) => summarize(p, data, now(), { userId: viewer.id, role: viewer.role }))
  }

  return {
    summaries,
    projects: {
      list: summaries,
      async get(workspaceId, key) {
        const project = (await summaries(workspaceId)).find((p) => p.key === key)
        if (!project) throw notFound('Project', key)
        return project
      },
      async create(input) {
        await delay()
        return clone(
          await db.update((data) => {
            const me = requireCan(data, 'project.create')
            if (!data.workspaces.some((w) => w.id === input.workspaceId)) throw notFound('Workspace', input.workspaceId)
            const name = input.name.trim()
            if (!name) throw badRequest('Give the project a name.')
            if (!KEY.test(input.key)) throw badRequest('The key is 2 to 5 capital letters, such as NEX.')
            if (data.projects.some((p) => p.workspaceId === input.workspaceId && p.key === input.key)) throw badRequest(`Key ${input.key} is already used.`)
            if (!data.users.some((u) => u.id === input.managerId)) throw badRequest('Pick a project manager.')
            checkDates(input.startDate, input.dueDate)

            const id = freeId(`p-${input.key.toLowerCase()}`, data.projects, 'p')
            const channelId = freeId(`c-p-${input.key.toLowerCase()}`, data.channels, 'c')
            const teamMembers = data.teams.filter((t) => input.teamIds.includes(t.id)).flatMap((t) => t.memberIds)
            const project: Project = { ...input, id, name, status: 'planned', channelId, logoFileId: null }
            data.projects.push(project)
            data.channels.push({
              id: channelId,
              workspaceId: input.workspaceId,
              kind: 'channel',
              name: slug(name),
              topic: `${name} project chat.`,
              memberIds: [...new Set([me.id, input.managerId, ...input.memberIds, ...teamMembers])],
              isPrivate: false,
              lastMessageAt: null,
            })
            data.phases.push(...splitPhases(id, input.methodology === 'waterfall' ? WATERFALL : ['Build'], input.startDate, input.dueDate))
            data.counters[id] = 101
            return project
          }),
        )
      },
      async update(id, patch) {
        await delay()
        return clone(
          await db.update((data) => {
            const project = findProject(data, id)
            requireCan(data, 'project.edit', project)
            const next = { ...project, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) }
            if (!next.name.trim()) throw badRequest('Give the project a name.')
            checkDates(next.startDate, next.dueDate)
            Object.assign(project, next)
            return project
          }),
        )
      },
    },

    phases: {
      async list(projectId) {
        await delay()
        const data = await db.read()
        findProject(data, projectId)
        return data.phases.filter((p) => p.projectId === projectId).sort((a, b) => a.order - b.order)
      },
      async create(input) {
        await delay()
        return clone(
          await db.update((data) => {
            const project = findProject(data, input.projectId)
            requireCan(data, 'phase.manage', project)
            if (!input.name.trim()) throw badRequest('Give the phase a name.')
            checkDates(input.startDate, input.dueDate)
            const order = Math.max(0, ...data.phases.filter((p) => p.projectId === project.id).map((p) => p.order)) + 1
            const phase: Phase = { ...input, name: input.name.trim(), id: newId('ph'), order, status: 'notStarted' }
            data.phases.push(phase)
            return phase
          }),
        )
      },
      async update(id, patch) {
        await delay()
        return clone(
          await db.update((data) => {
            const phase = findPhase(data, id)
            requireCan(data, 'phase.manage', findProject(data, phase.projectId))
            const next = { ...phase, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) }
            if (!next.name.trim()) throw badRequest('Give the phase a name.')
            checkDates(next.startDate, next.dueDate)
            Object.assign(phase, next)
            return phase
          }),
        )
      },
      async remove(id) {
        await delay()
        await db.update((data) => {
          const phase = findPhase(data, id)
          requireCan(data, 'phase.manage', findProject(data, phase.projectId))
          data.phases = data.phases.filter((p) => p.id !== id)
          for (const t of data.tickets) if (t.phaseId === id) t.phaseId = null
          for (const d of data.deliverables) if (d.phaseId === id) d.phaseId = null
        })
      },
      async reorder(projectId, ids) {
        await delay()
        return clone(
          await db.update((data) => {
            const project = findProject(data, projectId)
            requireCan(data, 'phase.manage', project)
            const own = data.phases.filter((p) => p.projectId === projectId)
            if (ids.length !== own.length || new Set(ids).size !== ids.length || !ids.every((id) => own.some((p) => p.id === id)))
              throw badRequest('The phase order must list every phase of the project once.')
            ids.forEach((id, i) => (own.find((p) => p.id === id)!.order = i + 1))
            return own.sort((a, b) => a.order - b.order)
          }),
        )
      },
    },

    deliverables: {
      async list(projectId) {
        await delay()
        const data = await db.read()
        findProject(data, projectId)
        return data.deliverables.filter((d) => d.projectId === projectId).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
      },
      async create(input) {
        await delay()
        return clone(
          await db.update((data) => {
            const project = findProject(data, input.projectId)
            requireCan(data, 'project.edit', project)
            if (!input.title.trim()) throw badRequest('Give the deliverable a title.')
            if (input.phaseId && findPhase(data, input.phaseId).projectId !== project.id) throw badRequest('That phase belongs to another project.')
            const deliverable: Deliverable = { ...input, title: input.title.trim(), id: newId('d'), doneAt: null }
            data.deliverables.push(deliverable)
            return deliverable
          }),
        )
      },
      async update(id, patch) {
        await delay()
        return clone(
          await db.update((data) => {
            const deliverable = data.deliverables.find((d) => d.id === id)
            if (!deliverable) throw notFound('Deliverable', id)
            requireCan(data, 'project.edit', findProject(data, deliverable.projectId))
            Object.assign(deliverable, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)))
            if (!deliverable.title.trim()) throw badRequest('Give the deliverable a title.')
            return deliverable
          }),
        )
      },
    },
  }
}
