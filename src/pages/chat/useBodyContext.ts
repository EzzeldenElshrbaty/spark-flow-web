import { useMemo } from 'react'
import { useProjectSummaries } from '@/api/projects'
import { useTaskRefs } from '@/api/tickets'
import type { User } from '@/api/types'
import type { Body } from '@/lib/messageBody'
import { taskKeysOf, type BodyContext } from '@/pages/chat/MessageBody'

/** Where messages are shown: who's who, which projects I can see, and the workspace links and DMs go to. */
export type BodyScope = { users: User[]; projectKeys: Set<string>; ws: string; workspaceId: string }

/** The keys of the projects I can see in a workspace: task keys from any other project stay text. */
export function useProjectKeys(workspaceId: string | undefined): Set<string> {
  const projects = useProjectSummaries(workspaceId)
  return useMemo(() => new Set((projects.data ?? []).map((p) => p.key)), [projects.data])
}

/** What these bodies need to render: the scope, plus every task they name, looked up in one go (live). */
export function useBodyContext(bodies: Body[], scope: BodyScope): BodyContext {
  const keys = useMemo(() => bodies.flatMap(taskKeysOf), [bodies])
  const refs = useTaskRefs(keys)
  return useMemo(() => {
    const tasks = new Map((refs.data ?? []).filter((t) => scope.projectKeys.has(t.projectKey)).map((t) => [t.key, t]))
    return { ...scope, tasks }
  }, [refs.data, scope])
}
