import { useSearchParams } from 'react-router'
import type { ProjectSummary, Sprint } from '@/api/types'
import { useUiStore } from '@/lib/uiStore'
import { filtersFrom, validSprint } from './taskFilters'

/**
 * The Tasks tab's phase and sprint (sprints spec §6.3): one rule for the tab, and for the project page's New task, which
 * starts a task in the sprint the Board and List show. Each comes from the address, else from the last one picked on
 * this project; with neither, an agile project's sprint is its running one (`sprintByDefault`: worked out on every
 * render, never written into the address or remembered, so the tab follows the running sprint when it changes).
 * `sprint` is one of `sprints` or null (All sprints); `phase` is as asked (the tab checks it against its phases);
 * `last` is what's remembered and `running` the active sprint's id.
 */
export function useTabFilters(project: Pick<ProjectSummary, 'key' | 'methodology'> | undefined, sprints: Sprint[] | undefined) {
  const [params] = useSearchParams()
  const last = useUiStore((state) => (project ? state.lastFilters[project.key] : undefined))
  const agile = project?.methodology === 'agile'
  const running = (agile && sprints?.find((s) => s.state === 'active')?.id) || null
  const picked = filtersFrom(params, last, running)
  return {
    phase: picked.phase,
    sprint: agile ? validSprint(picked.sprint, sprints ?? []) : null,
    sprintByDefault: !params.has('sprint') && last?.sprint === undefined,
    last,
    running,
  }
}
