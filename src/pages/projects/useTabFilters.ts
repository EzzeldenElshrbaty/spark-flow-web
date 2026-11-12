import { useSearchParams } from 'react-router'
import type { ProjectSummary, Sprint } from '@/api/types'
import { useUiStore } from '@/lib/uiStore'
import { filtersFrom } from './taskFilters'

/**
 * The Tasks tab's phase and sprint (sprints spec §6.3, `filtersFrom`): one rule for the tab, and for the project page's
 * New task, which starts a task in the sprint the Board and List show. The sprint by default is the running one,
 * worked out on every render and never written into the address or remembered, so the tab follows the running sprint
 * when it changes. `phase` is as asked (the tab checks it against its phases); `last` is what's remembered here.
 */
export function useTabFilters(project: Pick<ProjectSummary, 'key' | 'methodology'> | undefined, sprints: Sprint[] | undefined) {
  const [params] = useSearchParams()
  const last = useUiStore((state) => (project ? state.lastFilters[project.key] : undefined))
  return { ...filtersFrom(params, last, project?.methodology === 'agile' ? (sprints ?? []) : []), last }
}
