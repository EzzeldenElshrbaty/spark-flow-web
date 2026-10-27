import type { Api, BoardColumn, Deliverable, DeliverablePatch, Phase, PhasePatch, PhaseStatus, Project, ProjectPatch, ProjectStatus } from '@/api/types'
import type { DbData, MockDb } from './db'
import { columnErrors, columnsOf } from '@/lib/boardColumns'
import { summarize } from './derive'
import { delay } from './latency'
import type { MockHub } from './realtime'
import { logActivity, statusChange } from './activity'
import { badRequest, clone, currentUser, isDate, newId, notFound, pickPatch, requireCan } from './shared'

const KEY = /^[A-Z]{2,5}$/

/** The fields each patch may carry (ProjectPatch, PhasePatch, DeliverablePatch); anything else is refused. */
const PROJECT_FIELDS = [
  'name', 'clientName', 'description', 'links', 'managerId', 'memberIds', 'teamIds', 'status', 'startDate', 'dueDate', 'logoFileId',
] as const satisfies readonly (keyof ProjectPatch)[]
const PHASE_FIELDS = ['name', 'startDate', 'dueDate', 'status'] as const satisfies readonly (keyof PhasePatch)[]
const DELIVERABLE_FIELDS = ['phaseId', 'title', 'dueDate', 'doneAt'] as const satisfies readonly (keyof DeliverablePatch)[]
const PROJECT_STATUSES: readonly ProjectStatus[] = ['planned', 'active', 'onHold', 'delivered']
const PHASE_STATUSES: readonly PhaseStatus[] = ['notStarted', 'inProgress', 'done']

/** A project's people and status point at things that exist. */
function checkProjectRefs(data: DbData, project: Pick<Project, 'status' | 'managerId' | 'memberIds' | 'teamIds'>) {
  if (!PROJECT_STATUSES.includes(project.status)) throw badRequest("That isn't a project status.")
  if (!data.users.some((u) => u.id === project.managerId)) throw badRequest('Pick a project manager.')
  if (!project.memberIds.every((id) => data.users.some((u) => u.id === id))) throw badRequest("Someone on this list doesn't exist.")
  if (!project.teamIds.every((id) => data.teams.some((t) => t.id === id))) throw badRequest("That team doesn't exist.")
}
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

/**
 * History lines for a board change: each renamed or retyped column, and each column that moved. A column moved when
 * it isn't in the longest run that kept its old order, so dragging one column is one line, not one per neighbour.
 */
function logBoardChanges(data: DbData, projectId: string, before: BoardColumn[], after: BoardColumn[], at: string) {
  const was = (id: string) => before.find((c) => c.id === id)!
  for (const c of after) {
    const old = was(c.id)
    if (old.label !== c.label) logActivity(data, { projectId, taskKey: null, kind: 'column.renamed', subject: c.label, changes: [{ field: 'label', from: old.label, to: c.label }] }, at)
    if (old.category !== c.category) logActivity(data, { projectId, taskKey: null, kind: 'column.typed', subject: c.label, changes: [{ field: 'category', from: old.category, to: c.category }] }, at)
  }
  const order = after.map((c) => before.findIndex((b) => b.id === c.id))
  // Longest increasing run of old positions (n ≤ 10, so the simple way).
  const best = order.map(() => 1)
  const prev = order.map(() => -1)
  order.forEach((v, i) => {
    for (let j = 0; j < i; j++) if (order[j]! < v && best[j]! + 1 > best[i]!) [best[i], prev[i]] = [best[j]! + 1, j]
  })
  const kept = new Set<number>()
  for (let i = best.indexOf(Math.max(...best)); i >= 0; i = prev[i]!) kept.add(i)
  after.forEach((c, i) => {
    if (!kept.has(i)) logActivity(data, { projectId, taskKey: null, kind: 'column.moved', subject: c.label, changes: [] }, at)
  })
}

export function projectsApi(db: MockDb, hub: MockHub, now: () => Date): Pick<Api, 'projects' | 'phases' | 'deliverables'> & { summaries: Api['tickets']['projects'] } {
  /** One write about a project, then tells every tab that project changed (board, phases, deliverables, details). */
  const write = async <T>(projectIdOf: (result: T) => string, fn: (data: DbData) => T): Promise<T> => {
    const result = await db.update(fn)
    hub.publish({ type: 'projectChanged', projectId: projectIdOf(result) })
    return clone(result)
  }
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
        return write((p) => p.id, (data) => {
            const me = requireCan(data, 'project.create')
            if (!data.workspaces.some((w) => w.id === input.workspaceId)) throw notFound('Workspace', input.workspaceId)
            const name = input.name.trim()
            if (!name) throw badRequest('Give the project a name.')
            if (!KEY.test(input.key)) throw badRequest('The key is 2 to 5 capital letters, such as NEX.')
            // Unique across workspaces: task keys (NEX-101) are looked up by key alone.
            if (data.projects.some((p) => p.key === input.key)) throw badRequest(`Key ${input.key} is already used.`)
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
          })
      },
      async update(id, patch) {
        await delay()
        return write((p) => p.id, (data) => {
            const project = findProject(data, id)
            requireCan(data, 'project.edit', project)
            const next = { ...project, ...pickPatch(patch, PROJECT_FIELDS) } as Project
            checkProjectRefs(data, next)
            // Assigning people and teams is the manager's (and Admin's), not Sales' (spec §4.3).
            const same = (x: string[], y: string[]) => [...x].sort().join() === [...y].sort().join()
            if (next.managerId !== project.managerId || !same(next.memberIds, project.memberIds) || !same(next.teamIds, project.teamIds)) {
              requireCan(data, 'phase.manage', project)
            }
            if (!next.name.trim()) throw badRequest('Give the project a name.')
            checkDates(next.startDate, next.dueDate)
            const changed = JSON.stringify({ ...project, ...next }) !== JSON.stringify(project)
            Object.assign(project, next)
            if (changed) logActivity(data, { projectId: project.id, taskKey: null, kind: 'project.changed', changes: [] }, now().toISOString())
            return project
          })
      },
      async addColumn(projectId, input) {
        await delay()
        return write((p) => p.id, (data) => {
          const project = findProject(data, projectId)
          requireCan(data, 'phase.manage', project)
          const columns = columnsOf(project)
          if (input.after && !columns.some((c) => c.id === input.after)) throw badRequest('That column no longer exists.')
          const added = { id: newId('col'), label: input.label.trim(), category: input.category }
          const at = input.after ? columns.findIndex((c) => c.id === input.after) + 1 : columns.length
          const board = [...columns.slice(0, at), added, ...columns.slice(at)]
          const problem = columnErrors(board)
          if (problem) throw badRequest(problem)
          project.board = board
          logActivity(data, { projectId: project.id, taskKey: null, kind: 'column.added', subject: added.label, changes: [{ field: 'category', from: null, to: added.category }] }, now().toISOString())
          return project
        })
      },
      async deleteColumn(projectId, columnId, moveTo) {
        await delay()
        const { project, moved } = await db.update((data) => {
          const project = findProject(data, projectId)
          requireCan(data, 'phase.manage', project)
          const columns = columnsOf(project)
          if (!columns.some((c) => c.id === columnId) || columnId === moveTo || !columns.some((c) => c.id === moveTo)) throw badRequest('That column no longer exists.')
          const board = columns.filter((c) => c.id !== columnId)
          const problem = columnErrors(board)
          if (problem) throw badRequest(problem)
          // Its tasks (archived ones too) go to the end of the other column, in their order, in this same write.
          const own = data.tickets.filter((t) => t.projectId === project.id)
          let rank = Math.max(0, ...own.filter((t) => t.status === moveTo).map((t) => t.rank))
          const moved = own.filter((t) => t.status === columnId).sort((a, b) => a.rank - b.rank)
          const at = now().toISOString()
          const gone = columns.find((c) => c.id === columnId)!
          const change = statusChange(project, columnId, moveTo)
          for (const t of moved) {
            rank += 1000
            Object.assign(t, { status: moveTo, rank, updatedAt: at })
            logActivity(data, { projectId: project.id, taskKey: t.key, kind: 'task.moved', changes: [change], subject: gone.label }, now().toISOString())
          }
          logActivity(data, { projectId: project.id, taskKey: null, kind: 'column.deleted', subject: gone.label, count: moved.length, changes: [{ ...change, field: 'moveTo' }] }, now().toISOString())
          project.board = board
          return { project: clone(project), moved: clone(moved) }
        })
        for (const ticket of moved) hub.publish({ type: 'ticketUpdated', ticket })
        hub.publish({ type: 'projectChanged', projectId })
        return project
      },
      async setBoard(id, columns) {
        await delay()
        const board = columns.map((c) => ({ id: c.id, label: c.label.trim(), category: c.category }))
        const problem = columnErrors(board)
        if (problem) throw badRequest(problem)
        return write((p) => p.id, (data) => {
            const project = findProject(data, id)
            requireCan(data, 'phase.manage', project)
            // Names, order and types change here; adding and deleting columns have their own calls.
            const current = columnsOf(project).map((c) => c.id).sort()
            if (board.map((c) => c.id).sort().join() !== current.join()) throw badRequest('That column no longer exists.')
            logBoardChanges(data, project.id, columnsOf(project), board, now().toISOString())
            project.board = board
            return project
          })
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
        return write((p) => p.projectId, (data) => {
            const project = findProject(data, input.projectId)
            requireCan(data, 'phase.manage', project)
            if (!input.name.trim()) throw badRequest('Give the phase a name.')
            checkDates(input.startDate, input.dueDate)
            const order = Math.max(0, ...data.phases.filter((p) => p.projectId === project.id).map((p) => p.order)) + 1
            const phase: Phase = { ...input, name: input.name.trim(), id: newId('ph'), order, status: 'notStarted' }
            data.phases.push(phase)
            logActivity(data, { projectId: project.id, taskKey: null, kind: 'phase.added', subject: phase.name, changes: [] }, now().toISOString())
            return phase
          })
      },
      async update(id, patch) {
        await delay()
        return write((p) => p.projectId, (data) => {
            const phase = findPhase(data, id)
            requireCan(data, 'phase.manage', findProject(data, phase.projectId))
            const next = { ...phase, ...pickPatch(patch, PHASE_FIELDS) } as Phase
            if (!next.name.trim()) throw badRequest('Give the phase a name.')
            if (!PHASE_STATUSES.includes(next.status)) throw badRequest("That isn't a phase status.")
            checkDates(next.startDate, next.dueDate)
            Object.assign(phase, next)
            logActivity(data, { projectId: phase.projectId, taskKey: null, kind: 'phase.changed', subject: phase.name, changes: [] }, now().toISOString())
            return phase
          })
      },
      async remove(id) {
        await delay()
        await write((projectId: string) => projectId, (data) => {
          const phase = findPhase(data, id)
          requireCan(data, 'phase.manage', findProject(data, phase.projectId))
          data.phases = data.phases.filter((p) => p.id !== id)
          logActivity(data, { projectId: phase.projectId, taskKey: null, kind: 'phase.removed', subject: phase.name, changes: [] }, now().toISOString())
          for (const t of data.tickets) {
            if (t.phaseId !== id) continue
            t.phaseId = null
            // Each of its tasks loses its phase: say so in that task's history, with the phase's name as it was.
            logActivity(data, { projectId: t.projectId, taskKey: t.key, kind: 'task.changed', changes: [{ field: 'phaseId', from: id, to: null, fromLabel: phase.name }] }, now().toISOString())
          }
          for (const d of data.deliverables) if (d.phaseId === id) d.phaseId = null
          return phase.projectId
        })
      },
      async reorder(projectId, ids) {
        await delay()
        return write((list) => list[0]?.projectId ?? projectId, (data) => {
            const project = findProject(data, projectId)
            requireCan(data, 'phase.manage', project)
            const own = data.phases.filter((p) => p.projectId === projectId)
            if (ids.length !== own.length || new Set(ids).size !== ids.length || !ids.every((id) => own.some((p) => p.id === id)))
              throw badRequest('The phase order must list every phase of the project once.')
            ids.forEach((id, i) => (own.find((p) => p.id === id)!.order = i + 1))
            return own.sort((a, b) => a.order - b.order)
          })
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
        return write((d) => d.projectId, (data) => {
            const project = findProject(data, input.projectId)
            requireCan(data, 'project.edit', project)
            if (!input.title.trim()) throw badRequest('Give the deliverable a title.')
            if (input.phaseId && findPhase(data, input.phaseId).projectId !== project.id) throw badRequest('That phase belongs to another project.')
            const deliverable: Deliverable = { ...input, title: input.title.trim(), id: newId('d'), doneAt: null }
            data.deliverables.push(deliverable)
            logActivity(data, { projectId: project.id, taskKey: null, kind: 'deliverable.added', subject: deliverable.title, changes: [] }, now().toISOString())
            return deliverable
          })
      },
      async update(id, patch) {
        await delay()
        return write((d) => d.projectId, (data) => {
            const deliverable = data.deliverables.find((d) => d.id === id)
            if (!deliverable) throw notFound('Deliverable', id)
            requireCan(data, 'project.edit', findProject(data, deliverable.projectId))
            const next = { ...deliverable, ...pickPatch(patch, DELIVERABLE_FIELDS) } as Deliverable
            if (!next.title.trim()) throw badRequest('Give the deliverable a title.')
            if (next.phaseId && findPhase(data, next.phaseId).projectId !== deliverable.projectId) throw badRequest('That phase belongs to another project.')
            if (!isDate(next.dueDate)) throw badRequest('Pick a due date.')
            if (next.doneAt !== null && !isDate(next.doneAt)) throw badRequest('Pick a done date.')
            Object.assign(deliverable, next)
            logActivity(data, { projectId: deliverable.projectId, taskKey: null, kind: 'deliverable.changed', subject: deliverable.title, changes: [] }, now().toISOString())
            return deliverable
          })
      },
    },
  }
}
