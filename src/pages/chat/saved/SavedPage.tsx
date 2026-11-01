import { useParams } from 'react-router'
import { useChannels } from '@/api/chat'
import { useRemoveSaved, useSaved, useUpdateSaved } from '@/api/saved'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { useShownError } from '@/lib/useShownError'
import { SavedView } from '@/pages/chat/saved/SavedView'

/** Saved (spec 6.12) for the workspace on screen, in the main pane (full screen on phones). */
export function SavedPage() {
  const { ws = '' } = useParams()
  const { workspace } = useCurrentWorkspace()
  const saved = useSaved(workspace?.id)
  const error = useShownError(saved)
  const channels = useChannels(workspace?.id).data ?? []
  const update = useUpdateSaved()
  const remove = useRemoveSaved()

  const placeOf = (channelId: string | null) => {
    const channel = channels.find((c) => c.id === channelId)
    if (!channel) return null
    return channel.kind === 'channel' ? `#${channel.name}` : 'a direct message'
  }
  const failed = update.error ?? remove.error

  return (
    <div className="sf flex min-h-0 flex-1 flex-col">
      {failed && (
        <p role="alert" className="sf-small px-4 pt-2 text-sf-error sm:px-6">
          {failed.message}
        </p>
      )}
      <SavedView
        items={saved.data}
        ws={ws}
        placeOf={placeOf}
        error={Boolean(error)}
        retrying={saved.isFetching}
        onRetry={() => void saved.refetch()}
        onUpdate={(id, patch) => update.mutate({ id, ...patch })}
        onRemove={(id) => remove.mutate(id)}
      />
    </div>
  )
}
