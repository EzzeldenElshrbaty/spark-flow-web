import { useParams } from 'react-router'
import { useChannels } from '@/api/chat'
import { useActivity, useMarkActivityRead } from '@/api/inbox'
import type { ActivityItem } from '@/api/types'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { useShownError } from '@/lib/useShownError'
import { ActivityView } from '@/pages/chat/ActivityView'

/** Activity (spec 6.12) for the workspace on screen, in the main pane (full screen on phones). */
export function ActivityPage() {
  const { ws = '' } = useParams()
  const { workspace } = useCurrentWorkspace()
  const activity = useActivity(workspace?.id)
  // Lasts through Try again and the polling refetches, so the error doesn't flip back to the skeleton.
  const error = useShownError(activity)
  const channels = useChannels(workspace?.id).data ?? []
  const markRead = useMarkActivityRead()
  const markAll = useMarkActivityRead()

  const placeOf = (item: ActivityItem) => {
    const channel = channels.find((c) => c.id === item.channelId)
    if (!channel) return null
    return channel.kind === 'channel' ? `#${channel.name}` : 'a direct message'
  }

  return (
    <div className="sf flex min-h-0 flex-1 flex-col">
      <ActivityView
        items={activity.data}
        ws={ws}
        placeOf={placeOf}
        error={Boolean(error)}
        retrying={activity.isFetching}
        onRetry={() => void activity.refetch()}
        onOpen={(item) => {
          if (!item.read && workspace) markRead.mutate({ workspaceId: workspace.id, ids: [item.id] })
        }}
        onMarkAllRead={(ids) => workspace && markAll.mutate({ workspaceId: workspace.id, ids })}
        marking={markAll.isPending}
        markError={markAll.isError ? 'Couldn’t mark them read. Try again.' : null}
      />
    </div>
  )
}
