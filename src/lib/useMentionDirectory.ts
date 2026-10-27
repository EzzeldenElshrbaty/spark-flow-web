import { useMemo } from 'react'
import { useProjectSummaries } from '@/api/projects'
import { useArchivedKeysOf, useTasksOf } from '@/api/tickets'
import { useUsers } from '@/api/users'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { directoryOf } from '@/lib/mentionDirectory'

/** The workspace's people, projects and tasks: what the `@` popup offers and which mentions render as chips. */
export function useMentionDirectory() {
  const { workspace } = useCurrentWorkspace()
  const users = useUsers(workspace?.id).data ?? []
  const projects = useProjectSummaries(workspace?.id).data ?? []
  const ids = projects.map((p) => p.id)
  const all = useTasksOf(ids).data
  const archivedKeys = useArchivedKeysOf(ids)
  const { tasks, known } = useMemo(() => directoryOf({ users, projects, tasks: all, archivedKeys }), [users, projects, all, archivedKeys])
  return { ws: workspace?.slug ?? '', users, projects, tasks, known }
}
