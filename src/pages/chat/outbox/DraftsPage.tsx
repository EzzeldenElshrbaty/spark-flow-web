import { lazy, Suspense, useState } from 'react'
import { useParams } from 'react-router'
import { useChannels, useDraftSaver, useDrafts } from '@/api/chat'
import { useRemoveScheduled, useScheduled, useSendScheduledNow, useSent, useUpdateScheduled, viewerZone } from '@/api/scheduled'
import type { Channel, ScheduledMessage } from '@/api/types'
import { Modal } from '@/components/sf/Modal'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { useShownError } from '@/lib/useShownError'
import { DraftsView } from '@/pages/chat/outbox/DraftsView'
import { useComposerDirectory } from '@/pages/chat/useComposerDirectory'

const RichComposer = lazy(() => import('@/pages/chat/composer/RichComposer').then((m) => ({ default: m.RichComposer })))

/** Drafts & sent (spec 6.12) for the workspace on screen, in the main pane (full screen on phones). */
export function DraftsPage() {
  const { ws = '' } = useParams()
  const { workspace } = useCurrentWorkspace()
  const drafts = useDrafts(workspace?.id)
  const scheduled = useScheduled(workspace?.id)
  const sent = useSent(workspace?.id)
  // Each kept through Try again and live refetches, so the error doesn't flip back to the skeleton.
  const errors = [useShownError(drafts), useShownError(scheduled), useShownError(sent)]
  const error = errors.find(Boolean)
  const channels = useChannels(workspace?.id).data ?? []
  const saveDraft = useDraftSaver()
  const update = useUpdateScheduled()
  const remove = useRemoveScheduled()
  const sendNow = useSendScheduledNow()
  const [editing, setEditing] = useState<ScheduledMessage | null>(null)

  const placeOf = (channelId: string) => {
    const channel = channels.find((c) => c.id === channelId)
    if (!channel) return null
    return channel.kind === 'channel' ? `#${channel.name}` : 'a direct message'
  }
  const failed = update.error ?? remove.error ?? sendNow.error

  return (
    <div className="sf flex min-h-0 flex-1 flex-col">
      {failed && !editing && (
        <p role="alert" className="sf-small px-4 pt-2 text-sf-error sm:px-6">
          {failed.message}
        </p>
      )}
      <DraftsView
        drafts={drafts.data}
        scheduled={scheduled.data}
        sent={sent.data}
        ws={ws}
        placeOf={placeOf}
        zone={viewerZone()}
        error={Boolean(error)}
        retrying={drafts.isFetching || scheduled.isFetching || sent.isFetching}
        onRetry={() => void Promise.all([drafts.refetch(), scheduled.refetch(), sent.refetch()])}
        onDeleteDraft={(d) => void saveDraft(d.channelId, [], d.rootId)}
        onSendNow={(id) => sendNow.mutate(id)}
        onReschedule={(id, at) => update.mutate({ id, sendAt: at.toISOString() })}
        onEdit={setEditing}
        onDelete={(id) => remove.mutate(id)}
      />
      {editing && workspace && (
        <EditScheduled item={editing} workspaceId={workspace.id} channel={channels.find((c) => c.id === editing.channelId)} onDone={() => setEditing(null)} />
      )}
    </div>
  )
}

/** Edit on a scheduled message: its text in the rich editor, in a dialog; Save keeps its time. */
function EditScheduled({ item, workspaceId, channel, onDone }: { item: ScheduledMessage; workspaceId: string; channel: Channel | undefined; onDone: () => void }) {
  const directory = useComposerDirectory(workspaceId, channel?.memberIds)
  const update = useUpdateScheduled()
  return (
    <Modal open onClose={onDone} title="Edit scheduled message">
      <Suspense fallback={<div aria-hidden className="h-[106px] animate-pulse rounded-sf-md bg-sf-surface-hover" />}>
        <RichComposer
          mode="edit"
          placeholder="Edit message"
          initialBody={item.body}
          directory={directory}
          error={update.error}
          onCancel={onDone}
          onSend={(body) => update.mutateAsync({ id: item.id, body }).then(onDone)}
        />
      </Suspense>
    </Modal>
  )
}
