import type { Api, ChatMessage, Project, Sprint, SprintPatch, Ticket } from '@/api/types'
import { ApiError } from '@/lib/apiError'
import { categoryOf } from '@/lib/boardColumns'
import { formatDayMonth } from '@/lib/format'
import { can } from '@/lib/permissions'
import { defaultSprintDates, nextSprintName, sortSprints, sprintErrors, type SprintForm } from '@/lib/sprints'
import { logActivity } from './activity'
import { audit, changesBetween, recordOf } from './audit'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import { findProject, openProject } from './projects'
import type { MockHub } from './realtime'
import { grantsFor } from './roles'
import { badRequest, clone, currentUser, newId, notFound, pickPatch, stamp, text } from './shared'
import { postSprintEvent } from './taskEvents'

// An agile project's sprints (sprints spec §4–§5): create, edit, start, complete and delete, each one write.

/** The fields a sprint's edit may carry; its state changes only through start and complete. */
const SPRINT_FIELDS = ['name', 'goal', 'startDate', 'endDate'] as const satisfies readonly (keyof SprintPatch)[]

const tasks = (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'}`

function findSprint(data: DbData, id: string): Sprint {
  const sprint = data.sprints.find((s) => s.id === id)
  if (!sprint) throw notFound('Sprint', id)
  return sprint
}

/** The project a sprint write is about: open (not archived), mine to change (an Admin or its manager), and agile. */
function sprintProject(data: DbData, projectId: string): Project {
  const project = openProject(data, projectId)
  const me = currentUser(data)
  if (!can('task.manage', { userId: me.id, grants: grantsFor(data, me), project, userTeamIds: me.teamIds }))
    throw new ApiError({ title: 'Forbidden', status: 403, detail: 'Only an Admin or the project’s manager can change sprints.' })
  if (project.methodology !== 'agile') throw badRequest('Sprints are for agile projects.')
  return project
}

/** The sheet's values, trimmed and checked by the sheets' own rules; the first problem is the 400's sentence. */
function checkForm(v: SprintForm): SprintForm {
  const form = { name: text(v.name, 'Name'), goal: text(v.goal, 'Goal'), startDate: v.startDate, endDate: v.endDate }
  const errors = sprintErrors(form)
  const problem = errors.name ?? errors.goal ?? errors.endDate
  if (problem) throw badRequest(problem)
  return { ...form, startDate: new Date(form.startDate).toISOString(), endDate: new Date(form.endDate).toISOString() }
}

/** A sprint's tasks that count: an archived one doesn't (not toward empty, the totals, or what isn't done). */
const countedIn = (data: DbData, sprintId: string) => data.tickets.filter((t) => t.sprintId === sprintId && !t.archivedAt)

/** A new planned sprint for the project, with the defaults for what isn't given; the caller checks and logs it. */
function plannedSprint(data: DbData, projectId: string, given: Partial<SprintForm>, at: Date): Sprint {
  const own = data.sprints.filter((s) => s.projectId === projectId)
  const form = checkForm({ name: nextSprintName(own.map((s) => s.name)), goal: '', ...defaultSprintDates(own, at), ...given })
  const sprint: Sprint = { id: newId('s'), projectId, ...form, state: 'planned' }
  data.sprints.push(sprint)
  return sprint
}

/**
 * Moves tasks out of `from` into `to` (null: the backlog). Each says so in its own history, with both sprints' names
 * as they are now, as a task's sprint change from the sheet does.
 */
function moveTasks(data: DbData, moving: Ticket[], from: Sprint, to: Sprint | null, at: string): Ticket[] {
  for (const t of moving) {
    t.sprintId = to?.id ?? null
    t.updatedAt = stamp(t.updatedAt)
    const change = { field: 'sprintId', from: from.id, to: to?.id ?? null, fromLabel: from.name, ...(to ? { toLabel: to.name } : {}) }
    logActivity(data, { projectId: t.projectId, taskKey: t.key, kind: 'task.changed', changes: [change] }, at)
  }
  return moving
}

/** What a write returns, and what every tab hears after it: the project, each task it moved, and its chat card. */
type Outcome<T> = { result: T; projectId: string; moved?: Ticket[]; card?: ChatMessage }

export function sprintsApi(db: MockDb, hub: MockHub, now: () => Date): Api['sprints'] {
  const write = async <T>(fn: (data: DbData) => Outcome<T>): Promise<T> => {
    const { result, projectId, moved, card } = await db.update((data) => clone(fn(data)))
    hub.publish({ type: 'projectChanged', projectId })
    for (const ticket of moved ?? []) hub.publish({ type: 'ticketUpdated', ticket })
    if (card) hub.publish({ type: 'messageReceived', message: card })
    return result
  }

  return {
    async list(projectId) {
      await delay()
      const data = await db.read()
      findProject(data, projectId)
      return sortSprints(data.sprints.filter((s) => s.projectId === projectId))
    },

    async create({ projectId, ...fields }) {
      await delay()
      return write((data) => {
        const project = sprintProject(data, projectId)
        const sprint = plannedSprint(data, project.id, pickPatch(fields, SPRINT_FIELDS) as Partial<SprintForm>, now())
        audit(data, { action: 'created', group: 'data', record: recordOf.sprint(sprint, project), changes: changesBetween(data, {}, sprint, SPRINT_FIELDS) })
        logActivity(data, { projectId: project.id, taskKey: null, kind: 'sprint.added', subject: sprint.name, changes: [] }, now().toISOString())
        return { result: sprint, projectId: project.id }
      })
    },

    async update(id, patch) {
      await delay()
      return write((data) => {
        const sprint = findSprint(data, id)
        const project = sprintProject(data, sprint.projectId)
        const edit = pickPatch(patch, SPRINT_FIELDS)
        if (sprint.state === 'closed') throw badRequest('A closed sprint can’t be changed.')
        const next: Sprint = { ...sprint, ...checkForm({ ...sprint, ...edit } as SprintForm) }
        const edits = changesBetween(data, sprint, next, SPRINT_FIELDS)
        if (edits.length) audit(data, { action: 'changed', group: 'data', record: recordOf.sprint(next, project), changes: edits })
        Object.assign(sprint, next)
        logActivity(data, { projectId: project.id, taskKey: null, kind: 'sprint.changed', subject: sprint.name, changes: [] }, now().toISOString())
        return { result: sprint, projectId: project.id }
      })
    },

    async start(id, input) {
      await delay()
      return write((data) => {
        const sprint = findSprint(data, id)
        const project = sprintProject(data, sprint.projectId)
        if (sprint.state !== 'planned') throw badRequest('Only a planned sprint can be started.')
        const running = data.sprints.find((s) => s.projectId === project.id && s.state === 'active')
        if (running) throw new ApiError({ title: 'Conflict', status: 409, detail: `${running.name} is still running. Complete it before you start another.` })
        const own = countedIn(data, sprint.id)
        if (own.length === 0) throw badRequest(`Add a task to ${sprint.name} before you start it.`)
        const form = checkForm({ name: input.name, goal: input.goal, startDate: input.startDate, endDate: input.endDate })
        Object.assign(sprint, form)
        sprint.state = 'active'
        const points = own.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0)
        const { name, goal, endDate } = sprint
        const card = postSprintEvent(data, project, { kind: 'started', projectKey: project.key, sprintId: sprint.id, name, goal, endDate, tasks: own.length, points }, goal ? `Started ${name}: ${goal}` : `Started ${name}`)
        audit(data, { action: 'changed', group: 'status', record: recordOf.sprint(sprint, project), detail: `Started · ends ${formatDayMonth(endDate)}` })
        logActivity(data, { projectId: project.id, taskKey: null, kind: 'sprint.started', subject: name, changes: [] }, now().toISOString())
        return { result: sprint, projectId: project.id, card }
      })
    },

    async complete(id, { moveTo }) {
      await delay()
      return write((data) => {
        const sprint = findSprint(data, id)
        const project = sprintProject(data, sprint.projectId)
        if (sprint.state !== 'active') throw badRequest('Only the running sprint can be completed.')
        let next: Sprint | null = null
        if (moveTo === 'new') {
          // Named and dated after every sprint of the project, the closing one included (from today once that's past).
          next = plannedSprint(data, project.id, {}, now())
          audit(data, { action: 'created', group: 'data', record: recordOf.sprint(next, project), changes: changesBetween(data, {}, next, SPRINT_FIELDS) })
          logActivity(data, { projectId: project.id, taskKey: null, kind: 'sprint.added', subject: next.name, changes: [] }, now().toISOString())
        } else if (moveTo !== null) {
          next = data.sprints.find((s) => s.id === moveTo && s.projectId === project.id && s.state === 'planned') ?? null
          if (!next) throw badRequest('Move the tasks to a planned sprint of this project.')
        }
        // Done tasks stay with the closed sprint, and so do archived ones.
        const counted = countedIn(data, sprint.id)
        const unfinished = counted.filter((t) => categoryOf(project, t.status) !== 'done')
        const done = counted.length - unfinished.length
        const at = now().toISOString()
        sprint.state = 'closed'
        const moved = moveTasks(data, unfinished, sprint, next, at)
        const movedTo = next?.name ?? null
        const card = postSprintEvent(
          data,
          project,
          { kind: 'completed', projectKey: project.key, sprintId: sprint.id, name: sprint.name, done, total: counted.length, movedTo, moved: moved.length },
          `Completed ${sprint.name}: ${done} of ${tasks(counted.length)} done`,
        )
        const where = moved.length ? `${moved.length} moved to ${movedTo ?? 'the backlog'}` : null
        audit(data, { action: 'changed', group: 'status', record: recordOf.sprint(sprint, project), detail: ['Completed', `${done} of ${tasks(counted.length)} done`, where].filter(Boolean).join(' · ') })
        logActivity(data, { projectId: project.id, taskKey: null, kind: 'sprint.completed', subject: sprint.name, count: moved.length, changes: [] }, at)
        return { result: { sprint, moved: moved.length, next }, projectId: project.id, moved, card }
      })
    },

    async remove(id) {
      await delay()
      await write((data) => {
        const sprint = findSprint(data, id)
        const project = sprintProject(data, sprint.projectId)
        if (sprint.state !== 'planned') throw badRequest('Only a planned sprint can be deleted.')
        const own = data.tickets.filter((t) => t.sprintId === sprint.id)
        audit(data, { action: 'deleted', group: 'data', record: recordOf.sprint(sprint, project), detail: own.length ? `${tasks(own.length)} to the backlog` : null })
        data.sprints = data.sprints.filter((s) => s.id !== sprint.id)
        const at = now().toISOString()
        logActivity(data, { projectId: project.id, taskKey: null, kind: 'sprint.removed', subject: sprint.name, count: own.length, changes: [] }, at)
        const moved = moveTasks(data, own, sprint, null, at)
        return { result: undefined, projectId: project.id, moved }
      })
    },
  }
}
