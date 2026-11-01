import type { Project, TaskView, User } from '@/api/types'
import type { KnownIds } from '@/lib/mentions'

const keys = new Intl.Collator('en', { numeric: true })

/**
 * What the `@` popup offers (live tasks, by key) and which mentions render as chips: archived tasks too, so an
 * `@NEX-101` written before it was archived still opens it.
 */
export function directoryOf(input: { users: User[]; projects: Pick<Project, 'key'>[]; tasks: TaskView[]; archivedKeys: string[] }): { tasks: TaskView[]; known: KnownIds } {
  const tasks = [...input.tasks].sort((a, b) => keys.compare(a.key, b.key))
  return {
    tasks,
    known: {
      userIds: new Set(input.users.map((u) => u.id)),
      taskKeys: new Set([...tasks.map((t) => t.key), ...input.archivedKeys]),
      projectKeys: new Set(input.projects.map((p) => p.key)),
      nameOf: (id: string) => input.users.find((u) => u.id === id)?.name ?? id,
    },
  }
}
