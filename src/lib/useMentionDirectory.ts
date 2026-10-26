import { useMemo } from 'react'
import { useProjectSummaries } from '@/api/projects'
import { useTasksOf } from '@/api/tickets'
import { useUsers } from '@/api/users'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import type { KnownIds } from '@/lib/mentions'

const keys = new Intl.Collator('en', { numeric: true })

/** The workspace's people, projects and tasks: what the `@` popup offers and which mentions render as chips. */
export function useMentionDirectory() {
  const { workspace } = useCurrentWorkspace()
  const users = useUsers(workspace?.id).data ?? []
  const projects = useProjectSummaries(workspace?.id).data ?? []
  const all = useTasksOf(projects.map((p) => p.id)).data
  // By key, NEX-101 before NEX-110, so the popup reads in order.
  const tasks = useMemo(() => [...all].sort((a, b) => keys.compare(a.key, b.key)), [all])
  const known: KnownIds = useMemo(
    () => ({
      userIds: new Set(users.map((u) => u.id)),
      taskKeys: new Set(tasks.map((t) => t.key)),
      projectKeys: new Set(projects.map((p) => p.key)),
      nameOf: (id: string) => users.find((u) => u.id === id)?.name ?? id,
    }),
    [users, tasks, projects],
  )
  return { ws: workspace?.slug ?? '', users, projects, tasks, known }
}
