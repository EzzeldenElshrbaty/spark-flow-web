import { useMemo } from 'react'
import { useProjectSummaries } from '@/api/projects'
import { useArchivedKeysOf, useTasksOf } from '@/api/tickets'
import { useUsers } from '@/api/users'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { directoryOf } from '@/lib/mentionDirectory'
import { isActive } from '@/lib/people'

/** The workspace's people, projects and tasks: what the `@` popup offers and which mentions render as chips. */
export function useMentionDirectory() {
  const { workspace } = useCurrentWorkspace()
  const everyone = useUsers(workspace?.id).data
  // The popup offers active people only (slice 3); a mention of someone deactivated since still renders as their chip.
  const users = useMemo(() => (everyone ?? []).filter(isActive), [everyone])
  const projects = useProjectSummaries(workspace?.id).data ?? []
  const ids = projects.map((p) => p.id)
  const all = useTasksOf(ids).data
  const archivedKeys = useArchivedKeysOf(ids)
  const { tasks, known } = useMemo(() => directoryOf({ users: everyone ?? [], projects, tasks: all, archivedKeys }), [everyone, projects, all, archivedKeys])
  return { ws: workspace?.slug ?? '', users, projects, tasks, known }
}
