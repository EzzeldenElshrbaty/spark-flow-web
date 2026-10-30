import { lazy, Suspense, useState } from 'react'
import { useSchedule, viewerZone } from '@/api/scheduled'
import { useDraftSaver, useDrafts } from '@/api/chat'
import type { Channel } from '@/api/types'
import { Checkbox } from '@/components/sf/Toggle'
import type { Body } from '@/lib/messageBody'
import { useChannelInvite } from '@/pages/chat/composer/useChannelInvite'
import { useGroupConfirm } from '@/pages/chat/composer/useGroupConfirm'
import { useSnippet } from '@/pages/chat/snippets/useSnippet'
import { useFlowFilePicker } from '@/pages/chat/files/FilePicker'
import { useComposerDirectory } from '@/pages/chat/useComposerDirectory'
import { UploadTray } from '@/pages/chat/uploads/UploadTray'
import { paneDrop, useUploads } from '@/pages/chat/uploads/useUploads'


const RichComposer = lazy(() => import('@/pages/chat/composer/RichComposer').then((m) => ({ default: m.RichComposer })))

const skeleton = <div aria-hidden className="h-[74px] animate-pulse rounded-lg bg-surface-muted" />

/**
 * A thread's reply box (spec 6.7): the rich composer with its formatting row hidden until Aa, a draft per thread, and
 * "Also send to #channel" under it, unchecked each time.
 */
export function ThreadComposer({
  channel,
  rootId,
  sendTo,
  error,
  onSend,
}: {
  channel: Channel
  rootId: string
  /** Where Also send goes: "#backend", or the people of a DM. */
  sendTo: string
  error?: Error | null
  onSend: (body: Body, alsoInChannel: boolean, fileIds: string[]) => Promise<unknown>
}) {
  const drafts = useDrafts(channel.workspaceId)
  const saveDraft = useDraftSaver()
  const directory = useComposerDirectory(channel.workspaceId, channel.memberIds)
  const [also, setAlso] = useState(false)
  // A thread's own tray (spec 6.9): its files go with the reply.
  const uploads = useUploads(channel.id)
  // @channel or @here to more than 25 members asks first (spec 6.8).
  const loud = useGroupConfirm(channel.kind === 'channel' ? `#${channel.name}` : 'this conversation', channel.memberIds.length)
  // Someone mentioned who isn't in the channel: add them, or send without them (spec 6.8).
  const invite = useChannelInvite(channel, directory.users)
  const schedule = useSchedule()
  const flowFiles = useFlowFilePicker(channel.workspaceId, uploads.addExisting)
  // A snippet from the thread box is a reply (spec 6.9), never also sent to the channel.
  const snippet = useSnippet({
    channelId: channel.id,
    where: 'the thread',
    send: (file, message) => loud.confirm(message).then(() => invite.confirm(message)).then(() => onSend(message, false, [file.id])),
  })
  if (drafts.isPending) return skeleton
  const draft = drafts.data?.find((d) => d.channelId === channel.id && d.rootId === rootId)
  return (
    <div className="sf flex flex-col gap-2" {...paneDrop(true, uploads.add)}>
      {loud.dialog}
      {invite.dialog}
      {snippet.dialog}
      {flowFiles.dialog}
      <Suspense fallback={skeleton}>
        <RichComposer
          key={rootId}
          placeholder="Reply in the thread"
          initialBody={draft?.body}
          showFormatting={false}
          onSend={(body) => {
            // The cards that go with this reply; any added while it sends stay in the tray.
            const sent = uploads.items.filter((i) => i.status === 'ready').map((i) => i.key)
            return loud
              .confirm(body)
              .then(() => invite.confirm(body))
              .then(() => onSend(body, also, uploads.ready.map((f) => f.id)))
              .then(() => {
                setAlso(false)
                uploads.clear(sent)
              })
          }}
          // A scheduled reply stays in the thread: with Also send ticked, Schedule steps aside.
          onSchedule={
            also
              ? undefined
              : (body, at) =>
                  loud
                    .confirm(body)
                    .then(() => invite.confirm(body))
                    .then(() => schedule.mutateAsync({ channelId: channel.id, rootId, body, sendAt: at.toISOString(), tz: viewerZone() }))
          }
          onDraft={(body) => saveDraft(channel.id, body, rootId)}
          error={error ?? schedule.error}
          directory={directory}
          onSnippet={snippet.open}
          files={{
            tray: <UploadTray uploads={uploads.items} refused={uploads.refused} onRemove={uploads.remove} onRetry={uploads.retry} />,
            onAdd: uploads.add,
            ready: uploads.ready.length,
            waiting: uploads.waiting,
            fromFlow: flowFiles.open,
          }}
        />
      </Suspense>
      <Checkbox checked={also} onChange={setAlso}>
        Also send to {sendTo}
      </Checkbox>
    </div>
  )
}
