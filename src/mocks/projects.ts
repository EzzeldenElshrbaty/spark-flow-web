import type { Api, BoardColumn, Deliverable, DeliverablePatch, Phase, PhasePatch, PhaseStatus, Project, ProjectPatch, ProjectStatus } from '@/api/types'
import type { DbData, MockDb } from './db'
import { columnErrors, columnsOf } from '@/lib/boardColumns'
import { summarize } from './derive'
import { delay } from './latency'
import type { MockHub } from './realtime'
import { logActivity, statusChange } from './activity'
import { entryEnd } from '@/lib/hours'
import { badRequest, clone, currentUser, isDate, newId, notFound, pickPatch, requireCan, text } from './shared'
import { CHANNEL_NAME } from '@/lib/channelForm'
import { projectPeopleIds } from '@/lib/projectPeople'

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

/** A project a write may change: an archived one is read-only until an Admin restores it. */
export function requireOpenProject(project: Project): Project {
  if (project.archivedAt) throw badRequest('This project is archived. Restore it first.')
  return project
}

/** findProject for a write: the project, unless it's archived (400). */
export const openProject = (data: DbData, id: string): Project => requireOpenProject(findProject(data, id))

function findPhase(data: DbData, id: string): Phase {
  const phase = data.phases.find((p) => p.id === id)
  if (!phase) throw notFound('Phase', id)
  return phase
}

/** A phase lies within its project's dates. */
function checkPhaseInProject(project: Project, startDate: string, dueDate: string) {
  if (new Date(startDate).getTime() < new Date(project.startDate).getTime()) throw badRequest("A phase can't start before the project.")
  if (new Date(dueDate).getTime() > new Date(project.dueDate).getTime()) throw badRequest("A phase can't end after the project's due date.")
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

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Links are a label and an address each. */
function checkLinks(links: unknown) {
  if (!Array.isArray(links) || !links.every((l) => typeof l?.label === 'string' && typeof l?.url === 'string')) throw badRequest('Each link needs a label and an address.')
}

/** A phase of the project, by id: gone is a 400, another project's too. */
function phaseOf(data: DbData, phaseId: string, projectId: string) {
  const phase = data.phases.find((p) => p.id === phaseId)
  if (!phase) throw badRequest('That phase no longer exists.')
  if (phase.projectId !== projectId) throw badRequest('That phase belongs to another project.')
  return phase
}

const NAME_MAX = 40 // CHANNEL_NAME allows 40 characters

/** `text` cut to `max` characters, without a hyphen left at the end. */
const cut = (text: string, max: number) => text.slice(0, max).replace(/-+$/, '')

/**
 * A project channel's name: the project name's slug, or `slug-2`, `slug-3`… when another channel in the workspace has
 * it. Always a valid channel name (CHANNEL_NAME).
 */
export function channelNameFor(data: DbData, workspaceId: string, projectName: string, exceptChannelId?: string, key = 'project'): string {
  // A name with no Latin letters or digits (Arabic, say) takes the project's key: #arb.
  const base = cut(slug(projectName) || key.toLowerCase(), NAME_MAX)
  const taken = (name: string) => data.channels.some((c) => c.workspaceId === workspaceId && c.id !== exceptChannelId && c.name === name)
  let name = base
  for (let n = 2; taken(name); n++) name = `${cut(base, NAME_MAX - String(n).length - 1)}-${n}`
  if (!CHANNEL_NAME.test(name)) throw new Error(`Bad channel name ${name}`)
  return name
}

/**
 * Keeps a project's channel in step with it: its members are the project's people, and when the project is named or
 * renamed (`rename`), its name follows. An edit that keeps the name keeps the channel's name, so a channel named
 * before this rule (#el-moasser) isn't renamed by changing a date.
 */
export function syncProjectChannel(data: DbData, project: Project, rename: boolean): boolean {
  const channel = data.channels.find((c) => c.id === project.channelId)
  if (!channel) return false
  const name = rename ? channelNameFor(data, project.workspaceId, project.name, channel.id, project.key) : channel.name
  const memberIds = [...projectPeopleIds(project, data.users)]
  const changed = channel.name !== name || [...channel.memberIds].sort().join() !== [...memberIds].sort().join()
  Object.assign(channel, { name, memberIds })
  return changed
}

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

export function projectsApi(db: MockDb, hub: MockHub, now: () => Date): Pick<Api, 'projects' | 'phases' | 'deliverables'> {
  /** One write about a project, then tells every tab that project changed (board, phases, deliverables, details). */
  const write = async <T>(projectIdOf: (result: T) => string, fn: (data: DbData) => T): Promise<T> => {
    const result = await db.update(fn)
    hub.publish({ type: 'projectChanged', projectId: projectIdOf(result) })
    return clone(result)
  }
  /** The workspace's projects; archived ones only with `archived` (and then only they). `all` keeps both, for get. */
  const summaries = async (workspaceId: string, opts?: { archived?: boolean; all?: boolean }) => {
    await delay()
    const data = await db.read()
    if (!data.workspaces.some((w) => w.id === workspaceId)) throw notFound('Workspace', workspaceId)
    const viewer = currentUser(data)
    return data.projects
      .filter((p) => p.workspaceId === workspaceId && (opts?.all || Boolean(p.archivedAt) === Boolean(opts?.archived)))
      .map((p) => summarize(p, data, now(), { userId: viewer.id, role: viewer.role }))
  }
  /** Archives or restores a project with its channel, in one write; archiving stops the timers on its tasks. */
  const setArchived = async (id: string, archive: boolean) => {
    await delay()
    const { project, stopped } = await db.update((data) => {
      requireCan(data, 'project.archive')
      const project = findProject(data, id)
      const at = now()
      const stopped: string[] = []
      if (archive) {
        for (const e of data.timeEntries.filter((e) => e.projectId === id && e.endedAt === null)) {
          e.endedAt = new Date(entryEnd(e, at)).toISOString()
          stopped.push(e.userId)
        }
      }
      project.archivedAt = archive ? at.toISOString() : null
      const channel = data.channels.find((c) => c.id === project.channelId)
      if (channel) channel.archivedAt = project.archivedAt
      logActivity(data, { projectId: id, taskKey: null, kind: archive ? 'project.archived' : 'project.restored', changes: [] }, at.toISOString())
      return { project: clone(project), stopped }
    })
    hub.publish({ type: 'projectChanged', projectId: id })
    hub.publish({ type: 'channelChanged', channelId: project.channelId })
    for (const userId of stopped) hub.publish({ type: 'timeLogged', userId, projectId: id })
    return project
  }

  return {
    projects: {
      list: (workspaceId, opts) => summaries(workspaceId, opts),
      archive: (id) => setArchived(id, true),
      restore: (id) => setArchived(id, false),
      // An archived project still opens by its address.
      async get(workspaceId, key) {
        const project = (await summaries(workspaceId, { all: true })).find((p) => p.key === key)
        if (!project) throw notFound('Project', key)
        return project
      },
      async create(input) {
        await delay()
        return write((p) => p.id, (data) => {
            requireCan(data, 'project.create')
            if (!data.workspaces.some((w) => w.id === input.workspaceId)) throw notFound('Workspace', input.workspaceId)
            const name = text(input.name, 'Name')
            checkLinks(input.links)
            if (!name) throw badRequest('Give the project a name.')
            if (!KEY.test(input.key)) throw badRequest('The key is 2 to 5 capital letters, such as NEX.')
            // Unique across workspaces: task keys (NEX-101) are looked up by key alone.
            if (data.projects.some((p) => p.key === input.key)) throw badRequest(`Key ${input.key} is already used.`)
            if (!data.users.some((u) => u.id === input.managerId)) throw badRequest('Pick a project manager.')
            checkDates(input.startDate, input.dueDate)

            const id = freeId(`p-${input.key.toLowerCase()}`, data.projects, 'p')
            const channelId = freeId(`c-p-${input.key.toLowerCase()}`, data.channels, 'c')
            const project: Project = { ...input, id, name, status: 'planned', channelId, logoFileId: null }
            data.projects.push(project)
            data.channels.push({
              id: channelId,
              workspaceId: input.workspaceId,
              kind: 'channel',
              name: '',
              topic: `${name} project chat.`,
              memberIds: [],
              isPrivate: false,
              lastMessageAt: null,
            })
            // Its name and people, worked out the same way every later edit keeps them.
            syncProjectChannel(data, project, true)
            data.phases.push(...splitPhases(id, input.methodology === 'waterfall' ? WATERFALL : ['Build'], input.startDate, input.dueDate))
            data.counters[id] = 101
            return project
          })
      },
      async update(id, patch) {
        await delay()
        let channelChanged = false
        const saved = await write<Project>((p) => p.id, (data) => {
            const project = openProject(data, id)
            requireCan(data, 'project.edit', project)
            const next = { ...project, ...pickPatch(patch, PROJECT_FIELDS) } as Project
            checkProjectRefs(data, next)
            // Assigning people and teams is the manager's (and Admin's), not Sales' (spec §4.3).
            const same = (x: string[], y: string[]) => [...x].sort().join() === [...y].sort().join()
            if (next.managerId !== project.managerId || !same(next.memberIds, project.memberIds) || !same(next.teamIds, project.teamIds)) {
              requireCan(data, 'phase.manage', project)
            }
            if (!text(next.name, 'Name')) throw badRequest('Give the project a name.')
            text(next.clientName, 'Client')
            text(next.description, 'About')
            checkLinks(next.links)
            checkDates(next.startDate, next.dueDate)
            const changed = JSON.stringify({ ...project, ...next }) !== JSON.stringify(project)
            const renamed = next.name !== project.name
            Object.assign(project, next)
            channelChanged = syncProjectChannel(data, project, renamed)
            if (changed) logActivity(data, { projectId: project.id, taskKey: null, kind: 'project.changed', changes: [] }, now().toISOString())
            return project
          })
        if (channelChanged) hub.publish({ type: 'channelChanged', channelId: saved.channelId })
        return saved
      },
      async addColumn(projectId, input) {
        await delay()
        return write((p) => p.id, (data) => {
          const project = openProject(data, projectId)
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
          const project = openProject(data, projectId)
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
            const project = openProject(data, id)
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
            const project = openProject(data, input.projectId)
            requireCan(data, 'phase.manage', project)
            if (!text(input.name, 'Name')) throw badRequest('Give the phase a name.')
            checkDates(input.startDate, input.dueDate)
            checkPhaseInProject(project, input.startDate, input.dueDate)
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
            requireCan(data, 'phase.manage', openProject(data, phase.projectId))
            const next = { ...phase, ...pickPatch(patch, PHASE_FIELDS) } as Phase
            if (!text(next.name, 'Name')) throw badRequest('Give the phase a name.')
            if (!PHASE_STATUSES.includes(next.status)) throw badRequest("That isn't a phase status.")
            checkDates(next.startDate, next.dueDate)
            checkPhaseInProject(findProject(data, phase.projectId), next.startDate, next.dueDate)
            Object.assign(phase, next)
            logActivity(data, { projectId: phase.projectId, taskKey: null, kind: 'phase.changed', subject: phase.name, changes: [] }, now().toISOString())
            return phase
          })
      },
      async remove(id) {
        await delay()
        await write((projectId: string) => projectId, (data) => {
          const phase = findPhase(data, id)
          requireCan(data, 'phase.manage', openProject(data, phase.projectId))
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
            const project = openProject(data, projectId)
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
            const project = openProject(data, input.projectId)
            requireCan(data, 'project.edit', project)
            if (!text(input.title, 'Title')) throw badRequest('Give the deliverable a title.')
            if (!isDate(input.dueDate)) throw badRequest('Pick a due date.')
            if (input.phaseId) phaseOf(data, input.phaseId, project.id)
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
            requireCan(data, 'project.edit', openProject(data, deliverable.projectId))
            const next = { ...deliverable, ...pickPatch(patch, DELIVERABLE_FIELDS) } as Deliverable
            if (!text(next.title, 'Title')) throw badRequest('Give the deliverable a title.')
            if (next.phaseId) phaseOf(data, next.phaseId, deliverable.projectId)
            if (!isDate(next.dueDate)) throw badRequest('Pick a due date.')
            if (next.doneAt !== null && !isDate(next.doneAt)) throw badRequest('Pick a done date.')
            Object.assign(deliverable, next)
            logActivity(data, { projectId: deliverable.projectId, taskKey: null, kind: 'deliverable.changed', subject: deliverable.title, changes: [] }, now().toISOString())
            return deliverable
          })
      },
      async remove(id) {
        await delay()
        await write((projectId: string) => projectId, (data) => {
          const deliverable = data.deliverables.find((d) => d.id === id)
          if (!deliverable) throw notFound('Deliverable', id)
          requireCan(data, 'project.edit', openProject(data, deliverable.projectId))
          data.deliverables = data.deliverables.filter((d) => d.id !== id)
          logActivity(data, { projectId: deliverable.projectId, taskKey: null, kind: 'deliverable.removed', subject: deliverable.title, changes: [] }, now().toISOString())
          return deliverable.projectId
        })
      },
    },
  }
}
