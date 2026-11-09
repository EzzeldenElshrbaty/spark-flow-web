import type { TaskView } from '@/api/types'
import { myOpenTasks } from '@/pages/projects/taskFilters'

/** Something a timer can run on: a task, or a project with no task. */
export type TimerTarget = { kind: 'task' | 'project'; id: string; projectId: string; label: string; detail: string }
export type TargetGroup = { label: string; targets: TimerTarget[] }

const MINE = 8
const RECENT = 5
const MATCHES = 20
const keys = new Intl.Collator('en', { numeric: true })

/**
 * Start timer's list (UX Phase 4, 4.3), on the projects I may log on only: with no words, My tasks (needing attention
 * first) then Recent (`task:<id>` / `project:<id>`, newest first, skipping what's done, gone or already listed); with
 * words, the open tasks whose key, title or project match, mine first. Empty groups are left out.
 */
export function timerTargets({ meId, tasks, projects, recent, q }: { meId: string; tasks: TaskView[]; projects: { id: string; name: string }[]; recent: string[]; q: string }): TargetGroup[] {
  const nameOf = new Map(projects.map((p) => [p.id, p.name]))
  const open = tasks.filter((t) => t.category !== 'done' && nameOf.has(t.projectId))
  const ofTask = (t: TaskView): TimerTarget => ({ kind: 'task', id: t.id, projectId: t.projectId, label: `${t.key} · ${t.title}`, detail: nameOf.get(t.projectId)! })
  const words = q.trim().toLowerCase()
  if (words) {
    const matches = open
      .filter((t) => [t.key, t.title, nameOf.get(t.projectId)!].some((text) => text.toLowerCase().includes(words)))
      .sort((a, b) => Number(b.assigneeId === meId) - Number(a.assigneeId === meId) || keys.compare(a.key, b.key))
      .slice(0, MATCHES)
    return matches.length ? [{ label: 'Matches', targets: matches.map(ofTask) }] : []
  }
  const mine = myOpenTasks(open, meId).slice(0, MINE)
  const listed = new Set(mine.map((t) => t.id))
  const again = recent
    .flatMap((entry): TimerTarget[] => {
      const [kind, id] = entry.split(':') as [string, string]
      if (kind === 'project') return nameOf.has(id) ? [{ kind: 'project', id, projectId: id, label: nameOf.get(id)!, detail: 'The project only' }] : []
      const t = open.find((x) => x.id === id)
      return t && !listed.has(t.id) ? [ofTask(t)] : []
    })
    .slice(0, RECENT)
  return [
    { label: 'My tasks', targets: mine.map(ofTask) },
    { label: 'Recent', targets: again },
  ].filter((g) => g.targets.length > 0)
}
