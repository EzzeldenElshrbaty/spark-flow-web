import { useMemo } from 'react'
import { useChannels } from '@/api/chat'
import { useMentionDirectory } from '@/lib/useMentionDirectory'
import type { ComposerDirectory } from '@/pages/chat/composer/AutocompletePlugin'

/** What a composer can name in a workspace: its people, projects, tasks and open channels; `memberIds` marks who's here. */
export function useComposerDirectory(workspaceId: string, memberIds?: string[]): ComposerDirectory {
  const { users, projects, tasks } = useMentionDirectory()
  const channels = useChannels(workspaceId)
  return useMemo(
    () => ({
      users,
      projects,
      tasks,
      channels: (channels.data ?? []).filter((c) => c.kind === 'channel' && c.name && !c.archivedAt).map((c) => ({ id: c.id, name: c.name! })),
      memberIds,
    }),
    [users, projects, tasks, channels.data, memberIds],
  )
}
